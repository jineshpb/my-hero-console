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

export const kioskHref = (board) => `/kiosks/${macToKioskId(board.mac)}`;

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

export const kioskStatus = (board, ports, identity) => {
  if (isUsbConnected(board, ports, identity)) {
    return { id: "usb", label: "USB", className: "bg-emerald-400" };
  }
  if (board?.last_seen_at) {
    return { id: "known", label: "Known", className: "bg-zinc-500" };
  }
  return { id: "unknown", label: "Unknown", className: "bg-zinc-600" };
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
