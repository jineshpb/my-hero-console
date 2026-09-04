import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { cacheId, readCache, sketchContentHash, writeCache } from "./cache.js";
import { resolveSkuSketch } from "./git.js";

const execFileAsync = promisify(execFile);

const firstExisting = (candidates) =>
  candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;

const findOnPath = (binary) => {
  const extensions =
    process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    for (const extension of extensions) {
      const candidate = path.join(dir, `${binary}${extension}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
};

const resolveArduinoCli = () => {
  if (process.env.ARDUINO_CLI) {
    return process.env.ARDUINO_CLI;
  }
  return (
    firstExisting([
      path.join(
        process.env.ProgramFiles || "C:\\Program Files",
        "Arduino IDE",
        "resources",
        "app",
        "lib",
        "backend",
        "resources",
        "arduino-cli.exe"
      ),
      path.join(
        process.env.LOCALAPPDATA || "",
        "Programs",
        "Arduino IDE",
        "resources",
        "app",
        "lib",
        "backend",
        "resources",
        "arduino-cli.exe"
      ),
      path.join(process.env.LOCALAPPDATA || "", "Arduino15", "arduino-cli.exe"),
    ]) ||
    findOnPath("arduino-cli") ||
    "arduino-cli"
  );
};

const ARDUINO_CLI = resolveArduinoCli();

const esptoolRoots = () => [
  path.join(os.homedir(), ".arduino15", "packages", "esp32", "tools", "esptool_py"),
  path.join(process.env.LOCALAPPDATA || "", "Arduino15", "packages", "esp32", "tools", "esptool_py"),
];

const resolveEsptool = () => {
  if (process.env.ESPTOOL) {
    return process.env.ESPTOOL;
  }
  const found = [];
  for (const root of esptoolRoots()) {
    if (!fs.existsSync(root)) {
      continue;
    }
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const versionDir = path.join(root, entry.name);
      for (const name of ["esptool.exe", "esptool.py", "esptool"]) {
        const candidate = path.join(versionDir, name);
        if (fs.existsSync(candidate)) {
          found.push(candidate);
        }
      }
    }
  }
  const exe = found.filter((file) => file.toLowerCase().endsWith(".exe"));
  if (exe.length) {
    return exe.sort().at(-1);
  }
  if (found.length) {
    return found.sort().at(-1);
  }
  return path.join(esptoolRoots()[process.platform === "win32" ? 1 : 0], "4.5.1", "esptool.py");
};

export const ESPTOOL = resolveEsptool();

const isEsptoolExe = (file) => /\.exe$/i.test(file) || !/\.py$/i.test(file);

export const FQBN = process.env.SOS_FQBN || "esp32:esp32:esp32:PartitionScheme=huge_app";
export const SERIAL_BAUD = Number(process.env.SOS_SERIAL_BAUD) || 115200;
export const SERIAL_CAPTURE_MS = Number(process.env.SOS_SERIAL_CAPTURE_MS) || 15000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const execOptions = (timeout) => ({
  timeout,
  maxBuffer: 8 * 1024 * 1024,
  env: process.env,
  windowsHide: true,
});

const emitProgress = (onProgress, payload) => {
  if (typeof onProgress === "function") {
    onProgress(payload);
  }
};

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(value)));

const runStream = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: process.env,
      windowsHide: true,
    });
    let combined = "";
    let lineBuf = "";
    let settled = false;
    let cancelled = Boolean(options.signal?.aborted);

    const finish = (ok, error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (ok) {
        resolve(combined.trim());
        return;
      }
      const wrapped = error || new Error("Command failed");
      wrapped.stdout = combined;
      wrapped.log = combined;
      if (cancelled) {
        wrapped.cancelled = true;
        wrapped.message = "Cancelled";
      }
      reject(wrapped);
    };

    const handleChunk = (chunk) => {
      const text = chunk.toString();
      combined += text;
      lineBuf += text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const lines = lineBuf.split("\n");
      lineBuf = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          options.onLine?.(trimmed);
        }
      }
    };

    const onAbort = () => {
      cancelled = true;
      killProcess(child);
    };

    child.stdout.on("data", handleChunk);
    child.stderr.on("data", handleChunk);

    const timer = setTimeout(() => {
      killProcess(child);
      finish(false, new Error(`Timed out after ${options.timeout ?? 120000}ms`));
    }, options.timeout ?? 120000);

    child.on("error", (error) => finish(false, error));
    child.on("close", (code) => {
      if (lineBuf.trim()) {
        options.onLine?.(lineBuf.trim());
      }
      if (cancelled) {
        finish(false, new Error("Cancelled"));
        return;
      }
      if (code === 0) {
        finish(true);
        return;
      }
      finish(false, new Error(combined.slice(-4000) || `Command failed (${code})`));
    });

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
      } else {
        options.signal.addEventListener("abort", onAbort);
      }
    }
  });

const runStdout = async (command, args, options = {}) => {
  const { stdout } = await execFileAsync(command, args, execOptions(options.timeout ?? 120000));
  return stdout.trim();
};

const mapCliPort = (entry) => {
  const port = entry.port || {};
  const matching = entry.matching_boards || [];
  const protocolLabel = port.protocol_label || "";
  const vid = port.properties?.vid;
  return {
    address: port.address || "",
    protocol: port.protocol || "",
    label: matching[0]?.name || protocolLabel || port.label || port.address || "",
    serialNumber: port.properties?.serialNumber || port.hardware_id || "",
    boards: matching.map((board) => board.name).filter(Boolean),
    usb: protocolLabel.includes("USB") || Boolean(vid),
  };
};

const deviceLabel = (device) => {
  if (/Silabser/i.test(device)) {
    return "Silicon Labs CP210x";
  }
  if (/USBSER/i.test(device)) {
    return "USB serial";
  }
  if (/BthModem/i.test(device)) {
    return "Bluetooth";
  }
  if (/VCP|CH34/i.test(device)) {
    return "USB-UART";
  }
  return "";
};

const portRank = (entry) => {
  if (/Silabser/i.test(entry.device || "")) {
    return 0;
  }
  if (entry.usb) {
    return 1;
  }
  if (entry.bluetooth) {
    return 3;
  }
  return 2;
};

const sortPorts = (ports) => [...ports].sort((left, right) => portRank(left) - portRank(right));

const mergePorts = (base, extra) => {
  const map = new Map(base.map((entry) => [entry.address, entry]));
  for (const entry of extra) {
    if (!entry.address) {
      continue;
    }
    const current = map.get(entry.address);
    if (!current) {
      map.set(entry.address, entry);
      continue;
    }
    map.set(entry.address, {
      ...current,
      ...entry,
      label:
        current.label && current.label !== current.address
          ? current.label
          : entry.label || current.label,
      serialNumber: entry.serialNumber || current.serialNumber,
      usb: Boolean(current.usb || entry.usb),
      bluetooth: Boolean(current.bluetooth && entry.bluetooth),
      device: current.device || entry.device,
    });
  }
  return [...map.values()];
};

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]);

const listArduinoCliPorts = async () => {
  const stdout = await runStdout(ARDUINO_CLI, ["board", "list", "--format", "json"], {
    timeout: 4000,
  });
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const detected = parsed.detected_ports || parsed;
  if (!Array.isArray(detected)) {
    return [];
  }
  return detected.map(mapCliPort).filter((entry) => entry.address);
};

const listWindowsSerialComm = async () => {
  let stdout = "";
  try {
    stdout = await runStdout("reg.exe", ["query", "HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM"], {
      timeout: 4000,
    });
  } catch {
    return [];
  }
  const ports = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = line.match(/\\Device\\(\S+)\s+REG_SZ\s+(COM\d+)/i);
    if (!match) {
      continue;
    }
    const device = match[1];
    const address = match[2];
    const bluetooth = /^BthModem/i.test(device);
    const usb = /USB|Silabser|VCP|CH34|CP21/i.test(device);
    ports.push({
      address,
      protocol: "serial",
      label: deviceLabel(device) || address,
      serialNumber: "",
      boards: [],
      usb,
      bluetooth,
      device,
    });
  }
  return ports;
};

export const listPorts = async () => {
  if (process.platform === "win32") {
    let windowsPorts = await listWindowsSerialComm();
    if (!windowsPorts.length) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      windowsPorts = await listWindowsSerialComm();
    }
    const hasUsb = windowsPorts.some((entry) => entry.usb);
    const visible = hasUsb ? windowsPorts.filter((entry) => !entry.bluetooth) : windowsPorts;
    if (visible.length) {
      return sortPorts(visible);
    }
    const cliPorts = await withTimeout(listArduinoCliPorts(), 2500).catch(() => []);
    return sortPorts(mergePorts(visible, cliPorts));
  }

  try {
    return sortPorts(await listArduinoCliPorts());
  } catch {
    return [];
  }
};

const parseMac = (text) => {
  const match = text.match(/MAC:\s*([0-9A-Fa-f:]{17})/i);
  return match ? match[1].toUpperCase() : null;
};

const parseChip = (text) => {
  const match = text.match(/Chip is ([^\n]+)/i);
  return match ? match[1].trim() : null;
};

const resolvePython = () => {
  if (process.env.PYTHON) {
    return process.env.PYTHON;
  }
  if (process.platform === "win32") {
    return findOnPath("python") || findOnPath("py") || "python";
  }
  return findOnPath("python3") || findOnPath("python") || "python3";
};

const runEsptool = async (port, onProgress, options = {}) => {
  const onLine = (line) => {
    if (/Connecting/i.test(line)) {
      emitProgress(onProgress, { phase: "identify", percent: 6, label: `Connecting on ${port}`, detail: line });
      return;
    }
    if (/Chip is|Chip type/i.test(line)) {
      emitProgress(onProgress, { phase: "identify", percent: 12, label: "Reading chip", detail: line });
      return;
    }
    if (/MAC:/i.test(line)) {
      emitProgress(onProgress, { phase: "identify", percent: 18, label: "Got factory MAC", detail: line });
    }
  };

  if (isEsptoolExe(ESPTOOL)) {
    return runStream(
      ESPTOOL,
      [
        "--chip",
        "esp32",
        "--port",
        port,
        "--before",
        "default-reset",
        "--after",
        "hard-reset",
        "read-mac",
      ],
      { timeout: 30000, onLine, signal: options.signal }
    );
  }
  return runStream(
    resolvePython(),
    [
      ESPTOOL,
      "--chip",
      "esp32",
      "--port",
      port,
      "--before",
      "default_reset",
      "--after",
      "hard_reset",
      "read_mac",
    ],
    { timeout: 30000, onLine, signal: options.signal }
  );
};

// Factory Wi-Fi MAC burned into the ESP32. USB-UART serial is NOT unique on
// CH340 clones — do not key history on that.
export const identifyPort = async (port, onProgress, options = {}) => {
  if (!fs.existsSync(ESPTOOL)) {
    const searched = esptoolRoots().join(", ");
    throw new Error(
      `esptool not found at ${ESPTOOL}. Install the ESP32 Arduino core or set ESPTOOL. Looked in: ${searched}`
    );
  }
  emitProgress(onProgress, { phase: "identify", percent: 2, label: `Reading MAC on ${port}`, detail: "" });
  const output = await runEsptool(port, onProgress, options);
  const mac = parseMac(output);
  if (!mac) {
    throw new Error(`Could not read MAC from ${port}. Reset the board into bootloader and retry.\n${output.slice(-500)}`);
  }
  emitProgress(onProgress, { phase: "identify", percent: 18, label: `Board ${mac}`, detail: mac });
  return {
    mac,
    chipModel: parseChip(output),
    raw: output,
  };
};

export const throwIfAborted = (signal) => {
  if (signal?.aborted) {
    const error = new Error("Cancelled");
    error.cancelled = true;
    throw error;
  }
};

const usbSerialOf = (ports, address) => {
  const entry = ports.find((item) => item.address === address);
  return (entry?.serialNumber || "").trim();
};

export const lockChipOnPort = async (port, onProgress, options = {}) => {
  throwIfAborted(options.signal);
  const identity = await identifyPort(port, onProgress, options);
  const ports = await listPorts();
  return {
    mac: identity.mac,
    chipModel: identity.chipModel,
    port,
    usbSerial: options.usbSerial || usbSerialOf(ports, port),
  };
};

export const confirmLockedChip = async (lock, onProgress, options = {}) => {
  throwIfAborted(options.signal);
  const ports = await listPorts();
  const present = ports.find((entry) => entry.address === lock.port);
  if (!present) {
    throw new Error(`Port ${lock.port} disappeared before upload. Plug the same board back in.`);
  }
  const currentUsb = usbSerialOf(ports, lock.port);
  const lockedUsb = (lock.usbSerial || "").trim();
  if (lockedUsb && currentUsb && lockedUsb !== currentUsb) {
    throw new Error(
      `USB identity changed on ${lock.port} before upload (locked ${lockedUsb}, now ${currentUsb})`
    );
  }
  emitProgress(onProgress, {
    phase: "identify",
    percent: 66,
    label: `Confirm MAC on ${lock.port}`,
    detail: lock.mac,
  });
  const identity = await identifyPort(lock.port, onProgress, options);
  if (identity.mac !== lock.mac) {
    throw new Error(`Chip changed on ${lock.port} before upload (locked ${lock.mac}, now ${identity.mac})`);
  }
  return identity;
};

export const compileSku = async (sku, onProgress, options = {}) => {
  throwIfAborted(options.signal);
  const sketch = await resolveSkuSketch(sku, options.sha || null);
  const files = sketch.files?.length ? sketch.files : [sketch];
  const sha = options.sha || sketch.sha || null;
  const contentHash = sketchContentHash(files);
  const id = cacheId({ sku: sku.id, sha, contentHash, fqbn: FQBN });
  const versionLabel = sha ? ` @ ${sha.slice(0, 7)}` : " (working tree)";
  const cached = readCache(sku.id, id);

  if (cached) {
    const bytes = cached.manifest.bytes ?? null;
    const hit = `cache hit ${sku.id}${versionLabel} (${bytes ? `${bytes.toLocaleString()} bytes` : "binaries"})`;
    options.onLog?.(hit);
    emitProgress(onProgress, {
      phase: "compile",
      percent: 65,
      label: `Using cached firmware${versionLabel}`,
      detail: cached.outDir,
    });
    return {
      work: null,
      sketchDir: null,
      outputDir: cached.outDir,
      log: cached.manifest.log || hit,
      bytes,
      cached: true,
    };
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), `sos-${sku.id}-`));
  const sketchDir = path.join(work, path.basename(sketch.fileName, ".ino"));
  const outputDir = path.join(work, "out");
  fs.mkdirSync(sketchDir);
  fs.mkdirSync(outputDir);
  for (const file of files) {
    fs.writeFileSync(path.join(sketchDir, file.fileName), file.contents);
  }

  let percent = 20;
  let lastGeneric = 0;
  emitProgress(onProgress, {
    phase: "compile",
    percent,
    label: `Compiling ${sku.name || sku.id}${versionLabel}`,
    detail: sketch.rel,
  });

  try {
    const log = await runStream(
      ARDUINO_CLI,
      ["compile", "--fqbn", FQBN, "--warnings", "none", "--output-dir", outputDir, sketchDir],
      {
        timeout: 300000,
        signal: options.signal,
        onLine: (line) => {
          options.onLog?.(line);
          if (/Compiling sketch/i.test(line)) {
            percent = Math.max(percent, 28);
            emitProgress(onProgress, { phase: "compile", percent, label: "Compiling sketch", detail: line });
            return;
          }
          if (/Compiling library/i.test(line)) {
            percent = Math.max(percent, 40);
            emitProgress(onProgress, { phase: "compile", percent, label: "Compiling libraries", detail: line });
            return;
          }
          if (/Compiling core/i.test(line)) {
            percent = Math.max(percent, 52);
            emitProgress(onProgress, { phase: "compile", percent, label: "Compiling ESP32 core", detail: line });
            return;
          }
          if (/Linking/i.test(line)) {
            percent = Math.max(percent, 60);
            emitProgress(onProgress, { phase: "compile", percent, label: "Linking firmware", detail: line });
            return;
          }
          if (/Sketch uses/i.test(line)) {
            percent = 65;
            emitProgress(onProgress, { phase: "compile", percent, label: line, detail: line });
            return;
          }
          const now = Date.now();
          if (now - lastGeneric < 150) {
            return;
          }
          lastGeneric = now;
          percent = Math.min(64, percent + 0.4);
          emitProgress(onProgress, {
            phase: "compile",
            percent: clampPercent(percent),
            label: "Compiling firmware",
            detail: line,
          });
        },
      }
    );
    const sizeMatch = log.match(/Sketch uses (\d+) bytes/);
    const bytes = sizeMatch ? Number(sizeMatch[1]) : null;
    writeCache({
      sku: sku.id,
      id,
      outDir: outputDir,
      manifest: {
        sku: sku.id,
        sha,
        contentHash: sha ? null : contentHash,
        fqbn: FQBN,
        bytes,
        compiledAt: new Date().toISOString(),
        log,
      },
    });
    emitProgress(onProgress, {
      phase: "compile",
      percent: 65,
      label: bytes ? `Compiled ${bytes.toLocaleString()} bytes` : "Compile complete",
      detail: "cached for next flash",
    });
    return {
      work,
      sketchDir,
      outputDir,
      log,
      bytes,
      cached: false,
    };
  } catch (error) {
    fs.rmSync(work, { recursive: true, force: true });
    if (error.cancelled) {
      const wrapped = new Error("Cancelled");
      wrapped.cancelled = true;
      wrapped.phase = "compile";
      wrapped.log = error.stdout || error.log || "";
      throw wrapped;
    }
    const log = error.stdout || error.log || error.message || "";
    const wrapped = new Error((log || "Compile failed").slice(-4000));
    wrapped.log = log;
    wrapped.phase = "compile";
    throw wrapped;
  }
};

export const uploadSketch = async (sketchDir, port, onProgress, onLog, options = {}) => {
  const inputDir = options.inputDir;
  emitProgress(onProgress, {
    phase: "upload",
    percent: 68,
    label: `Uploading to ${port}`,
    detail: inputDir ? "cached binaries" : "",
  });
  const args = inputDir
    ? ["upload", "-p", port, "--fqbn", FQBN, "--input-dir", inputDir]
    : ["upload", "-p", port, "--fqbn", FQBN, sketchDir];
  const log = await runStream(
    ARDUINO_CLI,
    args,
    {
      timeout: 180000,
      signal: options.signal,
      onLine: (line) => {
        onLog?.(line);
        const written = line.match(/\((\d+)\s*%\)/);
        if (written) {
          const flashPct = Number(written[1]);
          emitProgress(onProgress, {
            phase: "upload",
            percent: clampPercent(66 + flashPct * 0.33),
            label: `Writing flash (${flashPct}%)`,
            detail: line,
          });
          return;
        }
        if (/Connecting/i.test(line)) {
          emitProgress(onProgress, { phase: "upload", percent: 70, label: "Connecting for upload", detail: line });
          return;
        }
        if (/Hash of data verified/i.test(line)) {
          emitProgress(onProgress, { phase: "upload", percent: 98, label: "Verify complete", detail: line });
          return;
        }
        if (/Hard resetting|Hard reset/i.test(line)) {
          emitProgress(onProgress, { phase: "upload", percent: 99, label: "Resetting board", detail: line });
          return;
        }
        emitProgress(onProgress, { phase: "upload", percent: 72, label: `Uploading to ${port}`, detail: line });
      },
    }
  );
  return log;
};

const killProcess = (child) => {
  if (!child?.pid) {
    return;
  }
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    return;
  }
  child.kill("SIGTERM");
};

export const runMonitor = (port, options = {}) =>
  new Promise((resolve, reject) => {
    const baud = options.baud || SERIAL_BAUD;
    const child = spawn(
      ARDUINO_CLI,
      ["monitor", "-p", port, "-c", `baudrate=${baud}`, "--quiet", "--timestamp"],
      {
        env: process.env,
        windowsHide: true,
      }
    );
    let combined = "";
    let lineBuf = "";
    let settled = false;
    let killedByUs = false;
    let timer = null;

    const finish = (ok, error) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      options.signal?.removeEventListener("abort", onAbort);
      if (ok) {
        resolve(combined.trim());
        return;
      }
      const wrapped = error || new Error("Monitor failed");
      wrapped.log = combined;
      wrapped.stdout = combined;
      wrapped.phase = "serial";
      reject(wrapped);
    };

    const stop = () => {
      killedByUs = true;
      killProcess(child);
    };

    const onAbort = () => stop();

    const handleChunk = (chunk) => {
      const text = chunk.toString();
      combined += text;
      lineBuf += text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const lines = lineBuf.split("\n");
      lineBuf = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          options.onLog?.(trimmed);
        }
      }
    };

    child.stdout.on("data", handleChunk);
    child.stderr.on("data", handleChunk);

    child.on("error", (error) => finish(false, error));
    child.on("close", (code) => {
      if (lineBuf.trim()) {
        options.onLog?.(lineBuf.trim());
        combined += combined.endsWith(lineBuf) ? "" : lineBuf;
      }
      if (killedByUs || options.signal?.aborted) {
        finish(true);
        return;
      }
      if (code === 0) {
        finish(true);
        return;
      }
      finish(false, new Error(combined.slice(-4000) || `Monitor exited (${code})`));
    });

    if (options.durationMs) {
      timer = setTimeout(stop, options.durationMs);
    }
    if (options.signal) {
      if (options.signal.aborted) {
        stop();
      } else {
        options.signal.addEventListener("abort", onAbort);
      }
    }
  });

export const captureSerial = async (port, onProgress, onLog, options = {}) => {
  const durationMs = options.durationMs ?? SERIAL_CAPTURE_MS;
  const baud = options.baud ?? SERIAL_BAUD;
  emitProgress(onProgress, {
    phase: "serial",
    percent: 99,
    label: `Serial ${port} @ ${baud}`,
    detail: `${Math.round(durationMs / 1000)}s boot capture`,
  });
  throwIfAborted(options.signal);
  await sleep(options.settleMs ?? 1500);
  throwIfAborted(options.signal);

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await runMonitor(port, {
        baud,
        durationMs,
        onLog,
        signal: options.signal,
      });
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted || error.cancelled) {
        throw error;
      }
      onLog?.(`monitor retry ${attempt}: ${error.message}`);
      await sleep(1000);
    }
  }
  throw lastError || new Error("Serial monitor failed");
};

export const cleanupWork = (work) => {
  if (work) {
    fs.rmSync(work, { recursive: true, force: true });
  }
};
