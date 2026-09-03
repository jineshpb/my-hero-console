import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { DATA_DIR } from "./config.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(dir, "schema.sql");
const sqlitePath = path.join(DATA_DIR, "fleet.sqlite");

export const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://myhero:myhero@127.0.0.1:5432/myhero";

export const LOG_TAIL_BYTES = 512 * 1024;

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
});

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

const nameFromSlot = (slot) => {
  const digits = String(slot ?? "").trim().replace(/\D/g, "");
  if (!digits) {
    return null;
  }
  return `my-hro-kiosk-${digits.padStart(2, "0")}`;
};

const bool = (value) => value === true || value === 1 || value === "1" || value === "t";

const KIOSK_LIST_SQL = `
  SELECT k.*,
         (SELECT sku FROM flashes WHERE mac = k.mac AND success = true ORDER BY id DESC LIMIT 1) AS last_sku,
         (SELECT git_sha FROM flashes WHERE mac = k.mac AND success = true ORDER BY id DESC LIMIT 1) AS last_sha,
         (SELECT finished_at FROM flashes WHERE mac = k.mac ORDER BY id DESC LIMIT 1) AS last_write_at
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

export const initDb = async () => {
  const client = await pool.connect();
  try {
    const schema = fs.readFileSync(schemaPath, "utf8");
    for (const statement of schema
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)) {
      await client.query(statement);
    }
    await migrateSqliteIfEmpty(client);
  } finally {
    client.release();
  }
};

export const upsertKiosk = async ({ mac, usbSerial, chipModel, port }) => {
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

export const setKioskMeta = async (mac, { slot, notes }) => {
  const name = nameFromSlot(slot);
  const { rowCount } = await pool.query(
    `UPDATE kiosks
     SET slot = $2, notes = $3, name = $4, updated_at = now()
     WHERE mac = $1`,
    [mac, slot ?? null, notes ?? null, name]
  );
  return rowCount > 0;
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
       WHERE mac = $3`,
      [row.finishedAt, row.port || null, row.mac]
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
      "UPDATE kiosks SET flash_count = GREATEST(0, flash_count - 1), updated_at = now() WHERE mac = $1",
      [row.mac]
    );
  }
  if (!wasSuccess && passed) {
    await pool.query(
      "UPDATE kiosks SET flash_count = flash_count + 1, last_seen_at = now(), updated_at = now() WHERE mac = $1",
      [row.mac]
    );
  }
};

export const listKiosks = async () => {
  const { rows } = await pool.query(`${KIOSK_LIST_SQL} ORDER BY last_seen_at DESC`);
  return rows;
};

export const listFlashes = async (mac) => {
  if (mac) {
    const { rows } = await pool.query(`${FLASH_LIST_SQL} WHERE mac = $1 ORDER BY id DESC LIMIT 200`, [mac]);
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
