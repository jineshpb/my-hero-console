import express, { Router } from "express";
import { ingestDoorOpening, ingestHeartbeat, ingestSosPress } from "./db.js";

const PREFIXES = ["/api/v1/sos", "/api/sos"];

export const WEBHOOK_CONTRACT = {
  status: {
    method: "POST",
    paths: PREFIXES.map((prefix) => `${prefix}/status`),
    auth: "hash must equal the kiosk status hash (not computed per ping)",
    body: {
      kitId: "required",
      localTimeStamp: "required",
      hash: "required",
      deviceId: "optional when statusext=1",
      batteryPercent: "optional when statusext=1",
      batteryVoltage: "optional when statusext=1",
      wifiRssi: "optional when statusext=1",
      uptimeSec: "optional when statusext=1",
      bootCount: "optional when statusext=1",
      resetReason: "optional when statusext=1",
      rfidOk: "optional when statusext=1",
    },
  },
  trigger: {
    method: "POST",
    paths: PREFIXES.map((prefix) => `${prefix}/trigger`),
    auth: "hash = sha256(kitId-unknown-localTimeStamp-attemptNo-kitSecret)",
    body: {
      kitId: "required",
      triggeredBy: "optional, firmware often unknown",
      localTimeStamp: "required",
      attemptNo: "required integer >= 1",
      hash: "required",
    },
  },
  door: {
    method: "POST",
    paths: PREFIXES.map((prefix) => `${prefix}/door`),
    auth: "hash = sha256(kitId-triggeredBy-localTimeStamp-attemptNo-kitSecret)",
    body: {
      kitId: "required",
      triggeredBy: "optional, RFID or SOS button",
      gpio: "optional, servo GPIO 33",
      localTimeStamp: "required",
      attemptNo: "required integer >= 1",
      hash: "required",
    },
  },
};

const kitLabel = (body) => {
  const kitId = typeof body?.kitId === "string" ? body.kitId.trim() : "";
  return kitId || "-";
};

const sendIngest = async (res, kind, body, work) => {
  try {
    const row = await work();
    console.log(`webhook ${kind} kit=${kitLabel(body)} ok id=${row.id}`);
    res.status(200).json({ ok: true, id: row.id, receivedAt: row.received_at });
  } catch (error) {
    const status = error.status || 500;
    console.warn(`webhook ${kind} kit=${kitLabel(body)} ${status} ${error.message}`);
    res.status(status).json({ error: error.message });
  }
};

const jsonParser = express.json({
  limit: "32kb",
  type: () => true,
});

const jsonError = (err, _req, res, next) => {
  if (err instanceof SyntaxError) {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }
  next(err);
};

export const mountWebhooks = (app) => {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ ok: true, webhooks: WEBHOOK_CONTRACT });
  });

  router.post("/status", async (req, res) => {
    await sendIngest(res, "status", req.body, () => ingestHeartbeat(req.body || {}));
  });

  router.post("/trigger", async (req, res) => {
    await sendIngest(res, "trigger", req.body, () => ingestSosPress(req.body || {}));
  });

  router.post("/door", async (req, res) => {
    await sendIngest(res, "door", req.body, () => ingestDoorOpening(req.body || {}));
  });

  app.use(PREFIXES, jsonParser, jsonError, router);
};
