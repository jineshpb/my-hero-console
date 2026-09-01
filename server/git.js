import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CLONE_DIR, getConfig, isRemoteGit } from "./config.js";
import { discoverSkus } from "./skus.js";

const execFileAsync = promisify(execFile);

const runGit = async (args, options = {}) => {
  const { stdout } = await execFileAsync("git", args, {
    cwd: options.cwd,
    timeout: options.timeout ?? 15000,
    windowsHide: true,
  });
  return stdout.trim();
};

const runGitAllowFail = async (args, options = {}) => {
  try {
    return await runGit(args, options);
  } catch {
    return null;
  }
};

export const resolveFirmwareRoot = () => {
  const { firmwareGit } = getConfig();
  if (!firmwareGit) {
    return null;
  }
  if (!isRemoteGit(firmwareGit)) {
    const local = path.resolve(firmwareGit);
    if (fs.existsSync(local)) {
      return local;
    }
    return null;
  }
  if (fs.existsSync(path.join(CLONE_DIR, ".git"))) {
    return CLONE_DIR;
  }
  return null;
};

export const getGitInfo = async () => {
  const config = getConfig();
  const root = resolveFirmwareRoot();
  if (!root) {
    return {
      sha: null,
      shortSha: null,
      branch: config.firmwareBranch,
      dirty: false,
      subject: null,
      remote: config.firmwareGit || null,
      root: null,
      configured: Boolean(config.firmwareGit),
    };
  }
  const sha = await runGitAllowFail(["rev-parse", "HEAD"], { cwd: root });
  const shortSha = await runGitAllowFail(["rev-parse", "--short", "HEAD"], { cwd: root });
  const branch = await runGitAllowFail(["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root });
  const dirty = Boolean(await runGitAllowFail(["status", "--porcelain"], { cwd: root }));
  const subject = await runGitAllowFail(["log", "-1", "--pretty=%s"], { cwd: root });
  const remote =
    (await runGitAllowFail(["remote", "get-url", "origin"], { cwd: root })) || config.firmwareGit;
  return {
    sha,
    shortSha,
    branch: branch || config.firmwareBranch,
    dirty,
    subject,
    remote,
    root,
    configured: true,
  };
};

const remoteRef = (branch) => [`origin/${branch}`, `origin/master`, `origin/main`];

export const pullFirmware = async () => {
  const { firmwareGit, firmwareBranch } = getConfig();
  if (!firmwareGit) {
    throw new Error("Set a firmware git URL or local repo path first.");
  }

  if (!isRemoteGit(firmwareGit)) {
    const local = path.resolve(firmwareGit);
    if (!fs.existsSync(local)) {
      throw new Error(`Firmware path not found: ${local}`);
    }
    await runGitAllowFail(["fetch", "origin", "--prune"], { cwd: local, timeout: 120000 });
    return listVersions();
  }

  fs.mkdirSync(path.dirname(CLONE_DIR), { recursive: true });
  if (!fs.existsSync(path.join(CLONE_DIR, ".git"))) {
    if (fs.existsSync(CLONE_DIR)) {
      fs.rmSync(CLONE_DIR, { recursive: true, force: true });
    }
    await runGit(
      ["clone", "--branch", firmwareBranch, firmwareGit, CLONE_DIR],
      { cwd: path.dirname(CLONE_DIR), timeout: 180000 }
    ).catch(async () => {
      await runGit(["clone", firmwareGit, CLONE_DIR], {
        cwd: path.dirname(CLONE_DIR),
        timeout: 180000,
      });
      await runGitAllowFail(["checkout", firmwareBranch], { cwd: CLONE_DIR });
    });
    return listVersions();
  }

  await runGit(["remote", "set-url", "origin", firmwareGit], { cwd: CLONE_DIR });
  await runGit(["fetch", "origin", "--prune"], { cwd: CLONE_DIR, timeout: 120000 });
  const branch = firmwareBranch || "main";
  let target = null;
  for (const ref of remoteRef(branch)) {
    const ok = await runGitAllowFail(["rev-parse", "--verify", ref], { cwd: CLONE_DIR });
    if (ok) {
      target = ref;
      break;
    }
  }
  if (target) {
    await runGit(["checkout", "-B", branch, target], { cwd: CLONE_DIR });
  }
  return listVersions();
};

export const listVersions = async (limit = 40) => {
  const root = resolveFirmwareRoot();
  const info = await getGitInfo();
  if (!root) {
    return { ...info, range: null, versions: [], skus: [] };
  }
  const count = Math.min(100, Math.max(1, Number(limit) || 40));
  const { firmwareBranch } = getConfig();
  let range = "HEAD";
  for (const ref of [`origin/${firmwareBranch}`, "origin/main", "origin/master", "HEAD"]) {
    if (await runGitAllowFail(["rev-parse", "--verify", ref], { cwd: root })) {
      range = ref;
      break;
    }
  }
  const raw = await runGitAllowFail(
    ["log", range, `-n${count}`, "--pretty=format:%H\t%h\t%an\t%aI\t%s"],
    { cwd: root }
  );
  const versions = (raw || "")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [sha, shortSha, author, date, ...rest] = line.split("\t");
      return { sha, shortSha, author, date, subject: rest.join("\t") };
    });
  return {
    ...info,
    range,
    versions,
    skus: discoverSkus(root),
  };
};

export const listSkus = () => {
  const root = resolveFirmwareRoot();
  return root ? discoverSkus(root) : [];
};

const showFileAt = async (root, sha, filePath) => {
  const normalized = filePath.replaceAll("\\", "/");
  return runGit(["show", `${sha}:${normalized}`], { cwd: root });
};

const listTreeFiles = async (root, sha, dir) => {
  const normalized = dir.replaceAll("\\", "/");
  const raw = await runGit(["ls-tree", "-r", "--name-only", sha, normalized], { cwd: root });
  return raw.split(/\r?\n/).filter(Boolean);
};

export const resolveSkuSketch = async (sku, sha) => {
  const root = resolveFirmwareRoot();
  if (!root) {
    throw new Error("Firmware git is not configured or has not been pulled yet.");
  }

  if (!sha) {
    const folder = path.join(root, sku.dir);
    if (!fs.existsSync(folder)) {
      throw new Error(`SKU folder missing: ${sku.dir}`);
    }
    const files = fs
      .readdirSync(folder)
      .filter((name) => !name.startsWith(".") && name !== "sku.json")
      .map((name) => ({
        fileName: name,
        rel: `${sku.dir}/${name}`,
        contents: fs.readFileSync(path.join(folder, name), "utf8"),
      }));
    const primary = files.find((file) => file.fileName === path.posix.basename(sku.file)) || files.find((file) => file.fileName.endsWith(".ino"));
    if (!primary) {
      throw new Error(`No .ino in ${sku.dir}`);
    }
    return { ...primary, sha: null, files };
  }

  const tree = await listTreeFiles(root, sha, sku.dir).catch(() => []);
  const files = [];
  for (const rel of tree) {
    const fileName = path.posix.basename(rel);
    if (fileName === "sku.json") {
      continue;
    }
    files.push({
      fileName,
      rel,
      contents: await showFileAt(root, sha, rel),
    });
  }
  const primary =
    files.find((file) => file.fileName === path.posix.basename(sku.file)) ||
    files.find((file) => file.fileName.endsWith(".ino"));
  if (!primary) {
    throw new Error(`SKU ${sku.id} has no sketch in ${sha.slice(0, 7)} (${sku.dir})`);
  }
  return { ...primary, sha, files };
};
