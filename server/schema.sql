CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS kiosks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mac TEXT NOT NULL UNIQUE,
  name TEXT,
  slot TEXT,
  usb_serial TEXT,
  chip_model TEXT,
  notes TEXT,
  last_port TEXT,
  flash_count INTEGER NOT NULL DEFAULT 0,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flashes (
  id SERIAL PRIMARY KEY,
  kiosk_id UUID REFERENCES kiosks(id) ON DELETE RESTRICT,
  mac TEXT NOT NULL,
  sku TEXT NOT NULL,
  git_sha TEXT,
  git_dirty BOOLEAN NOT NULL DEFAULT false,
  port TEXT,
  fqbn TEXT,
  success BOOLEAN NOT NULL,
  error TEXT,
  compile_bytes INTEGER,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  compile_log TEXT,
  upload_log TEXT,
  serial_log TEXT,
  serial_grade TEXT,
  serial_score TEXT,
  serial_report TEXT
);

CREATE INDEX IF NOT EXISTS flashes_mac_id_idx ON flashes (mac, id DESC);
CREATE INDEX IF NOT EXISTS flashes_kiosk_id_idx ON flashes (kiosk_id, id DESC);
CREATE INDEX IF NOT EXISTS kiosks_last_seen_idx ON kiosks (last_seen_at DESC);
