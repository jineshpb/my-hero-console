import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { getConfig, setConfig } from "./config.js";
import { listSkus, listVersions, pullFirmware, getGitInfo } from "./git.js";
import { getSku } from "./skus.js";
import {
  ESPTOOL,
  FQBN,
  SERIAL_BAUD,
  captureSerial,
  cleanupWork,
  compileSku,
  confirmLockedChip,
  identifyPort,
  listPorts,
  lockChipOnPort,
  runMonitor,
  throwIfAborted,
  uploadSketch,
} from "./arduino.js";
import {
  bindKioskUsb,
  createKiosk,
  deleteKiosk,
  findPassingFlash,
  formatFlashLog,
  getFlash,
  getKiosk,
  initDb,
  insertFlash,
  listDoorOpenings,
  listFlashes,
  listHeartbeats,
  listKiosks,
  listSosPresses,
  markKioskProvisioned,
  nextSlot,
  setKioskMeta,
  updateFlashAccept,
  upsertKiosk,
} from "./db.js";
import { gradeAndInterpret, listAcceptSteps } from "./accept.js";
import { hostnameForKiosk, provisionKioskOverUsb } from "./provision.js";
import { mountWebhooks } from "./webhooks.js";

const app = express();
const port = Number(process.env.PORT) || 3848;

app.use(cors());
app.use(express.json({ limit: "1mb" }));
mountWebhooks(app);

let busy = null;

const writeSse = (res, payload) => {
  if (res.writableEnded || res.destroyed) {
    return;
  }
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    // Client already dropped the stream.
  }
};

const openSse = (res) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
};

const progressToEvent = (event) => ({
  type: "progress",
  phase: event.phase,
  percent: event.percent ?? 0,
  label: event.label || "",
  detail: event.detail || "",
});

const createLogStreamer = (res) => {
  let buffer = "";
  let lastPhase = "";
  let timer = null;
  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!buffer) {
      return;
    }
    writeSse(res, { type: "log", text: buffer });
    buffer = "";
  };
  return {
    append: (phase, line) => {
      if (phase && phase !== lastPhase) {
        lastPhase = phase;
        buffer += `\n=== ${phase} ===\n`;
      }
      buffer += `${line}\n`;
      if (!timer) {
        timer = setTimeout(flush, 80);
      }
    },
    flush,
  };
};

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    fqbn: FQBN,
    esptool: ESPTOOL,
    webhooks: {
      status: "/api/v1/sos/status",
      trigger: "/api/v1/sos/trigger",
      door: "/api/v1/sos/door",
    },
  });
});

app.get("/api/git", async (_req, res) => {
  res.json(await getGitInfo());
});

app.get("/api/firmware-source", (_req, res) => {
  res.json(getConfig());
});

app.put("/api/firmware-source", (req, res) => {
  res.json(
    setConfig({
      firmwareGit: req.body.firmwareGit,
      firmwareBranch: req.body.firmwareBranch,
    })
  );
});

app.get("/api/versions", async (req, res) => {
  try {
    res.json(await listVersions(req.query.limit));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/git/fetch", async (_req, res) => {
  try {
    res.json(await pullFirmware());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/skus", (_req, res) => {
  res.json(listSkus());
});

app.get("/api/ports", async (_req, res) => {
  try {
    res.json(await listPorts());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const sendDb = async (res, work) => {
  try {
    res.json(await work());
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

app.get("/api/kiosks", async (_req, res) => {
  await sendDb(res, listKiosks);
});

app.get("/api/kiosks/:id/heartbeats", async (req, res) => {
  await sendDb(res, async () => {
    const rows = await listHeartbeats(req.params.id, { limit: req.query.limit });
    if (!rows) {
      const error = new Error("Unknown kiosk");
      error.status = 404;
      throw error;
    }
    return rows;
  });
});

app.get("/api/kiosks/:id/sos-presses", async (req, res) => {
  await sendDb(res, async () => {
    const rows = await listSosPresses(req.params.id, { limit: req.query.limit });
    if (!rows) {
      const error = new Error("Unknown kiosk");
      error.status = 404;
      throw error;
    }
    return rows;
  });
});

app.get("/api/kiosks/:id/door-openings", async (req, res) => {
  await sendDb(res, async () => {
    const rows = await listDoorOpenings(req.params.id, { limit: req.query.limit });
    if (!rows) {
      const error = new Error("Unknown kiosk");
      error.status = 404;
      throw error;
    }
    return rows;
  });
});

app.post("/api/kiosks", async (req, res) => {
  await sendDb(res, async () => {
    const slot = req.body.slot || (await nextSlot());
    return createKiosk({ ...req.body, slot });
  });
});

app.delete("/api/kiosks/:id", async (req, res) => {
  await sendDb(res, async () => {
    const ok = await deleteKiosk(req.params.id);
    if (!ok) {
      const error = new Error("Unknown kiosk");
      error.status = 404;
      throw error;
    }
    return { ok: true };
  });
});

app.get("/api/boards", async (_req, res) => {
  await sendDb(res, listKiosks);
});

app.get("/api/flashes", async (req, res) => {
  await sendDb(res, () => listFlashes(typeof req.query.mac === "string" ? req.query.mac : null));
});

app.get("/api/accept/:sku", (req, res) => {
  res.json({
    sku: req.params.sku,
    steps: listAcceptSteps(req.params.sku).map((step) => ({
      id: step.id,
      label: step.label,
      required: step.required !== false,
    })),
  });
});

app.get("/api/flashes/:id/log", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).type("text/plain").send("Invalid flash id\n");
    return;
  }
  const row = await getFlash(id);
  if (!row) {
    res.status(404).type("text/plain").send("Flash not found\n");
    return;
  }
  const part = typeof req.query.part === "string" ? req.query.part : "all";
  res.setHeader("Content-Disposition", `inline; filename="flash-${id}.log"`);
  res.type("text/plain; charset=utf-8").send(formatFlashLog(row, part));
});

const patchKiosk = async (req, res) => {
  try {
    const ok = await setKioskMeta(req.params.mac, req.body);
    if (!ok) {
      res.status(404).json({ error: "Unknown kiosk. Create it in the console first." });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

app.patch("/api/kiosks/:mac", patchKiosk);
app.patch("/api/boards/:mac", patchKiosk);

app.post("/api/kiosks/:id/provision", async (req, res) => {
  const serialPort = req.body.port;
  if (!serialPort) {
    res.status(400).json({ error: "port is required" });
    return;
  }
  if (busy) {
    res.status(409).json({ error: `Busy: ${busy}` });
    return;
  }
  try {
    const kiosk = await getKiosk(req.params.id);
    if (!kiosk) {
      res.status(404).json({ error: "Unknown kiosk" });
      return;
    }
    const hostname = hostnameForKiosk(kiosk);
    if (!hostname) {
      res.status(400).json({ error: "Assign a slot before provisioning" });
      return;
    }
    busy = `provision ${hostname}`;
    const provision = await provisionKioskOverUsb({
      port: serialPort,
      hostname,
      onLog: () => {},
    });
    if (provision.ok) {
      await markKioskProvisioned(kiosk.id, hostname);
    }
    res.json(provision);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  } finally {
    busy = null;
  }
});

app.post("/api/identify", async (req, res) => {
  const serialPort = req.body.port;
  if (!serialPort) {
    res.status(400).json({ error: "port is required" });
    return;
  }
  openSse(res);
  try {
    const identity = await identifyPort(serialPort, (event) => writeSse(res, progressToEvent(event)));
    const kiosk = req.body.kioskId
      ? await bindKioskUsb(req.body.kioskId, {
          mac: identity.mac,
          chipModel: identity.chipModel,
          port: serialPort,
          usbSerial: req.body.usbSerial,
        })
      : await upsertKiosk({
          mac: identity.mac,
          chipModel: identity.chipModel,
          port: serialPort,
          usbSerial: req.body.usbSerial,
        });
    writeSse(res, { type: "result", ...identity, kioskId: kiosk.id, slot: kiosk.slot, name: kiosk.name });
  } catch (error) {
    writeSse(res, { type: "error", error: error.message });
  }
  res.end();
});

app.post("/api/flash", async (req, res) => {
  const sku = getSku(listSkus(), req.body.sku);
  const serialPort = req.body.port;
  if (!sku || !serialPort) {
    res.status(400).json({ error: "sku and port are required" });
    return;
  }
  if (busy) {
    res.status(409).json({ error: `Busy: ${busy}` });
    return;
  }

  busy = `flash ${sku.id} → ${serialPort}`;
  const startedAt = new Date().toISOString();
  const requestedSha = typeof req.body.sha === "string" && req.body.sha ? req.body.sha : null;
  const force = Boolean(req.body.force);
  let work = null;
  let mac = req.body.mac || null;
  let flashId = null;
  let compileLog = "";
  let uploadLog = "";
  const abort = new AbortController();
  const { signal } = abort;
  res.on("close", () => abort.abort());
  openSse(res);
  const logStream = createLogStreamer(res);
  const onProgress = (event) => writeSse(res, progressToEvent(event));

  try {
    const git = await getGitInfo();
    writeSse(res, progressToEvent({ phase: "identify", percent: 1, label: `Lock chip on ${serialPort}` }));
    const lock = await lockChipOnPort(serialPort, onProgress, {
      signal,
      usbSerial: req.body.usbSerial,
    });
    mac = lock.mac;
    throwIfAborted(signal);
    const kiosk = req.body.kioskId
      ? await bindKioskUsb(req.body.kioskId, {
          mac,
          chipModel: lock.chipModel,
          port: serialPort,
          usbSerial: lock.usbSerial,
        })
      : await upsertKiosk({
          mac,
          chipModel: lock.chipModel,
          port: serialPort,
          usbSerial: lock.usbSerial,
        });

    const gitSha = requestedSha ? requestedSha.slice(0, 7) : git.shortSha;
    const gitDirty = requestedSha ? false : git.dirty;
    if (!force && gitSha && !gitDirty) {
      const existing = await findPassingFlash({ mac, sku: sku.id, gitSha });
      if (existing) {
        writeSse(
          res,
          progressToEvent({
            phase: "done",
            percent: 100,
            label: `Already on ${sku.id} @ ${gitSha}`,
            detail: "Passing write on this MAC — skip compile and upload",
          })
        );
        writeSse(res, {
          type: "result",
          ok: true,
          skipped: true,
          mac,
          sku: sku.id,
          flashId: existing.id,
          kioskId: kiosk.id,
          gitSha: existing.git_sha,
          finishedAt: existing.finished_at,
          git: {
            ...git,
            shortSha: gitSha,
            sha: requestedSha || git.sha,
            dirty: gitDirty,
            subject: requestedSha ? `commit ${gitSha}` : git.subject,
          },
        });
        return;
      }
    }

    const compiled = await compileSku(sku, onProgress, {
      sha: requestedSha,
      signal,
      onLog: (line) => logStream.append("compile", line),
    });
    work = compiled.work;
    compileLog = compiled.log;
    throwIfAborted(signal);

    writeSse(
      res,
      progressToEvent({
        phase: "identify",
        percent: 66,
        label: `Re-check ${lock.mac} on ${serialPort}`,
        detail: "Port was not held during compile",
      })
    );
    await confirmLockedChip(lock, onProgress, { signal });
    throwIfAborted(signal);

    uploadLog = await uploadSketch(compiled.sketchDir, serialPort, onProgress, (line) =>
      logStream.append("upload", line),
      { inputDir: compiled.outputDir, signal }
    );
    throwIfAborted(signal);

    flashId = await insertFlash({
      mac,
      sku: sku.id,
      gitSha,
      gitDirty,
      port: serialPort,
      fqbn: FQBN,
      success: true,
      compileBytes: compiled.bytes,
      compileLog,
      uploadLog,
      startedAt,
      finishedAt: new Date().toISOString(),
    });

    let serialLog = "";
    let accept = null;
    try {
      serialLog = await captureSerial(serialPort, onProgress, (line) => logStream.append("serial", line), {
        signal,
      });
    } catch (serialError) {
      throwIfAborted(signal);
      serialLog = serialError.log || serialError.message || "";
      logStream.append("serial", serialError.message);
    }
    throwIfAborted(signal);
    accept = await gradeAndInterpret(sku.id, serialLog);
    logStream.append(
      "accept",
      `${accept.score} ${accept.grade}: ${accept.summary}${accept.llm ? `\n${accept.llm}` : ""}`
    );
    await updateFlashAccept(flashId, accept, serialLog);

    let provision = null;
    if (accept.grade !== "fail") {
      const hostname = hostnameForKiosk(kiosk);
      if (hostname) {
        writeSse(
          res,
          progressToEvent({
            phase: "serial",
            percent: 99,
            label: `Provision ${hostname}`,
            detail: "Write kit identity over USB",
          })
        );
        try {
          throwIfAborted(signal);
          provision = await provisionKioskOverUsb({
            port: serialPort,
            hostname,
            onLog: (line) => logStream.append("serial", line),
          });
          if (provision.ok) {
            await markKioskProvisioned(kiosk.id, hostname);
            logStream.append("serial", `provisioned ${hostname}`);
          } else {
            logStream.append(
              "serial",
              `provision sent ${hostname} but chip did not ACK MHCFG OK — captive portal still required until firmware handles MHCFG`
            );
          }
        } catch (provisionError) {
          throwIfAborted(signal);
          provision = { ok: false, hostname, acked: false, error: provisionError.message };
          logStream.append("serial", `provision failed: ${provisionError.message}`);
        }
      }
    }
    logStream.flush();

    const acceptLabel = `Accept ${accept.score} ${accept.grade}${accept.grade === "fail" ? ` — ${accept.summary}` : ""}`;
    writeSse(
      res,
      progressToEvent({
        phase: "done",
        percent: 100,
        label: `Wrote ${sku.id} to ${mac} · ${acceptLabel}`,
      })
    );
    writeSse(res, {
      type: "result",
      ok: accept.grade !== "fail",
      mac,
      sku: sku.id,
      flashId,
      kioskId: kiosk.id,
      provision,
      cached: Boolean(compiled.cached),
      accept,
      git: {
        ...git,
        shortSha: gitSha,
        sha: requestedSha || git.sha,
        dirty: gitDirty,
        subject: requestedSha
          ? `commit ${gitSha}`
          : git.subject,
      },
      bytes: compiled.bytes,
    });
  } catch (error) {
    logStream.flush();
    const cancelled = Boolean(error.cancelled || signal.aborted);
    if (error.phase === "compile") {
      compileLog = error.log || compileLog;
    } else if (error.stdout || error.log) {
      uploadLog = error.stdout || error.log;
    }
    if (mac && !flashId) {
      const git = await getGitInfo();
      flashId = await insertFlash({
        mac,
        sku: sku.id,
        gitSha: requestedSha ? requestedSha.slice(0, 7) : git.shortSha || git.sha,
        gitDirty: requestedSha ? false : git.dirty,
        port: serialPort,
        fqbn: FQBN,
        success: false,
        error: (cancelled ? "Cancelled" : error?.message || String(error)).slice(0, 2000),
        compileLog,
        uploadLog,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    }
    if (!res.writableEnded) {
      writeSse(res, {
        type: "error",
        error: cancelled ? "Cancelled" : error?.message || String(error),
        mac,
        flashId,
      });
    }
  } finally {
    cleanupWork(work);
    busy = null;
    if (!res.writableEnded) {
      res.end();
    }
  }
});

app.post("/api/monitor", async (req, res) => {
  const serialPort = req.body.port;
  if (!serialPort) {
    res.status(400).json({ error: "port is required" });
    return;
  }
  if (busy) {
    res.status(409).json({ error: `Busy: ${busy}` });
    return;
  }

  busy = `monitor ${serialPort}`;
  const abort = new AbortController();
  res.on("close", () => abort.abort());
  openSse(res);
  const logStream = createLogStreamer(res);
  writeSse(
    res,
    progressToEvent({
      phase: "serial",
      percent: 100,
      label: `Serial ${serialPort} @ ${SERIAL_BAUD}`,
      detail: "Listening…",
    })
  );

  try {
    await runMonitor(serialPort, {
      baud: Number(req.body.baud) || SERIAL_BAUD,
      signal: abort.signal,
      onLog: (line) => logStream.append("serial", line),
    });
    logStream.flush();
    if (!res.writableEnded) {
      writeSse(res, { type: "result", ok: true });
    }
  } catch (error) {
    logStream.flush();
    if (!res.writableEnded) {
      writeSse(res, { type: "error", error: error.message });
    }
  } finally {
    busy = null;
    if (!res.writableEnded) {
      res.end();
    }
  }
});

try {
  await initDb();
} catch (error) {
  console.error("Postgres is required.");
  console.error(error.message);
  process.exit(1);
}

const clientDist = process.env.CLIENT_DIST
  ? path.resolve(process.env.CLIENT_DIST)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../client/dist");
if (fs.existsSync(path.join(clientDist, "index.html"))) {
  app.use(express.static(clientDist, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

const host = process.env.LISTEN_HOST || "0.0.0.0";
const server = app.listen(port, host, () => {
  console.log(`SOS fleet console API on http://${host}:${port}`);
  console.log(`Webhooks POST /api/v1/sos/status | /trigger | /door`);
  if (fs.existsSync(path.join(clientDist, "index.html"))) {
    console.log(`UI ${clientDist}`);
  }
});
server.timeout = 0;
server.headersTimeout = 0;
server.requestTimeout = 0;
