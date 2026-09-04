export const normalizeSlot = (slot) => {
  if (slot == null) {
    return "";
  }
  const digits = String(slot).trim().replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  return digits.padStart(2, "0");
};

export const kioskName = (board) => {
  if (board?.name) {
    return board.name;
  }
  const slot = normalizeSlot(board?.slot);
  return slot ? `my-hro-kiosk-${slot}` : "Unassigned";
};

export const macToKioskId = (mac) => String(mac || "").replace(/:/g, "").toLowerCase();

export const kioskIdToMac = (id) => {
  const hex = String(id || "")
    .replace(/[^0-9a-fA-F]/g, "")
    .toUpperCase();
  if (hex.length !== 12) {
    return decodeURIComponent(id || "");
  }
  return hex.match(/.{2}/g).join(":");
};

export const kiosksHref = ({ live } = {}) => (live ? "/kiosks?view=live" : "/kiosks");

export const kioskHref = (board, { live } = {}) => {
  const path = board?.id ? `/kiosks/${board.id}` : `/kiosks/${macToKioskId(board?.mac)}`;
  return live ? `${path}?view=live` : path;
};

export const findKiosk = (kiosks, kioskId) => {
  if (!kioskId || !Array.isArray(kiosks)) {
    return undefined;
  }
  const mac = kioskIdToMac(kioskId);
  return (
    kiosks.find((item) => item.id === kioskId) ||
    kiosks.find((item) => item.mac && item.mac === mac) ||
    kiosks.find((item) => item.mac && macToKioskId(item.mac) === String(kioskId).toLowerCase())
  );
};

export const DEFAULT_SOS_WEBHOOK_URL =
  "https://asia-south1-onyx-glazing-469421-u9.cloudfunctions.net/api/v1/sos/trigger";
export const DEFAULT_STATUS_WEBHOOK_URL =
  "https://asia-south1-onyx-glazing-469421-u9.cloudfunctions.net/api/v1/sos/status";

export const kitIdentityFromSlot = (slot) => {
  const normalized = normalizeSlot(slot);
  if (!normalized) {
    return {
      hostname: "",
      firmwareHostname: "",
      deviceId: "",
      deviceName: "",
      locationLabel: "",
    };
  }
  return {
    hostname: `my-hro-kiosk-${normalized}`,
    firmwareHostname: `myhero-kiosk-${normalized}`,
    deviceId: `esp32-sos-${normalized}`,
    deviceName: `My Hero Kiosk ${normalized}`,
    locationLabel: `my hero location ${normalized}`,
  };
};

export const emptyKitIdentity = (slot = "") => {
  const derived = kitIdentityFromSlot(slot);
  return {
    slot,
    notes: "",
    kit_id: "",
    kit_secret: "",
    status_hash: "",
    status_extended: "0",
    access_pin: "",
    device_id: derived.deviceId,
    device_name: derived.deviceName,
    location_label: derived.locationLabel,
    webhook_url: DEFAULT_SOS_WEBHOOK_URL,
    heartbeat_url: DEFAULT_STATUS_WEBHOOK_URL,
  };
};

export const kitIdentityFromKiosk = (board) => {
  const slot = board?.slot || "";
  const derived = kitIdentityFromSlot(slot);
  return {
    slot,
    notes: board?.notes || "",
    kit_id: board?.kit_id || "",
    kit_secret: "",
    status_hash: "",
    status_extended: board?.status_extended === "1" ? "1" : "0",
    access_pin: "",
    device_id: board?.device_id || derived.deviceId,
    device_name: board?.device_name || derived.deviceName,
    location_label: board?.location_label || derived.locationLabel,
    webhook_url: board?.webhook_url || DEFAULT_SOS_WEBHOOK_URL,
    heartbeat_url: board?.heartbeat_url || DEFAULT_STATUS_WEBHOOK_URL,
  };
};

export const applySlotToIdentity = (current, nextSlot) => {
  const previous = kitIdentityFromSlot(current.slot);
  const next = kitIdentityFromSlot(nextSlot);
  const keepIfCustom = (value, previousDefault, nextDefault) =>
    !value || value === previousDefault ? nextDefault : value;
  return {
    ...current,
    slot: nextSlot,
    device_id: keepIfCustom(current.device_id, previous.deviceId, next.deviceId),
    device_name: keepIfCustom(current.device_name, previous.deviceName, next.deviceName),
    location_label: keepIfCustom(current.location_label, previous.locationLabel, next.locationLabel),
  };
};

export const kitIdentityPayload = (draft) => ({
  slot: draft.slot,
  notes: draft.notes,
  kit_id: draft.kit_id,
  kit_secret: draft.kit_secret,
  status_hash: draft.status_hash,
  status_extended: draft.status_extended,
  access_pin: draft.access_pin,
  device_id: draft.device_id,
  device_name: draft.device_name,
  location_label: draft.location_label,
  webhook_url: draft.webhook_url,
  heartbeat_url: draft.heartbeat_url,
});

export const nextOpenSlot = (kiosks) => {
  const used = new Set(
    (kiosks || [])
      .map((item) => Number.parseInt(normalizeSlot(item.slot), 10))
      .filter((value) => Number.isInteger(value) && value > 0)
  );
  let n = 1;
  while (used.has(n)) {
    n += 1;
  }
  return String(n).padStart(2, "0");
};

export const lastWrite = (flashes) => flashes[0] || null;

export const formatTime = (value) => {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString();
};

export const formatRelative = (value) => {
  if (!value) {
    return "Never";
  }
  const delta = Date.now() - new Date(value).getTime();
  if (Number.isNaN(delta)) {
    return "—";
  }
  const seconds = Math.max(0, Math.floor(delta / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const formatCommit = (version) => {
  const day = version.date ? version.date.slice(0, 10) : "";
  const note = version.subject || "(no message)";
  return `${version.shortSha} · ${day} · ${note}`;
};

export const formatElapsed = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
};

export const formatUptime = (seconds) => {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total < 0) {
    return "—";
  }
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
};

export const shortSha = (sha) => (sha ? String(sha).slice(0, 7) : "—");

export const isUsbConnected = (board, ports, identity) => {
  if (!board) {
    return false;
  }
  if (identity?.mac && identity.mac === board.mac) {
    return true;
  }
  if (!board.last_port) {
    return false;
  }
  return ports.some((item) => item.address === board.last_port);
};

export const kioskPresence = (board, ports, identity) => {
  if (isUsbConnected(board, ports, identity)) {
    return "online";
  }
  if (board?.mac) {
    return "stale";
  }
  return "offline";
};

export const FIELD_STALE_MS = 15 * 60 * 1000;

export const fieldPresence = (board) => {
  if (!board?.last_heartbeat_at) {
    return "offline";
  }
  const age = Date.now() - new Date(board.last_heartbeat_at).getTime();
  if (Number.isNaN(age)) {
    return "offline";
  }
  if (age <= FIELD_STALE_MS) {
    return "online";
  }
  return "stale";
};

export const fieldPresenceLabel = (presence) => {
  if (presence === "online") {
    return "Field";
  }
  if (presence === "stale") {
    return "Stale";
  }
  return "Silent";
};

export const PRESENCE = {
  online: { id: "online", label: "Online", className: "bg-emerald-400" },
  stale: { id: "stale", label: "Stale", className: "bg-orange-400" },
  offline: { id: "offline", label: "Offline", className: "bg-red-500" },
};

export const kioskStatus = (board, ports, identity) => {
  const presence = kioskPresence(board, ports, identity);
  if (presence === "online") {
    return { id: "usb", label: "USB", className: PRESENCE.online.className };
  }
  if (!board?.mac) {
    return { id: "pending", label: "Awaiting USB", className: PRESENCE.offline.className };
  }
  if (board.provisioned_at) {
    return { id: "provisioned", label: "Provisioned", className: PRESENCE.stale.className };
  }
  if (board?.last_seen_at) {
    return { id: "known", label: "Known", className: PRESENCE.stale.className };
  }
  return { id: "unknown", label: "Unknown", className: PRESENCE.offline.className };
};

export const kitLabel = (skuId) => {
  if (!skuId) {
    return "";
  }
  if (skuId === "combined") {
    return "Combined kit";
  }
  if (skuId === "sos" || skuId === "rfid") {
    return "Split kit";
  }
  return skuId;
};

export const comLightLabel = (ports, portsLoading, selectedPort) => {
  if (portsLoading && !ports.length) {
    return "COM";
  }
  if (!ports.length) {
    return "No COM";
  }
  const address = selectedPort?.address || ports[0].address;
  return address.replace(/^(COM)(\d+)$/i, "COM $2");
};

export const portSelectOptions = (ports, portsLoading) => {
  if (!ports.length) {
    return [{ value: "", label: portsLoading ? "Looking for USB…" : "No USB ports" }];
  }
  return ports.map((item) => ({
    value: item.address,
    label: item.label && item.label !== item.address ? `${item.address} — ${item.label}` : item.address,
  }));
};
