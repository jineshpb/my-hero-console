CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS kiosks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mac TEXT UNIQUE,
  name TEXT,
  slot TEXT,
  usb_serial TEXT,
  chip_model TEXT,
  notes TEXT,
  kit_id TEXT,
  kit_secret TEXT,
  status_hash TEXT,
  status_extended TEXT DEFAULT '0',
  access_pin TEXT,
  device_id TEXT,
  device_name TEXT,
  location_label TEXT,
  webhook_url TEXT,
  heartbeat_url TEXT,
  last_port TEXT,
  last_heartbeat_at TIMESTAMPTZ,
  last_sos_at TIMESTAMPTZ,
  last_door_at TIMESTAMPTZ,
  flash_count INTEGER NOT NULL DEFAULT 0,
  provisioned_at TIMESTAMPTZ,
  provisioned_hostname TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS kiosks_slot_unique
  ON kiosks (slot)
  WHERE slot IS NOT NULL AND btrim(slot) <> '';

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

CREATE UNIQUE INDEX IF NOT EXISTS kiosks_kit_id_unique
  ON kiosks (kit_id)
  WHERE kit_id IS NOT NULL AND btrim(kit_id) <> '';

-- Status ping from the sketch: kitId, localTimeStamp, hash (auth only, not stored).
-- Extended fields when statusext=1: deviceId, batteryPercent, batteryVoltage,
-- wifiRssi, uptimeSec, bootCount, resetReason, rfidOk.
CREATE TABLE IF NOT EXISTS heartbeats (
  id BIGSERIAL PRIMARY KEY,
  kiosk_id UUID NOT NULL REFERENCES kiosks(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kit_id TEXT NOT NULL,
  local_timestamp TEXT,
  device_id TEXT,
  battery_percent NUMERIC(5,1),
  battery_voltage NUMERIC(8,3),
  wifi_rssi INTEGER,
  uptime_sec BIGINT,
  boot_count INTEGER,
  reset_reason TEXT,
  rfid_ok BOOLEAN,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS heartbeats_kiosk_id_idx ON heartbeats (kiosk_id, id DESC);
CREATE INDEX IF NOT EXISTS heartbeats_received_at_idx ON heartbeats (received_at DESC);

-- SOS button POST from the sketch: kitId, triggeredBy, localTimeStamp, attemptNo,
-- hash = sha256(kitId-unknown-localTimeStamp-attemptNo-kitSecret). Hash is auth only.
CREATE TABLE IF NOT EXISTS sos_presses (
  id BIGSERIAL PRIMARY KEY,
  kiosk_id UUID NOT NULL REFERENCES kiosks(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kit_id TEXT NOT NULL,
  triggered_by TEXT,
  local_timestamp TEXT,
  attempt_no INTEGER,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS sos_presses_kiosk_id_idx ON sos_presses (kiosk_id, id DESC);
CREATE INDEX IF NOT EXISTS sos_presses_received_at_idx ON sos_presses (received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS sos_presses_attempt_unique
  ON sos_presses (kiosk_id, local_timestamp, attempt_no);

-- Door unlock from unlockDoor(reason) on SERVO_PIN (GPIO 33): kitId, triggeredBy,
-- gpio, localTimeStamp, attemptNo,
-- hash = sha256(kitId-triggeredBy-localTimeStamp-attemptNo-kitSecret).
CREATE TABLE IF NOT EXISTS door_openings (
  id BIGSERIAL PRIMARY KEY,
  kiosk_id UUID NOT NULL REFERENCES kiosks(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kit_id TEXT NOT NULL,
  triggered_by TEXT,
  gpio INTEGER,
  local_timestamp TEXT,
  attempt_no INTEGER,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS door_openings_kiosk_id_idx ON door_openings (kiosk_id, id DESC);
CREATE INDEX IF NOT EXISTS door_openings_received_at_idx ON door_openings (received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS door_openings_attempt_unique
  ON door_openings (kiosk_id, local_timestamp, attempt_no);
