import fs from "node:fs";
import path from "node:path";

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
};

export const skuSearchRoots = (repoRoot) =>
  ["skus", path.join("firmware", "skus")]
    .map((rel) => path.join(repoRoot, rel))
    .filter((dir) => fs.existsSync(dir));

const inoInFolder = (folder, id) => {
  const preferred = path.join(folder, `${id}.ino`);
  if (fs.existsSync(preferred)) {
    return preferred;
  }
  const found = fs.readdirSync(folder).find((name) => name.toLowerCase().endsWith(".ino"));
  return found ? path.join(folder, found) : null;
};

export const discoverSkus = (repoRoot) => {
  if (!repoRoot || !fs.existsSync(repoRoot)) {
    return [];
  }
  const skus = [];
  for (const base of skuSearchRoots(repoRoot)) {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) {
        continue;
      }
      const folder = path.join(base, entry.name);
      const ino = inoInFolder(folder, entry.name);
      if (!ino) {
        continue;
      }
      const meta = readJson(path.join(folder, "sku.json"));
      const relDir = path.relative(repoRoot, folder).replaceAll("\\", "/");
      skus.push({
        id: meta.id || entry.name,
        name: meta.name || entry.name,
        hardware: meta.hardware || "",
        dir: relDir,
        file: `${relDir}/${path.basename(ino)}`,
      });
    }
  }
  return skus;
};

export const getSku = (skus, id) => skus.find((sku) => sku.id === id);

export const skuFileCandidates = (sku) => {
  const names = [path.posix.basename(sku.file)];
  return [...new Set(names)].map((name) => `${sku.dir}/${name}`);
};
