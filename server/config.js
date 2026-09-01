import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(dir, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

const configPath = path.join(DATA_DIR, "config.json");

const siblingFirmware = path.resolve(dir, "../../my-hero-firmware");

const defaults = () => ({
  firmwareGit: fs.existsSync(path.join(siblingFirmware, "skus")) ? siblingFirmware : "",
  firmwareBranch: "main",
});

export const getConfig = () => {
  let stored = {};
  if (fs.existsSync(configPath)) {
    try {
      stored = JSON.parse(fs.readFileSync(configPath, "utf8"));
    } catch {
      stored = {};
    }
  }
  return { ...defaults(), ...stored };
};

export const setConfig = (patch) => {
  const next = {
    ...getConfig(),
    ...patch,
  };
  if (typeof next.firmwareGit === "string") {
    next.firmwareGit = next.firmwareGit.trim();
  }
  if (typeof next.firmwareBranch === "string") {
    next.firmwareBranch = next.firmwareBranch.trim() || "main";
  }
  fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
  return next;
};

export const isRemoteGit = (value) =>
  /^(https?:\/\/|git@|ssh:\/\/)/i.test(value || "");

export const CLONE_DIR = path.join(DATA_DIR, "firmware-repo");
