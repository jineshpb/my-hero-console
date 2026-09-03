import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const dir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dir, "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "fleet.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS boards (
    mac TEXT PRIMARY KEY,
    usb_serial TEXT,
    chip_model TEXT,
    slot TEXT,
    notes TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_port TEXT,
    flash_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS flashes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mac TEXT NOT NULL,
    sku TEXT NOT NULL,
    git_sha TEXT,
    git_dirty INTEGER NOT NULL DEFAULT 0,
    port TEXT,
    fqbn TEXT,
    success INTEGER NOT NULL,
    error TEXT,
    compile_bytes INTEGER,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    compile_log TEXT,
    upload_log TEXT,
    serial_log TEXT,
    serial_grade TEXT,
    serial_score TEXT,
    serial_report TEXT,
    FOREIGN KEY (mac) REFERENCES boards(mac)
  );
`);

const flashColumns = new Set(
  db.prepare("PRAGMA table_info(flashes)").all().map((column) => column.name)
);
if (!flashColumns.has("compile_log")) {
  db.exec("ALTER TABLE flashes ADD COLUMN compile_log TEXT");
}
if (!flashColumns.has("upload_log")) {
  db.exec("ALTER TABLE flashes ADD COLUMN upload_log TEXT");
}
if (!flashColumns.has("serial_log")) {
  db.exec("ALTER TABLE flashes ADD COLUMN serial_log TEXT");
}
if (!flashColumns.has("serial_grade")) {
  db.exec("ALTER TABLE flashes ADD COLUMN serial_grade TEXT");
}
if (!flashColumns.has("serial_score")) {
  db.exec("ALTER TABLE flashes ADD COLUMN serial_score TEXT");
}
if (!flashColumns.has("serial_report")) {
  db.exec("ALTER TABLE flashes ADD COLUMN serial_report TEXT");
}

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

export const upsertBoard = ({ mac, usbSerial, chipModel, port }) => {
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT mac FROM boards WHERE mac = ?").get(mac);
  if (existing) {
    db.prepare(
      `UPDATE boards
       SET usb_serial = COALESCE(?, usb_serial),
           chip_model = COALESCE(?, chip_model),
           last_seen_at = ?,
           last_port = COALESCE(?, last_port)
       WHERE mac = ?`
    ).run(usbSerial || null, chipModel || null, now, port || null, mac);
    return;
  }
  db.prepare(
    `INSERT INTO boards (mac, usb_serial, chip_model, first_seen_at, last_seen_at, last_port)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(mac, usbSerial || null, chipModel || null, now, now, port || null);
};

export const setBoardMeta = (mac, { slot, notes }) => {
  const board = db.prepare("SELECT mac FROM boards WHERE mac = ?").get(mac);
  if (!board) {
    return false;
  }
  db.prepare("UPDATE boards SET slot = ?, notes = ? WHERE mac = ?").run(
    slot ?? null,
    notes ?? null,
    mac
  );
  return true;
};

export const insertFlash = (row) => {
  const result = db
    .prepare(
      `INSERT INTO flashes
        (mac, sku, git_sha, git_dirty, port, fqbn, success, error, compile_bytes, started_at, finished_at, compile_log, upload_log, serial_log, serial_grade, serial_score, serial_report)
       VALUES (@mac, @sku, @gitSha, @gitDirty, @port, @fqbn, @success, @error, @compileBytes, @startedAt, @finishedAt, @compileLog, @uploadLog, @serialLog, @serialGrade, @serialScore, @serialReport)`
    )
    .run({
      mac: row.mac,
      sku: row.sku,
      gitSha: row.gitSha || null,
      gitDirty: row.gitDirty ? 1 : 0,
      port: row.port || null,
      fqbn: row.fqbn || null,
      success: row.success ? 1 : 0,
      error: row.error || null,
      compileBytes: row.compileBytes ?? null,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      compileLog: tailLog(row.compileLog) || null,
      uploadLog: tailLog(row.uploadLog) || null,
      serialLog: tailLog(row.serialLog) || null,
      serialGrade: row.serialGrade || null,
      serialScore: row.serialScore || null,
      serialReport: row.serialReport || null,
    });

  if (row.success) {
    db.prepare(
      "UPDATE boards SET flash_count = flash_count + 1, last_seen_at = ?, last_port = ? WHERE mac = ?"
    ).run(row.finishedAt, row.port || null, row.mac);
  }

  return result.lastInsertRowid;
};

export const updateFlashSerial = (id, serialLog) => {
  db.prepare("UPDATE flashes SET serial_log = ? WHERE id = ?").run(tailLog(serialLog) || null, id);
};

export const updateFlashAccept = (id, report, serialLog) => {
  const row = getFlash(id);
  if (!row) {
    return;
  }
  const passed = report.grade !== "fail";
  const wasSuccess = Number(row.success) === 1;
  db.prepare(
    `UPDATE flashes
     SET serial_log = ?, serial_grade = ?, serial_score = ?, serial_report = ?, success = ?,
         error = CASE WHEN ? = 0 THEN COALESCE(?, error) ELSE error END
     WHERE id = ?`
  ).run(
    tailLog(serialLog) || row.serial_log || null,
    report.grade,
    report.score,
    JSON.stringify(report),
    passed ? 1 : 0,
    passed ? 1 : 0,
    passed ? null : report.summary,
    id
  );
  if (wasSuccess && !passed) {
    db.prepare("UPDATE boards SET flash_count = MAX(0, flash_count - 1) WHERE mac = ?").run(row.mac);
  }
  if (!wasSuccess && passed) {
    db.prepare("UPDATE boards SET flash_count = flash_count + 1, last_seen_at = ? WHERE mac = ?").run(
      new Date().toISOString(),
      row.mac
    );
  }
};

export const listBoards = () =>
  db
    .prepare(
      `SELECT b.*,
              (SELECT sku FROM flashes WHERE mac = b.mac AND success = 1 ORDER BY id DESC LIMIT 1) AS last_sku,
              (SELECT git_sha FROM flashes WHERE mac = b.mac AND success = 1 ORDER BY id DESC LIMIT 1) AS last_sha,
              (SELECT finished_at FROM flashes WHERE mac = b.mac ORDER BY id DESC LIMIT 1) AS last_write_at
       FROM boards b
       ORDER BY b.last_seen_at DESC`
    )
    .all();

const FLASH_LIST_SQL = `SELECT id, mac, sku, git_sha, git_dirty, port, fqbn, success, error,
       compile_bytes, started_at, finished_at, serial_grade, serial_score, serial_report,
       CASE WHEN compile_log IS NOT NULL AND length(compile_log) > 0 THEN 1 ELSE 0 END AS has_compile_log,
       CASE WHEN upload_log IS NOT NULL AND length(upload_log) > 0 THEN 1 ELSE 0 END AS has_upload_log,
       CASE WHEN serial_log IS NOT NULL AND length(serial_log) > 0 THEN 1 ELSE 0 END AS has_serial_log
FROM flashes`;

export const listFlashes = (mac) => {
  if (mac) {
    return db.prepare(`${FLASH_LIST_SQL} WHERE mac = ? ORDER BY id DESC LIMIT 200`).all(mac);
  }
  return db.prepare(`${FLASH_LIST_SQL} ORDER BY id DESC LIMIT 200`).all();
};

export const getFlash = (id) => db.prepare("SELECT * FROM flashes WHERE id = ?").get(id);

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
          (step) => `${step.status === "pass" ? "ok" : step.status === "warn" ? "warn" : "fail"}  ${step.label}${step.detail ? ` — ${step.detail}` : ""}`
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
