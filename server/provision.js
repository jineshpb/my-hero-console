import { SerialPort } from "serialport";
import { SERIAL_BAUD } from "./arduino.js";
import { nameFromSlot, normalizeSlot } from "./db.js";

const ACK_MS = 4000;

export const hostnameForKiosk = (kiosk) => {
  if (kiosk?.name && /^my-hro-kiosk-\d+$/i.test(kiosk.name)) {
    return kiosk.name;
  }
  return nameFromSlot(normalizeSlot(kiosk?.slot));
};

export const provisionLine = ({ hostname, wifiSsid, wifiPassword }) => {
  const parts = [`MHCFG hostname=${hostname}`];
  if (wifiSsid) {
    parts.push(`wifi_ssid=${wifiSsid}`);
  }
  if (wifiPassword) {
    parts.push(`wifi_pass=${wifiPassword}`);
  }
  return `${parts.join(" ")}\n`;
};

export const provisionKioskOverUsb = async ({ port, hostname, onLog }) => {
  if (!port) {
    throw new Error("port is required");
  }
  if (!hostname) {
    throw new Error("Assign a slot before provisioning");
  }
  const wifiSsid = process.env.BENCH_WIFI_SSID || "";
  const wifiPassword = process.env.BENCH_WIFI_PASSWORD || "";
  const payload = provisionLine({ hostname, wifiSsid, wifiPassword });
  onLog?.(`provision ${hostname}${wifiSsid ? ` wifi=${wifiSsid}` : ""}`);

  const serial = new SerialPort({
    path: port,
    baudRate: SERIAL_BAUD,
    autoOpen: false,
  });

  const chunks = [];
  const read = () => Buffer.concat(chunks).toString("utf8");

  await new Promise((resolve, reject) => {
    serial.open((error) => (error ? reject(error) : resolve()));
  });

  try {
    serial.on("data", (data) => {
      chunks.push(Buffer.from(data));
      const text = data.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) {
          onLog?.(trimmed);
        }
      }
    });
    await new Promise((resolve, reject) => {
      serial.write(payload, (error) => (error ? reject(error) : resolve()));
    });
    await new Promise((resolve, reject) => {
      serial.drain((error) => (error ? reject(error) : resolve()));
    });

    const started = Date.now();
    while (Date.now() - started < ACK_MS) {
      if (/MHCFG\s*(OK|:ok)/i.test(read())) {
        return { ok: true, hostname, acked: true };
      }
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    return { ok: false, hostname, acked: false, log: read().slice(-2000) };
  } finally {
    await new Promise((resolve) => {
      if (!serial.isOpen) {
        resolve();
        return;
      }
      serial.close(() => resolve());
    });
  }
};
