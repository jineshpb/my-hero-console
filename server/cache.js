import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config.js";

export const CACHE_DIR = path.join(DATA_DIR, "firmware-cache");

export const sketchContentHash = (files) => {
  const hash = crypto.createHash("sha256");
  const list = [...(files || [])].sort((a, b) => a.fileName.localeCompare(b.fileName));
  for (const file of list) {
    hash.update(file.fileName);
    hash.update("\0");
    hash.update(file.contents || "");
    hash.update("\0");
  }
  return hash.digest("hex");
};

export const cacheId = ({ sku, sha, contentHash, fqbn }) => {
  const hash = crypto.createHash("sha256");
  hash.update(
    JSON.stringify({
      sku: sku || "",
      sha: sha || "",
      contentHash: sha ? "" : contentHash || "",
      fqbn: fqbn || "",
    })
  );
  return hash.digest("hex").slice(0, 24);
};

export const cachePaths = (sku, id) => {
  const dir = path.join(CACHE_DIR, sku, id);
  return {
    dir,
    outDir: path.join(dir, "out"),
    manifestPath: path.join(dir, "manifest.json"),
  };
};

const hasBinaries = (outDir) => {
  if (!fs.existsSync(outDir)) {
    return false;
  }
  return fs.readdirSync(outDir).some((name) => name.toLowerCase().endsWith(".bin"));
};

export const readCache = (sku, id) => {
  const paths = cachePaths(sku, id);
  if (!fs.existsSync(paths.manifestPath) || !hasBinaries(paths.outDir)) {
    return null;
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(paths.manifestPath, "utf8"));
    return { ...paths, manifest };
  } catch {
    return null;
  }
};

export const writeCache = ({ sku, id, outDir, manifest }) => {
  if (!hasBinaries(outDir)) {
    return null;
  }
  const paths = cachePaths(sku, id);
  fs.mkdirSync(paths.outDir, { recursive: true });
  fs.cpSync(outDir, paths.outDir, { recursive: true });
  fs.writeFileSync(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return paths;
};
