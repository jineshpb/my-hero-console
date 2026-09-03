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
  identifyPort,
  listPorts,
  runMonitor,
  uploadSketch,
} from "./arduino.js";
import {
  formatFlashLog,
  getFlash,
  insertFlash,
  listBoards,
  listFlashes,
  setBoardMeta,
  updateFlashAccept,
  upsertBoard,
} from "./db.js";
import { gradeAndInterpret, listAcceptSteps } from "./accept.js";

const app = express();
const port = Number(process.env.PORT) || 3848;

app.use(cors());
app.use(express.json());

let busy = null;

const writeSse = (res, payload) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
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
  res.json({ ok: true, fqbn: FQBN, esptool: ESPTOOL });
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

app.get("/api/boards", (_req, res) => {
  res.json(listBoards());
});

app.get("/api/flashes", (req, res) => {
  res.json(listFlashes(typeof req.query.mac === "string" ? req.query.mac : null));
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

app.get("/api/flashes/:id/log", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).type("text/plain").send("Invalid flash id\n");
    return;
  }
  const row = getFlash(id);
  if (!row) {
    res.status(404).type("text/plain").send("Flash not found\n");
    return;
  }
  const part = typeof req.query.part === "string" ? req.query.part : "all";
  res.setHeader("Content-Disposition", `inline; filename="flash-${id}.log"`);
  res.type("text/plain; charset=utf-8").send(formatFlashLog(row, part));
});

app.patch("/api/boards/:mac", (req, res) => {
  const ok = setBoardMeta(req.params.mac, {
    slot: req.body.slot,
    notes: req.body.notes,
  });
  if (!ok) {
    res.status(404).json({ error: "Unknown board. Identify or flash it first." });
    return;
  }
  res.json({ ok: true });
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
    upsertBoard({
      mac: identity.mac,
      chipModel: identity.chipModel,
      port: serialPort,
      usbSerial: req.body.usbSerial,
    });
    writeSse(res, { type: "result", ...identity });
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
  let work = null;
  let mac = req.body.mac || null;
  let compileLog = "";
  let uploadLog = "";
  openSse(res);
  const logStream = createLogStreamer(res);
  const onProgress = (event) => writeSse(res, progressToEvent(event));

  try {
    const git = await getGitInfo();
    writeSse(res, progressToEvent({ phase: "identify", percent: 1, label: `Identify ${serialPort}` }));
    const identity = await identifyPort(serialPort, onProgress);
    mac = identity.mac;
    upsertBoard({
      mac,
      chipModel: identity.chipModel,
      port: serialPort,
      usbSerial: req.body.usbSerial,
    });

    const compiled = await compileSku(sku, onProgress, {
      sha: requestedSha,
      onLog: (line) => logStream.append("compile", line),
    });
    work = compiled.work;
    compileLog = compiled.log;
    uploadLog = await uploadSketch(compiled.sketchDir, serialPort, onProgress, (line) =>
      logStream.append("upload", line),
      { inputDir: compiled.outputDir }
    );

    const gitSha = requestedSha ? requestedSha.slice(0, 7) : git.shortSha;
    const gitDirty = requestedSha ? false : git.dirty;

    const flashId = insertFlash({
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
      serialLog = await captureSerial(serialPort, onProgress, (line) => logStream.append("serial", line));
    } catch (serialError) {
      serialLog = serialError.log || serialError.message || "";
      logStream.append("serial", serialError.message);
    }
    accept = await gradeAndInterpret(sku.id, serialLog);
    logStream.append(
      "accept",
      `${accept.score} ${accept.grade}: ${accept.summary}${accept.llm ? `\n${accept.llm}` : ""}`
    );
    updateFlashAccept(flashId, accept, serialLog);
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
    if (error.phase === "compile") {
      compileLog = error.log || compileLog;
    } else if (error.stdout || error.log) {
      uploadLog = error.stdout || error.log;
    }
    let flashId = null;
    if (mac) {
      const git = await getGitInfo();
      flashId = insertFlash({
        mac,
        sku: sku.id,
        gitSha: requestedSha ? requestedSha.slice(0, 7) : git.shortSha || git.sha,
        gitDirty: requestedSha ? false : git.dirty,
        port: serialPort,
        fqbn: FQBN,
        success: false,
        error: error.message.slice(0, 2000),
        compileLog,
        uploadLog,
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    }
    writeSse(res, { type: "error", error: error.message, mac, flashId });
  } finally {
    cleanupWork(work);
    busy = null;
    res.end();
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

const server = app.listen(port, () => {
  console.log(`SOS fleet console API on http://127.0.0.1:${port}`);
});
server.timeout = 0;
server.headersTimeout = 0;
server.requestTimeout = 0;
