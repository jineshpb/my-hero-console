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
    FOREIGN KEY (mac) REFERENCES boards(mac)
  );
`);

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
        (mac, sku, git_sha, git_dirty, port, fqbn, success, error, compile_bytes, started_at, finished_at)
       VALUES (@mac, @sku, @gitSha, @gitDirty, @port, @fqbn, @success, @error, @compileBytes, @startedAt, @finishedAt)`
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
    });

  if (row.success) {
    db.prepare(
      "UPDATE boards SET flash_count = flash_count + 1, last_seen_at = ?, last_port = ? WHERE mac = ?"
    ).run(row.finishedAt, row.port || null, row.mac);
  }

  return result.lastInsertRowid;
};

export const listBoards = () =>
  db
    .prepare(
      `SELECT b.*,
              (SELECT sku FROM flashes WHERE mac = b.mac AND success = 1 ORDER BY id DESC LIMIT 1) AS last_sku,
              (SELECT git_sha FROM flashes WHERE mac = b.mac AND success = 1 ORDER BY id DESC LIMIT 1) AS last_sha
       FROM boards b
       ORDER BY b.last_seen_at DESC`
    )
    .all();

export const listFlashes = (mac) => {
  if (mac) {
    return db
      .prepare("SELECT * FROM flashes WHERE mac = ? ORDER BY id DESC LIMIT 200")
      .all(mac);
  }
  return db.prepare("SELECT * FROM flashes ORDER BY id DESC LIMIT 200").all();
};
