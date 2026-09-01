import express from "express";
import cors from "cors";
import { getConfig, setConfig } from "./config.js";
import { listSkus, listVersions, pullFirmware, getGitInfo } from "./git.js";
import { getSku } from "./skus.js";
import {
  ESPTOOL,
  FQBN,
  cleanupWork,
  compileSku,
  identifyPort,
  listPorts,
  uploadSketch,
} from "./arduino.js";
import {
  insertFlash,
  listBoards,
  listFlashes,
  setBoardMeta,
  upsertBoard,
} from "./db.js";

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
  openSse(res);
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

    const compiled = await compileSku(sku, onProgress, { sha: requestedSha });
    work = compiled.work;
    const uploadLog = await uploadSketch(compiled.sketchDir, serialPort, onProgress);

    const gitSha = requestedSha ? requestedSha.slice(0, 7) : git.shortSha;
    const gitDirty = requestedSha ? false : git.dirty;

    insertFlash({
      mac,
      sku: sku.id,
      gitSha,
      gitDirty,
      port: serialPort,
      fqbn: FQBN,
      success: true,
      compileBytes: compiled.bytes,
      startedAt,
      finishedAt: new Date().toISOString(),
    });

    writeSse(
      res,
      progressToEvent({ phase: "done", percent: 100, label: `Wrote ${sku.id} to ${mac}` })
    );
    writeSse(res, {
      type: "result",
      ok: true,
      mac,
      sku: sku.id,
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
      compileLog: compiled.log.slice(-2000),
      uploadLog: uploadLog.slice(-2000),
    });
  } catch (error) {
    if (mac) {
      const git = await getGitInfo();
      insertFlash({
        mac,
        sku: sku.id,
        gitSha: requestedSha ? requestedSha.slice(0, 7) : git.shortSha || git.sha,
        gitDirty: requestedSha ? false : git.dirty,
        port: serialPort,
        fqbn: FQBN,
        success: false,
        error: error.message.slice(0, 2000),
        startedAt,
        finishedAt: new Date().toISOString(),
      });
    }
    writeSse(res, { type: "error", error: error.message, mac });
  } finally {
    cleanupWork(work);
    busy = null;
    res.end();
  }
});

const server = app.listen(port, () => {
  console.log(`SOS fleet console API on http://127.0.0.1:${port}`);
});
server.timeout = 0;
server.headersTimeout = 0;
server.requestTimeout = 0;
