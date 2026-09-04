import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { DATA_DIR } from "./config.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(dir, "schema.sql");
const sqlitePath = path.join(DATA_DIR, "fleet.sqlite");

const LOCAL_DATABASE_URL = "postgres://myhero:myhero@127.0.0.1:5432/myhero";

const describeDb = (url) => {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname}`;
  } catch {
    return "invalid DATABASE_URL";
  }
};

const poolOptions = (connectionString) => ({
  connectionString,
  connectionTimeoutMillis: 8000,
});

export let DATABASE_URL = process.env.DATABASE_URL || LOCAL_DATABASE_URL;

let pool = new pg.Pool(poolOptions(DATABASE_URL));

const openPool = (url) => {
  DATABASE_URL = url;
  pool = new pg.Pool(poolOptions(url));
};

export const LOG_TAIL_BYTES = 512 * 1024;

export const tailLog = (text) => {
  if (!text) {
    return "";
  }
  const buf = Buffer.from(String(text), "utf8");
  if (buf.length <= LOG_TAIL_BYTES) {
    return buf.toString("utf8");
  }
  let start = buf.length - LOG_TAIL_BYTES;
  while (start < buf.length && (buf[start] & 0b11000000) === 0b10000000) {
    start += 1;
  }
  return `…[truncated to last ${LOG_TAIL_BYTES} bytes]\n${buf.subarray(start).toString("utf8")}`;
};

export const nameFromSlot = (slot) => {
  const digits = String(slot ?? "").trim().replace(/\D/g, "");
  if (!digits) {
    return null;
  }
  return `my-hro-kiosk-${digits.padStart(2, "0")}`;
};

const bool = (value) => value === true || value === 1 || value === "1" || value === "t";

const KIOSK_LIST_SQL = `
  SELECT k.*,
         (SELECT sku FROM flashes WHERE kiosk_id = k.id AND success = true ORDER BY id DESC LIMIT 1) AS last_sku,
         (SELECT git_sha FROM flashes WHERE kiosk_id = k.id AND success = true ORDER BY id DESC LIMIT 1) AS last_sha,
         (SELECT finished_at FROM flashes WHERE kiosk_id = k.id ORDER BY id DESC LIMIT 1) AS last_write_at
  FROM kiosks k
`;

const FLASH_LIST_SQL = `
  SELECT id, kiosk_id, mac, sku, git_sha, git_dirty, port, fqbn, success, error,
         compile_bytes, started_at, finished_at, serial_grade, serial_score, serial_report,
         CASE WHEN compile_log IS NOT NULL AND length(compile_log) > 0 THEN true ELSE false END AS has_compile_log,
         CASE WHEN upload_log IS NOT NULL AND length(upload_log) > 0 THEN true ELSE false END AS has_upload_log,
         CASE WHEN serial_log IS NOT NULL AND length(serial_log) > 0 THEN true ELSE false END AS has_serial_log
  FROM flashes
`;

const migrateSqliteIfEmpty = async (client) => {
  const { rows } = await client.query("SELECT COUNT(*)::int AS count FROM kiosks");
  if (rows[0].count > 0) {
    return;
  }
  if (!fs.existsSync(sqlitePath)) {
    return;
  }

  const { default: Database } = await import("better-sqlite3");
  const sqlite = new Database(sqlitePath, { readonly: true });
  try {
    const boards = sqlite.prepare("SELECT * FROM boards").all();
    const flashes = sqlite.prepare("SELECT * FROM flashes ORDER BY id").all();
    const macToId = new Map();

    for (const board of boards) {
      const inserted = await client.query(
        `INSERT INTO kiosks
           (mac, name, slot, usb_serial, chip_model, notes, last_port, flash_count, first_seen_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (mac) DO NOTHING
         RETURNING id`,
        [
          board.mac,
          nameFromSlot(board.slot),
          board.slot || null,
          board.usb_serial || null,
          board.chip_model || null,
          board.notes || null,
          board.last_port || null,
          board.flash_count || 0,
          board.first_seen_at,
          board.last_seen_at,
        ]
      );
      const id =
        inserted.rows[0]?.id ||
        (await client.query("SELECT id FROM kiosks WHERE mac = $1", [board.mac])).rows[0].id;
      macToId.set(board.mac, id);
    }

    for (const row of flashes) {
      let kioskId = macToId.get(row.mac);
      if (!kioskId) {
        const created = await client.query(
          `INSERT INTO kiosks (mac, first_seen_at, last_seen_at)
           VALUES ($1, $2, $2)
           ON CONFLICT (mac) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at
           RETURNING id`,
          [row.mac, row.finished_at || row.started_at || new Date().toISOString()]
        );
        kioskId = created.rows[0].id;
        macToId.set(row.mac, kioskId);
      }
      await client.query(
        `INSERT INTO flashes
           (id, kiosk_id, mac, sku, git_sha, git_dirty, port, fqbn, success, error, compile_bytes,
            started_at, finished_at, compile_log, upload_log, serial_log, serial_grade, serial_score, serial_report)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         ON CONFLICT (id) DO NOTHING`,
        [
          row.id,
          kioskId,
          row.mac,
          row.sku,
          row.git_sha || null,
          bool(row.git_dirty),
          row.port || null,
          row.fqbn || null,
          bool(row.success),
          row.error || null,
          row.compile_bytes ?? null,
          row.started_at,
          row.finished_at,
          row.compile_log || null,
          row.upload_log || null,
          row.serial_log || null,
          row.serial_grade || null,
          row.serial_score || null,
          row.serial_report || null,
        ]
      );
    }

    await client.query(
      `SELECT setval(pg_get_serial_sequence('flashes', 'id'), COALESCE((SELECT MAX(id) FROM flashes), 1), true)`
    );
    console.log(
      `Imported ${boards.length} kiosk${boards.length === 1 ? "" : "s"} and ${flashes.length} flash${flashes.length === 1 ? "" : "es"} from SQLite`
    );
  } finally {
    sqlite.close();
  }
};

const addKioskIdentityColumns = async (client) => {
  await client.query("ALTER TABLE kiosks ALTER COLUMN mac DROP NOT NULL");
  await client.query("ALTER TABLE kiosks ADD COLUMN IF NOT EXISTS provisioned_at TIMESTAMPTZ");
  await client.query("ALTER TABLE kiosks ADD COLUMN IF NOT EXISTS provisioned_hostname TEXT");
  await client.query("ALTER TABLE kiosks ADD COLUMN IF NOT EXISTS kit_id TEXT");
  await client.query("ALTER TABLE kiosks ADD COLUMN IF NOT EXISTS kit_secret TEXT");
  await client.query("ALTER TABLE kiosks ADD COLUMN IF NOT EXISTS status_hash TEXT");
  await client.query("ALTER TABLE kiosks ADD COLUMN IF NOT EXISTS status_extended TEXT");
  await client.query("ALTER TABLE kiosks ADD COLUMN IF NOT EXISTS access_pin TEXT");
  await client.query("ALTER TABLE kiosks ADD COLUMN IF NOT EXISTS device_id TEXT");
  await client.query("ALTER TABLE kiosks ADD COLUMN IF NOT EXISTS device_name TEXT");
  await client.query("ALTER TABLE kiosks ADD COLUMN IF NOT EXISTS location_label TEXT");
  await client.query("ALTER TABLE kiosks ADD COLUMN IF NOT EXISTS webhook_url TEXT");
  await client.query("ALTER TABLE kiosks ADD COLUMN IF NOT EXISTS heartbeat_url TEXT");
  await client.query("ALTER TABLE kiosks ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ");
  await client.query("ALTER TABLE kiosks ADD COLUMN IF NOT EXISTS last_sos_at TIMESTAMPTZ");
  await client.query("ALTER TABLE kiosks ADD COLUMN IF NOT EXISTS last_door_at TIMESTAMPTZ");
};

export const initDb = async () => {
  const preferred = process.env.DATABASE_URL || LOCAL_DATABASE_URL;
  const composeUrl = "postgres://myhero:myhero@postgres:5432/myhero";
  const urls = [...new Set([preferred, composeUrl, LOCAL_DATABASE_URL])];
  let lastError;

  for (const url of urls) {
    if (url !== DATABASE_URL) {
      await pool.end().catch(() => {});
      openPool(url);
    }
    try {
      const client = await pool.connect();
      try {
        const existing = await client.query(
          "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'kiosks'"
        );
        if (existing.rowCount) {
          await addKioskIdentityColumns(client);
        }
        const schema = fs.readFileSync(schemaPath, "utf8");
        for (const statement of schema
          .split(";")
          .map((part) => part.trim())
          .filter(Boolean)) {
          await client.query(statement);
        }
        await addKioskIdentityColumns(client);
        await client.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS kiosks_slot_unique
            ON kiosks (slot)
            WHERE slot IS NOT NULL AND btrim(slot) <> ''
        `);
        await client.query(`
          CREATE UNIQUE INDEX IF NOT EXISTS kiosks_kit_id_unique
            ON kiosks (kit_id)
            WHERE kit_id IS NOT NULL AND btrim(kit_id) <> ''
        `);
        await client.query("ALTER TABLE heartbeats ADD COLUMN IF NOT EXISTS kit_id TEXT");
        await client.query(`
          UPDATE heartbeats h
          SET kit_id = k.kit_id
          FROM kiosks k
          WHERE h.kiosk_id = k.id AND (h.kit_id IS NULL OR btrim(h.kit_id) = '')
        `);
        await client.query(`
          UPDATE heartbeats
          SET payload = payload - 'hash'
          WHERE payload ? 'hash'
        `);
        await client.query("ALTER TABLE heartbeats ALTER COLUMN battery_percent TYPE NUMERIC(5,1) USING battery_percent::numeric");
        await client.query("ALTER TABLE heartbeats ALTER COLUMN battery_voltage TYPE NUMERIC(8,3) USING battery_voltage::numeric");
        await migrateSqliteIfEmpty(client);
      } finally {
        client.release();
      }
      if (url !== preferred) {
        console.warn(`Using local Postgres ${describeDb(url)}; remote ${describeDb(preferred)} is unreachable`);
      } else {
        console.log(`Postgres ${describeDb(url)}`);
      }
      return;
    } catch (error) {
      lastError = error;
      console.error(`Postgres ${describeDb(url)} failed: ${error.message}`);
    }
  }

  throw lastError;
};

export const upsertKiosk = async ({ mac, usbSerial, chipModel, port }) => {
  if (!mac) {
    throw new Error("mac is required");
  }
  const { rows } = await pool.query(
    `INSERT INTO kiosks (mac, usb_serial, chip_model, last_port, first_seen_at, last_seen_at, updated_at)
     VALUES ($1, $2, $3, $4, now(), now(), now())
     ON CONFLICT (mac) DO UPDATE SET
       usb_serial = COALESCE(EXCLUDED.usb_serial, kiosks.usb_serial),
       chip_model = COALESCE(EXCLUDED.chip_model, kiosks.chip_model),
       last_port = COALESCE(EXCLUDED.last_port, kiosks.last_port),
       last_seen_at = now(),
       updated_at = now()
     RETURNING *`,
    [mac, usbSerial || null, chipModel || null, port || null]
  );
  return rows[0];
};

const isUuid = (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));

export const normalizeSlot = (slot) => {
  const digits = String(slot ?? "").trim().replace(/\D/g, "");
  if (!digits) {
    return null;
  }
  return digits.padStart(2, "0");
};

const trimToNull = (value) => {
  if (value == null) {
    return null;
  }
  const text = String(value).trim();
  return text.length ? text : null;
};

const clampText = (value, max) => {
  if (value == null) {
    return null;
  }
  return value.length <= max ? value : value.slice(0, max);
};

const SECRET_IDENTITY_KEYS = new Set(["kit_secret", "status_hash", "access_pin"]);

const IDENTITY_LIMITS = {
  kit_id: 47,
  kit_secret: 79,
  status_hash: 79,
  status_extended: 3,
  access_pin: 17,
  device_id: 31,
  device_name: 63,
  location_label: 63,
  webhook_url: 159,
  heartbeat_url: 159,
};

const derivedIdentity = (slot) => {
  if (!slot) {
    return { device_id: null, device_name: null, location_label: null };
  }
  return {
    device_id: `esp32-sos-${slot}`,
    device_name: `My Hero Kiosk ${slot}`,
    location_label: `my hero location ${slot}`,
  };
};

const normalizeStatusExtended = (value, fallback = "0") => {
  if (value == null) {
    return fallback;
  }
  const raw = String(value).trim().toLowerCase();
  if (!raw) {
    return fallback;
  }
  return raw === "1" || raw === "y" || raw === "on" ? "1" : "0";
};

const readKitIdentity = (body = {}, current = {}) => {
  const identity = {};
  for (const [key, max] of Object.entries(IDENTITY_LIMITS)) {
    if (body[key] === undefined) {
      identity[key] = current[key] ?? null;
      continue;
    }
    const next = clampText(trimToNull(body[key]), max);
    if (SECRET_IDENTITY_KEYS.has(key) && next == null) {
      identity[key] = current[key] ?? null;
      continue;
    }
    identity[key] = next;
  }
  identity.status_extended = normalizeStatusExtended(
    identity.status_extended,
    current.status_extended || "0"
  );
  return identity;
};

const fillDerivedIdentity = (identity, slot) => {
  const derived = derivedIdentity(slot);
  return {
    ...identity,
    device_id: identity.device_id || derived.device_id,
    device_name: identity.device_name || derived.device_name,
    location_label: identity.location_label || derived.location_label,
  };
};

export const getKiosk = async (ref) => {
  if (!ref) {
    return null;
  }
  if (isUuid(ref)) {
    const { rows } = await pool.query("SELECT * FROM kiosks WHERE id = $1", [ref]);
    return rows[0] || null;
  }
  const { rows } = await pool.query("SELECT * FROM kiosks WHERE mac = $1", [ref]);
  return rows[0] || null;
};

const hashesMatch = (stored, incoming) => {
  const a = Buffer.from(String(stored || ""), "utf8");
  const b = Buffer.from(String(incoming || ""), "utf8");
  if (a.length === 0 || a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
};

const nullableFinite = (value) => {
  if (value == null || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const nullableBattery = (value) => {
  const n = nullableFinite(value);
  if (n == null || n < 0) {
    return null;
  }
  return n;
};

const nullableBool = (value) => {
  if (value == null || value === "") {
    return null;
  }
  if (value === true || value === false) {
    return value;
  }
  const raw = String(value).trim().toLowerCase();
  if (raw === "true" || raw === "1" || raw === "yes") {
    return true;
  }
  if (raw === "false" || raw === "0" || raw === "no") {
    return false;
  }
  return null;
};

export const getKioskByKitId = async (kitId) => {
  const id = trimToNull(kitId);
  if (!id) {
    return null;
  }
  const { rows } = await pool.query("SELECT * FROM kiosks WHERE kit_id = $1", [id]);
  return rows[0] || null;
};

export const ingestHeartbeat = async (body = {}) => {
  const kitId = trimToNull(body.kitId);
  const hash = trimToNull(body.hash);
  const localTimeStamp = trimToNull(body.localTimeStamp);
  if (!kitId) {
    const error = new Error("kitId is required");
    error.status = 400;
    throw error;
  }
  if (!localTimeStamp) {
    const error = new Error("localTimeStamp is required");
    error.status = 400;
    throw error;
  }
  if (!hash) {
    const error = new Error("hash is required");
    error.status = 400;
    throw error;
  }

  const kiosk = await getKioskByKitId(kitId);
  if (!kiosk) {
    const error = new Error("Unknown kitId");
    error.status = 404;
    throw error;
  }
  if (!kiosk.status_hash) {
    const error = new Error("This kiosk has no status hash yet");
    error.status = 409;
    throw error;
  }
  if (!hashesMatch(kiosk.status_hash, hash)) {
    const error = new Error("Status hash does not match");
    error.status = 401;
    throw error;
  }

  const storedPayload = {
    kitId,
    localTimeStamp,
  };
  const deviceId = trimToNull(body.deviceId);
  const batteryPercent = nullableBattery(body.batteryPercent);
  const batteryVoltage = nullableBattery(body.batteryVoltage);
  const wifiRssi = nullableFinite(body.wifiRssi);
  const uptimeSec = nullableFinite(body.uptimeSec);
  const bootCount = nullableFinite(body.bootCount);
  const resetReason = trimToNull(body.resetReason);
  const rfidOk = nullableBool(body.rfidOk);

  if (deviceId != null) storedPayload.deviceId = deviceId;
  if (Object.hasOwn(body, "batteryPercent")) storedPayload.batteryPercent = batteryPercent;
  if (Object.hasOwn(body, "batteryVoltage")) storedPayload.batteryVoltage = batteryVoltage;
  if (wifiRssi != null) storedPayload.wifiRssi = Math.trunc(wifiRssi);
  if (uptimeSec != null) storedPayload.uptimeSec = Math.trunc(uptimeSec);
  if (bootCount != null) storedPayload.bootCount = Math.trunc(bootCount);
  if (resetReason != null) storedPayload.resetReason = resetReason;
  if (rfidOk != null) storedPayload.rfidOk = rfidOk;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO heartbeats (
         kiosk_id, kit_id, local_timestamp, device_id, battery_percent, battery_voltage,
         wifi_rssi, uptime_sec, boot_count, reset_reason, rfid_ok, payload
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
       RETURNING *`,
      [
        kiosk.id,
        kitId,
        storedPayload.localTimeStamp,
        deviceId,
        batteryPercent,
        batteryVoltage,
        storedPayload.wifiRssi ?? null,
        storedPayload.uptimeSec ?? null,
        storedPayload.bootCount ?? null,
        resetReason,
        rfidOk,
        JSON.stringify(storedPayload),
      ]
    );
    await client.query(
      `UPDATE kiosks
       SET last_heartbeat_at = $2, updated_at = now()
       WHERE id = $1`,
      [kiosk.id, inserted.rows[0].received_at]
    );
    await client.query("COMMIT");
    return inserted.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const shapeHeartbeat = (row) => {
  const heartbeat = {
    id: row.id,
    receivedAt: row.received_at,
    kitId: row.kit_id,
    localTimeStamp: row.local_timestamp,
  };
  if (row.device_id != null) heartbeat.deviceId = row.device_id;
  if (row.battery_percent != null) heartbeat.batteryPercent = Number(row.battery_percent);
  if (row.battery_voltage != null) heartbeat.batteryVoltage = Number(row.battery_voltage);
  if (row.wifi_rssi != null) heartbeat.wifiRssi = row.wifi_rssi;
  if (row.uptime_sec != null) heartbeat.uptimeSec = Number(row.uptime_sec);
  if (row.boot_count != null) heartbeat.bootCount = row.boot_count;
  if (row.reset_reason != null) heartbeat.resetReason = row.reset_reason;
  if (row.rfid_ok != null) heartbeat.rfidOk = row.rfid_ok;
  return heartbeat;
};

export const listHeartbeats = async (kioskRef, { limit = 50 } = {}) => {
  const kiosk = await getKiosk(kioskRef);
  if (!kiosk) {
    return null;
  }
  const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const { rows } = await pool.query(
    `SELECT id, kiosk_id, received_at, kit_id, local_timestamp, device_id, battery_percent, battery_voltage,
            wifi_rssi, uptime_sec, boot_count, reset_reason, rfid_ok
     FROM heartbeats
     WHERE kiosk_id = $1
     ORDER BY id DESC
     LIMIT $2`,
    [kiosk.id, take]
  );
  return rows.map(shapeHeartbeat);
};

const sha256Hex = (input) => crypto.createHash("sha256").update(String(input), "utf8").digest("hex");

const sosHashFromSecret = (kitId, localTimeStamp, attemptNo, kitSecret) =>
  sha256Hex(`${kitId}-unknown-${localTimeStamp}-${attemptNo}-${kitSecret}`);

const shapeSosPress = (row) => ({
  id: row.id,
  receivedAt: row.received_at,
  kitId: row.kit_id,
  triggeredBy: row.triggered_by,
  localTimeStamp: row.local_timestamp,
  attemptNo: row.attempt_no,
});

export const ingestSosPress = async (body = {}) => {
  const kitId = trimToNull(body.kitId);
  const hash = trimToNull(body.hash);
  const localTimeStamp = trimToNull(body.localTimeStamp);
  const triggeredBy = trimToNull(body.triggeredBy) || "unknown";
  const attemptNo = Number(body.attemptNo);

  if (!kitId) {
    const error = new Error("kitId is required");
    error.status = 400;
    throw error;
  }
  if (!hash) {
    const error = new Error("hash is required");
    error.status = 400;
    throw error;
  }
  if (!localTimeStamp) {
    const error = new Error("localTimeStamp is required");
    error.status = 400;
    throw error;
  }
  if (!Number.isInteger(attemptNo) || attemptNo < 1) {
    const error = new Error("attemptNo must be an integer >= 1");
    error.status = 400;
    throw error;
  }

  const kiosk = await getKioskByKitId(kitId);
  if (!kiosk) {
    const error = new Error("Unknown kitId");
    error.status = 404;
    throw error;
  }
  if (!kiosk.kit_secret) {
    const error = new Error("This kiosk has no kit secret yet");
    error.status = 409;
    throw error;
  }
  const expected = sosHashFromSecret(kitId, localTimeStamp, attemptNo, kiosk.kit_secret);
  if (!hashesMatch(expected, hash)) {
    const error = new Error("SOS hash does not match");
    error.status = 401;
    throw error;
  }

  const storedPayload = {
    kitId,
    triggeredBy,
    localTimeStamp,
    attemptNo,
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO sos_presses (
         kiosk_id, kit_id, triggered_by, local_timestamp, attempt_no, payload
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       ON CONFLICT (kiosk_id, local_timestamp, attempt_no) DO NOTHING
       RETURNING *`,
      [kiosk.id, kitId, triggeredBy, localTimeStamp, attemptNo, JSON.stringify(storedPayload)]
    );
    const row =
      inserted.rows[0] ||
      (
        await client.query(
          `SELECT * FROM sos_presses
           WHERE kiosk_id = $1 AND local_timestamp = $2 AND attempt_no = $3`,
          [kiosk.id, localTimeStamp, attemptNo]
        )
      ).rows[0];
    await client.query(
      `UPDATE kiosks
       SET last_sos_at = CASE WHEN $3 THEN $2 ELSE COALESCE(last_sos_at, $2) END, updated_at = now()
       WHERE id = $1`,
      [kiosk.id, row.received_at, Boolean(inserted.rows[0])]
    );
    await client.query("COMMIT");
    return row;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listSosPresses = async (kioskRef, { limit = 50 } = {}) => {
  const kiosk = await getKiosk(kioskRef);
  if (!kiosk) {
    return null;
  }
  const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const { rows } = await pool.query(
    `SELECT id, received_at, kit_id, triggered_by, local_timestamp, attempt_no
     FROM sos_presses
     WHERE kiosk_id = $1
     ORDER BY id DESC
     LIMIT $2`,
    [kiosk.id, take]
  );
  return rows.map(shapeSosPress);
};

const parseGpio = (value) => {
  if (value == null || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  const digits = String(value).replace(/\D/g, "");
  if (!digits) {
    return null;
  }
  return Number.parseInt(digits, 10);
};

const doorHashFromSecret = (kitId, triggeredBy, localTimeStamp, attemptNo, kitSecret) =>
  sha256Hex(`${kitId}-${triggeredBy}-${localTimeStamp}-${attemptNo}-${kitSecret}`);

const shapeDoorOpening = (row) => {
  const opening = {
    id: row.id,
    receivedAt: row.received_at,
    kitId: row.kit_id,
    triggeredBy: row.triggered_by,
    localTimeStamp: row.local_timestamp,
    attemptNo: row.attempt_no,
  };
  if (row.gpio != null) {
    opening.gpio = row.gpio;
  }
  return opening;
};

export const ingestDoorOpening = async (body = {}) => {
  const kitId = trimToNull(body.kitId);
  const hash = trimToNull(body.hash);
  const localTimeStamp = trimToNull(body.localTimeStamp);
  const triggeredBy = trimToNull(body.triggeredBy) || "unknown";
  const attemptNo = Number(body.attemptNo);
  const gpio = parseGpio(body.gpio);

  if (!kitId) {
    const error = new Error("kitId is required");
    error.status = 400;
    throw error;
  }
  if (!hash) {
    const error = new Error("hash is required");
    error.status = 400;
    throw error;
  }
  if (!localTimeStamp) {
    const error = new Error("localTimeStamp is required");
    error.status = 400;
    throw error;
  }
  if (!Number.isInteger(attemptNo) || attemptNo < 1) {
    const error = new Error("attemptNo must be an integer >= 1");
    error.status = 400;
    throw error;
  }

  const kiosk = await getKioskByKitId(kitId);
  if (!kiosk) {
    const error = new Error("Unknown kitId");
    error.status = 404;
    throw error;
  }
  if (!kiosk.kit_secret) {
    const error = new Error("This kiosk has no kit secret yet");
    error.status = 409;
    throw error;
  }
  const expected = doorHashFromSecret(kitId, triggeredBy, localTimeStamp, attemptNo, kiosk.kit_secret);
  if (!hashesMatch(expected, hash)) {
    const error = new Error("Door hash does not match");
    error.status = 401;
    throw error;
  }

  const storedPayload = {
    kitId,
    triggeredBy,
    localTimeStamp,
    attemptNo,
  };
  if (gpio != null) {
    storedPayload.gpio = gpio;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO door_openings (
         kiosk_id, kit_id, triggered_by, gpio, local_timestamp, attempt_no, payload
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       ON CONFLICT (kiosk_id, local_timestamp, attempt_no) DO NOTHING
       RETURNING *`,
      [kiosk.id, kitId, triggeredBy, gpio, localTimeStamp, attemptNo, JSON.stringify(storedPayload)]
    );
    const row =
      inserted.rows[0] ||
      (
        await client.query(
          `SELECT * FROM door_openings
           WHERE kiosk_id = $1 AND local_timestamp = $2 AND attempt_no = $3`,
          [kiosk.id, localTimeStamp, attemptNo]
        )
      ).rows[0];
    await client.query(
      `UPDATE kiosks
       SET last_door_at = CASE WHEN $3 THEN $2 ELSE COALESCE(last_door_at, $2) END, updated_at = now()
       WHERE id = $1`,
      [kiosk.id, row.received_at, Boolean(inserted.rows[0])]
    );
    await client.query("COMMIT");
    return row;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const listDoorOpenings = async (kioskRef, { limit = 50 } = {}) => {
  const kiosk = await getKiosk(kioskRef);
  if (!kiosk) {
    return null;
  }
  const take = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const { rows } = await pool.query(
    `SELECT id, received_at, kit_id, triggered_by, gpio, local_timestamp, attempt_no
     FROM door_openings
     WHERE kiosk_id = $1
     ORDER BY id DESC
     LIMIT $2`,
    [kiosk.id, take]
  );
  return rows.map(shapeDoorOpening);
};

export const nextSlot = async () => {
  const { rows } = await pool.query("SELECT slot FROM kiosks WHERE slot IS NOT NULL");
  const used = new Set(
    rows
      .map((row) => Number.parseInt(String(row.slot).replace(/\D/g, ""), 10))
      .filter((value) => Number.isInteger(value) && value > 0)
  );
  let n = 1;
  while (used.has(n)) {
    n += 1;
  }
  return String(n).padStart(2, "0");
};

export const createKiosk = async (input = {}) => {
  const normalized = normalizeSlot(input.slot);
  if (!normalized) {
    const error = new Error("Slot is required (for example 01)");
    error.status = 400;
    throw error;
  }
  const identity = fillDerivedIdentity(readKitIdentity(input), normalized);
  try {
    const { rows } = await pool.query(
      `INSERT INTO kiosks (
         mac, name, slot, notes,
         kit_id, kit_secret, status_hash, status_extended, access_pin,
         device_id, device_name, location_label, webhook_url, heartbeat_url,
         first_seen_at, last_seen_at, updated_at
       )
       VALUES (
         NULL, $1, $2, $3,
         $4, $5, $6, $7, $8,
         $9, $10, $11, $12, $13,
         now(), now(), now()
       )
       RETURNING *`,
      [
        nameFromSlot(normalized),
        normalized,
        trimToNull(input.notes),
        identity.kit_id,
        identity.kit_secret,
        identity.status_hash,
        identity.status_extended,
        identity.access_pin,
        identity.device_id,
        identity.device_name,
        identity.location_label,
        identity.webhook_url,
        identity.heartbeat_url,
      ]
    );
    return rows[0];
  } catch (error) {
    if (error.code === "23505") {
      const conflict = new Error(`Slot ${normalized} is already assigned`);
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }
};

export const deleteKiosk = async (ref) => {
  const kiosk = await getKiosk(ref);
  if (!kiosk) {
    return false;
  }
  await pool.query("DELETE FROM door_openings WHERE kiosk_id = $1", [kiosk.id]);
  await pool.query("DELETE FROM sos_presses WHERE kiosk_id = $1", [kiosk.id]);
  await pool.query("DELETE FROM heartbeats WHERE kiosk_id = $1", [kiosk.id]);
  await pool.query("DELETE FROM flashes WHERE kiosk_id = $1", [kiosk.id]);
  await pool.query("DELETE FROM kiosks WHERE id = $1", [kiosk.id]);
  return true;
};

export const bindKioskUsb = async (kioskId, { mac, usbSerial, chipModel, port }) => {
  if (!mac) {
    throw new Error("mac is required");
  }
  const kiosk = await getKiosk(kioskId);
  if (!kiosk) {
    const error = new Error("Unknown kiosk");
    error.status = 404;
    throw error;
  }
  const { rows: taken } = await pool.query(
    "SELECT id, name, slot FROM kiosks WHERE mac = $1 AND id <> $2",
    [mac, kiosk.id]
  );
  if (taken[0]) {
    const error = new Error(
      `MAC ${mac} already belongs to ${taken[0].name || `slot ${taken[0].slot}` || taken[0].id}`
    );
    error.status = 409;
    throw error;
  }
  if (kiosk.mac && kiosk.mac !== mac) {
    const error = new Error(`This kiosk is already bound to ${kiosk.mac}`);
    error.status = 409;
    throw error;
  }
  const { rows } = await pool.query(
    `UPDATE kiosks SET
       mac = $2,
       usb_serial = COALESCE($3, usb_serial),
       chip_model = COALESCE($4, chip_model),
       last_port = COALESCE($5, last_port),
       last_seen_at = now(),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [kiosk.id, mac, usbSerial || null, chipModel || null, port || null]
  );
  return rows[0];
};

export const markKioskProvisioned = async (kioskId, hostname) => {
  const { rows } = await pool.query(
    `UPDATE kiosks
     SET provisioned_at = now(), provisioned_hostname = $2, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [kioskId, hostname]
  );
  return rows[0] || null;
};

export const setKioskMeta = async (ref, input = {}) => {
  const kiosk = await getKiosk(ref);
  if (!kiosk) {
    return false;
  }
  const normalized = input.slot === undefined ? kiosk.slot : normalizeSlot(input.slot);
  const nextNotes = input.notes === undefined ? kiosk.notes : trimToNull(input.notes);
  const identity = fillDerivedIdentity(readKitIdentity(input, kiosk), normalized);
  try {
    const { rowCount } = await pool.query(
      `UPDATE kiosks
       SET slot = $2, notes = $3, name = $4,
           kit_id = $5, kit_secret = $6, status_hash = $7, status_extended = $8, access_pin = $9,
           device_id = $10, device_name = $11, location_label = $12, webhook_url = $13, heartbeat_url = $14,
           updated_at = now()
       WHERE id = $1`,
      [
        kiosk.id,
        normalized,
        nextNotes,
        nameFromSlot(normalized),
        identity.kit_id,
        identity.kit_secret,
        identity.status_hash,
        identity.status_extended,
        identity.access_pin,
        identity.device_id,
        identity.device_name,
        identity.location_label,
        identity.webhook_url,
        identity.heartbeat_url,
      ]
    );
    return rowCount > 0;
  } catch (error) {
    if (error.code === "23505") {
      const conflict = new Error(`Slot ${normalized} is already assigned`);
      conflict.status = 409;
      throw conflict;
    }
    throw error;
  }
};

export const findPassingFlash = async ({ mac, sku, gitSha }) => {
  const shortSha = String(gitSha || "")
    .trim()
    .slice(0, 7);
  if (!mac || !sku || !shortSha) {
    return null;
  }
  const { rows } = await pool.query(
    `SELECT id, mac, sku, git_sha, serial_grade, serial_score, finished_at
     FROM flashes
     WHERE mac = $1
       AND sku = $2
       AND success = true
       AND left(git_sha, 7) = $3
     ORDER BY id DESC
     LIMIT 1`,
    [mac, sku, shortSha]
  );
  return rows[0] || null;
};

export const insertFlash = async (row) => {
  const kiosk = await upsertKiosk({
    mac: row.mac,
    usbSerial: row.usbSerial,
    chipModel: row.chipModel,
    port: row.port,
  });
  const { rows } = await pool.query(
    `INSERT INTO flashes
       (kiosk_id, mac, sku, git_sha, git_dirty, port, fqbn, success, error, compile_bytes,
        started_at, finished_at, compile_log, upload_log, serial_log, serial_grade, serial_score, serial_report)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING id`,
    [
      kiosk.id,
      row.mac,
      row.sku,
      row.gitSha || null,
      Boolean(row.gitDirty),
      row.port || null,
      row.fqbn || null,
      Boolean(row.success),
      row.error || null,
      row.compileBytes ?? null,
      row.startedAt,
      row.finishedAt,
      tailLog(row.compileLog) || null,
      tailLog(row.uploadLog) || null,
      tailLog(row.serialLog) || null,
      row.serialGrade || null,
      row.serialScore || null,
      row.serialReport || null,
    ]
  );

  if (row.success) {
    await pool.query(
      `UPDATE kiosks
       SET flash_count = flash_count + 1, last_seen_at = $1, last_port = COALESCE($2, last_port), updated_at = now()
       WHERE id = $3`,
      [row.finishedAt, row.port || null, kiosk.id]
    );
  }

  return rows[0].id;
};

export const updateFlashSerial = async (id, serialLog) => {
  await pool.query("UPDATE flashes SET serial_log = $1 WHERE id = $2", [tailLog(serialLog) || null, id]);
};

export const updateFlashAccept = async (id, report, serialLog) => {
  const row = await getFlash(id);
  if (!row) {
    return;
  }
  const passed = report.grade !== "fail";
  const wasSuccess = bool(row.success);
  await pool.query(
    `UPDATE flashes
     SET serial_log = $1, serial_grade = $2, serial_score = $3, serial_report = $4, success = $5,
         error = CASE WHEN $5 THEN error ELSE COALESCE($6, error) END
     WHERE id = $7`,
    [
      tailLog(serialLog) || row.serial_log || null,
      report.grade,
      report.score,
      JSON.stringify(report),
      passed,
      passed ? null : report.summary,
      id,
    ]
  );
  if (wasSuccess && !passed) {
    await pool.query(
      "UPDATE kiosks SET flash_count = GREATEST(0, flash_count - 1), updated_at = now() WHERE id = $1",
      [row.kiosk_id]
    );
  }
  if (!wasSuccess && passed) {
    await pool.query(
      "UPDATE kiosks SET flash_count = flash_count + 1, last_seen_at = now(), updated_at = now() WHERE id = $1",
      [row.kiosk_id]
    );
  }
};

export const listKiosks = async () => {
  const { rows } = await pool.query(`${KIOSK_LIST_SQL} ORDER BY slot NULLS LAST, last_seen_at DESC`);
  return rows;
};

export const listFlashes = async (macOrId) => {
  if (macOrId) {
    if (isUuid(macOrId)) {
      const { rows } = await pool.query(
        `${FLASH_LIST_SQL} WHERE kiosk_id = $1 ORDER BY id DESC LIMIT 200`,
        [macOrId]
      );
      return rows;
    }
    const { rows } = await pool.query(`${FLASH_LIST_SQL} WHERE mac = $1 ORDER BY id DESC LIMIT 200`, [macOrId]);
    return rows;
  }
  const { rows } = await pool.query(`${FLASH_LIST_SQL} ORDER BY id DESC LIMIT 200`);
  return rows;
};

export const getFlash = async (id) => {
  const { rows } = await pool.query("SELECT * FROM flashes WHERE id = $1", [id]);
  return rows[0] || null;
};

export const formatFlashLog = (row, part = "all") => {
  if (!row) {
    return "";
  }
  if (part === "compile") {
    return row.compile_log || "";
  }
  if (part === "upload") {
    return row.upload_log || "";
  }
  if (part === "serial") {
    return row.serial_log || "";
  }
  const sections = [];
  if (row.compile_log) {
    sections.push(`=== compile ===\n${row.compile_log}`);
  }
  if (row.upload_log) {
    sections.push(`=== upload ===\n${row.upload_log}`);
  }
  if (row.serial_log) {
    sections.push(`=== serial ===\n${row.serial_log}`);
  }
  if (row.serial_report) {
    try {
      const report = JSON.parse(row.serial_report);
      const lines = [
        `=== accept ${report.score || ""} ${report.grade || ""} ===`,
        report.summary || "",
        ...(report.steps || []).map(
          (step) =>
            `${step.status === "pass" ? "ok" : step.status === "warn" ? "warn" : "fail"}  ${step.label}${step.detail ? ` — ${step.detail}` : ""}`
        ),
        report.llm ? `llm: ${report.llm}` : "",
      ].filter(Boolean);
      sections.push(lines.join("\n"));
    } catch {
      sections.push(`=== accept ===\n${row.serial_report}`);
    }
  }
  if (row.error) {
    sections.push(`=== error ===\n${row.error}`);
  }
  return sections.join("\n\n") || "No log stored for this write.\n";
};

export const upsertBoard = upsertKiosk;
export const setBoardMeta = setKioskMeta;
export const listBoards = listKiosks;
