import { useCallback, useEffect, useRef, useState } from "react";

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body;
};

const readSse = async (response, onEvent) => {
  if (!response.body) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.error || `HTTP ${response.status}`);
    }
    onEvent({ type: "result", ...body });
    return body;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  let streamError = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const data = chunk
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data) {
        continue;
      }
      const event = JSON.parse(data);
      onEvent(event);
      if (event.type === "result") {
        result = event;
      }
      if (event.type === "error") {
        streamError = event.error || "Request failed";
      }
    }
  }

  if (streamError) {
    throw new Error(streamError);
  }
  if (!result) {
    throw new Error("No result from server");
  }
  return result;
};

const streamApi = async (path, body, onEvent) => {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok && response.status !== 200) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return readSse(response, onEvent);
};

const FLASH_STEPS = [
  { id: "identify", label: "Identify" },
  { id: "compile", label: "Compile" },
  { id: "upload", label: "Upload" },
];

const formatCommit = (version) => {
  const day = version.date ? version.date.slice(0, 10) : "";
  const note = version.subject || "(no message)";
  return `${version.shortSha} · ${day} · ${note}`;
};

const formatElapsed = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
};

const ProgressPanel = ({ progress, elapsed }) => {
  const steps = progress.mode === "identify" ? FLASH_STEPS.slice(0, 1) : FLASH_STEPS;
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.id === progress.phase)
  );
  const percent =
    progress.phase === "done"
      ? 100
      : progress.mode === "identify"
        ? Math.min(100, Math.round(((progress.percent || 0) / 18) * 100))
        : progress.percent;

  return (
    <section
      className="mb-4 rounded-xl border border-amber-900/70 bg-zinc-900/80 p-4"
      aria-live="polite"
      aria-label="Job progress"
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <p className="text-sm text-amber-200">{progress.label || "Working…"}</p>
        <p className="font-mono text-xs text-zinc-400">
          {percent}% · {formatElapsed(elapsed)}
        </p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-zinc-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={progress.label || "Progress"}
      >
        <div className="h-full rounded-full bg-cyan-500 transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
      <ol className="mt-3 flex flex-wrap gap-3 text-xs">
        {steps.map((step, index) => {
          const complete = progress.phase === "done" || index < currentIndex;
          const active = progress.phase !== "done" && index === currentIndex;
          const tone = complete ? "text-emerald-400" : active ? "text-amber-200" : "text-zinc-500";
          return (
            <li key={step.id} className={tone}>
              {complete ? "✓" : active ? "●" : "○"} {step.label}
            </li>
          );
        })}
      </ol>
      {progress.detail ? (
        <p className="mt-3 truncate font-mono text-xs text-zinc-500" title={progress.detail}>
          {progress.detail}
        </p>
      ) : null}
    </section>
  );
};

const formatTime = (value) => {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString();
};

const App = () => {
  const [git, setGit] = useState(null);
  const [skus, setSkus] = useState([]);
  const emptyPortStreakRef = useRef(0);
  const [ports, setPorts] = useState([]);
  const [portsLoading, setPortsLoading] = useState(true);
  const [boards, setBoards] = useState([]);
  const [flashes, setFlashes] = useState([]);
  const [skuId, setSkuId] = useState("combined");
  const [sha, setSha] = useState("");
  const [versions, setVersions] = useState([]);
  const [firmwareGit, setFirmwareGit] = useState("");
  const [firmwareBranch, setFirmwareBranch] = useState("main");
  const [pulling, setPulling] = useState(false);
  const [port, setPort] = useState("");
  const [identity, setIdentity] = useState(null);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingMac, setEditingMac] = useState("");
  const [slotDraft, setSlotDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [filterMac, setFilterMac] = useState("");

  const applyPortList = useCallback((portList) => {
    if (!Array.isArray(portList)) {
      return;
    }
    if (portList.length) {
      emptyPortStreakRef.current = 0;
      setPorts(portList);
      setPort((current) =>
        current && portList.some((item) => item.address === current) ? current : portList[0].address
      );
      return;
    }
    emptyPortStreakRef.current += 1;
    if (emptyPortStreakRef.current < 3) {
      return;
    }
    setPorts([]);
    setPort("");
  }, []);

  const refreshPorts = useCallback(async () => {
    try {
      const portList = await api("/api/ports");
      applyPortList(portList);
    } catch {
      emptyPortStreakRef.current += 1;
    } finally {
      setPortsLoading(false);
    }
  }, [applyPortList]);

  const refresh = useCallback(async () => {
    const [gitInfo, skuList, portResult, boardList, flashList, versionResult, source] = await Promise.all([
      api("/api/git"),
      api("/api/skus"),
      api("/api/ports")
        .then((list) => ({ list }))
        .catch(() => ({ list: null })),
      api("/api/boards"),
      api(filterMac ? `/api/flashes?mac=${encodeURIComponent(filterMac)}` : "/api/flashes"),
      api("/api/versions")
        .then((payload) => payload)
        .catch(() => null),
      api("/api/firmware-source").catch(() => null),
    ]);
    setGit(gitInfo);
    setSkus(skuList);
    setSkuId((current) =>
      skuList.some((item) => item.id === current) ? current : skuList[0]?.id || ""
    );
    setBoards(boardList);
    setFlashes(flashList);
    if (portResult.list) {
      applyPortList(portResult.list);
    }
    if (versionResult?.versions) {
      setVersions(versionResult.versions);
      setSha((current) => current || versionResult.versions[0]?.sha || "");
    }
    if (source) {
      setFirmwareGit(source.firmwareGit || "");
      setFirmwareBranch(source.firmwareBranch || "main");
    }
    setPortsLoading(false);
  }, [applyPortList, filterMac]);

  useEffect(() => {
    refresh().catch((err) => {
      setError(err.message);
      setPortsLoading(false);
    });
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (busy) {
        return;
      }
      refreshPorts();
    }, 3000);
    return () => clearInterval(timer);
  }, [busy, refreshPorts]);

  useEffect(() => {
    if (!busy) {
      return undefined;
    }
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => clearInterval(timer);
  }, [busy]);

  const handleProgressEvent = (mode, event) => {
    if (event.type !== "progress") {
      return;
    }
    setProgress((current) => ({
      mode,
      phase: event.phase,
      percent: event.percent ?? current?.percent ?? 0,
      label: event.label || current?.label || "Working…",
      detail: event.detail || "",
    }));
  };

  const handleIdentify = async () => {
    setError("");
    setNotice("");
    setBusy("identify");
    setProgress({
      mode: "identify",
      phase: "identify",
      percent: 1,
      label: "Reading chip MAC…",
      detail: "",
    });
    try {
      const usbSerial = ports.find((item) => item.address === port)?.serialNumber;
      const result = await streamApi("/api/identify", { port, usbSerial }, (event) =>
        handleProgressEvent("identify", event)
      );
      setProgress((current) => ({
        ...(current || {}),
        mode: "identify",
        phase: "done",
        percent: 100,
        label: `Board ${result.mac}`,
      }));
      setIdentity(result);
      setNotice(`Board ${result.mac}`);
      setFilterMac(result.mac);
      await refresh();
    } catch (err) {
      setError(err.message);
      setProgress(null);
    } finally {
      setBusy("");
    }
  };

  const handleFlash = async () => {
    setError("");
    setNotice("");
    setBusy("flash");
    setProgress({
      mode: "flash",
      phase: "identify",
      percent: 1,
      label: "Starting flash…",
      detail: "",
    });
    try {
      const usbSerial = ports.find((item) => item.address === port)?.serialNumber;
      const result = await streamApi("/api/flash", { sku: skuId, port, usbSerial, sha }, (event) =>
        handleProgressEvent("flash", event)
      );
      setProgress({
        mode: "flash",
        phase: "done",
        percent: 100,
        label: `Wrote ${result.sku} to ${result.mac}`,
        detail: "",
      });
      setIdentity({ mac: result.mac });
      setFilterMac(result.mac);
      setNotice(`Wrote ${result.sku} to ${result.mac} @ ${result.git?.shortSha || "?"}`);
      await refresh();
    } catch (err) {
      setError(err.message);
      setProgress(null);
      refresh().catch(() => {});
    } finally {
      setBusy("");
    }
  };

  const handlePull = async () => {
    setError("");
    setNotice("");
    setPulling(true);
    try {
      const payload = await api("/api/git/fetch", { method: "POST" });
      setGit(payload);
      setVersions(payload.versions || []);
      if (payload.skus?.length) {
        setSkus(payload.skus);
        setSkuId((current) =>
          payload.skus.some((item) => item.id === current) ? current : payload.skus[0].id
        );
      }
      setSha((current) => {
        if (current && (payload.versions || []).some((item) => item.sha === current)) {
          return current;
        }
        return payload.versions?.[0]?.sha || current;
      });
      setNotice(`Pulled ${payload.versions?.length || 0} commits from GitHub`);
    } catch (err) {
      setError(err.message);
    } finally {
      setPulling(false);
    }
  };

  const handleSaveFirmwareSource = async (event) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setPulling(true);
    try {
      await api("/api/firmware-source", {
        method: "PUT",
        body: JSON.stringify({ firmwareGit, firmwareBranch }),
      });
      const payload = await api("/api/git/fetch", { method: "POST" });
      setGit(payload);
      setVersions(payload.versions || []);
      if (payload.skus?.length) {
        setSkus(payload.skus);
        setSkuId((current) =>
          payload.skus.some((item) => item.id === current) ? current : payload.skus[0].id
        );
      }
      setSha(payload.versions?.[0]?.sha || "");
      setNotice(`Firmware ${payload.shortSha || "ready"} · ${payload.versions?.length || 0} commits`);
    } catch (err) {
      setError(err.message);
    } finally {
      setPulling(false);
    }
  };

  const handleSaveBoard = async (event) => {
    event.preventDefault();
    if (!editingMac) {
      return;
    }
    setError("");
    try {
      await api(`/api/boards/${encodeURIComponent(editingMac)}`, {
        method: "PATCH",
        body: JSON.stringify({ slot: slotDraft, notes: notesDraft }),
      });
      setEditingMac("");
      await refresh();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStartEdit = (board) => {
    setEditingMac(board.mac);
    setSlotDraft(board.slot || "");
    setNotesDraft(board.notes || "");
  };

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-cyan-400">USB bench</p>
          <h1 className="text-2xl font-semibold text-white">SOS fleet console</h1>
          <p className="mt-1 text-sm text-zinc-400">
            History is keyed by the ESP32 factory MAC, not the USB chip serial.
          </p>
        </div>
        <div className="text-right font-mono text-xs text-zinc-400">
          <p>
            {git?.branch || "no git"} · {git?.shortSha || "—"}
            {git?.dirty ? " dirty" : ""}
          </p>
          <p className="max-w-xs truncate text-zinc-500">{git?.subject}</p>
          {git?.remote ? <p className="max-w-xs truncate text-zinc-600">{git.remote}</p> : null}
        </div>
      </header>

      {error ? (
        <p className="mb-4 rounded-md border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-md border border-cyan-800 bg-cyan-950/40 px-3 py-2 text-sm text-cyan-100">
          {notice}
        </p>
      ) : null}
      {progress ? <ProgressPanel progress={progress} elapsed={elapsed} /> : null}

      <form
        className="mb-4 grid gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 md:grid-cols-[1fr_10rem_auto]"
        onSubmit={handleSaveFirmwareSource}
      >
        <label className="block text-sm md:col-span-1">
          <span className="text-zinc-400">Firmware git</span>
          <input
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs"
            value={firmwareGit}
            onChange={(event) => setFirmwareGit(event.target.value)}
            placeholder="https://github.com/you/sos-button-firmware.git"
            aria-label="Firmware git URL or local path"
          />
        </label>
        <label className="block text-sm">
          <span className="text-zinc-400">Branch</span>
          <input
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
            value={firmwareBranch}
            onChange={(event) => setFirmwareBranch(event.target.value)}
            aria-label="Firmware git branch"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="rounded-md bg-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-600 disabled:opacity-40"
            disabled={Boolean(busy) || pulling || !firmwareGit}
            aria-label="Save firmware git and pull versions"
          >
            {pulling ? "Pulling…" : "Save & pull"}
          </button>
        </div>
      </form>

      <section className="mb-8 grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="block text-sm">
          <span className="text-zinc-400">Sketch</span>
          <select
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
            value={skuId}
            onChange={(event) => setSkuId(event.target.value)}
            aria-label="Firmware SKU"
          >
            {skus.map((sku) => (
              <option key={sku.id} value={sku.id}>
                {sku.name} — {sku.hardware}
              </option>
            ))}
          </select>
        </label>
        <div className="block text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-400">Firmware version</span>
            <button
              type="button"
              className="text-xs text-cyan-400 hover:underline disabled:opacity-40"
              onClick={handlePull}
              disabled={Boolean(busy) || pulling}
              aria-label="Fetch latest commits from GitHub"
            >
              {pulling ? "Pulling…" : "Pull from GitHub"}
            </button>
          </div>
          <select
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
            value={sha}
            onChange={(event) => setSha(event.target.value)}
            aria-label="Firmware git commit"
          >
            <option value="">Firmware HEAD (pulled tree)</option>
            {versions.map((version) => (
              <option key={version.sha} value={version.sha}>
                {formatCommit(version)}
              </option>
            ))}
          </select>
        </div>
        <label className="block text-sm">
          <span className="text-zinc-400">Serial port</span>
          <select
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
            value={port}
            onChange={(event) => setPort(event.target.value)}
            aria-label="USB serial port"
          >
            {ports.length === 0 ? (
              <option value="">
                {portsLoading ? "Looking for USB boards…" : "No USB serial ports"}
              </option>
            ) : null}
            {ports.map((item) => (
              <option key={item.address} value={item.address}>
                {item.address}
                {item.label && item.label !== item.address ? ` — ${item.label}` : ""}
                {item.serialNumber ? ` (${item.serialNumber})` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            className="rounded-md bg-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-600 disabled:opacity-40"
            onClick={handleIdentify}
            disabled={!port || Boolean(busy)}
            aria-label="Read ESP32 MAC address from the plugged-in board"
          >
            Identify
          </button>
          <button
            type="button"
            className="rounded-md bg-cyan-700 px-4 py-2 text-sm text-white hover:bg-cyan-600 disabled:opacity-40"
            onClick={handleFlash}
            disabled={!port || !skuId || Boolean(busy)}
            aria-label="Compile and upload firmware to the plugged-in board"
          >
            Flash
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-600 px-3 py-2 text-sm hover:bg-zinc-800"
            onClick={() => refresh().catch((err) => setError(err.message))}
            aria-label="Refresh ports and history"
          >
            Refresh
          </button>
        </div>
        {identity ? (
          <p className="font-mono text-sm text-cyan-300 md:col-span-2 xl:col-span-4">
            Plugged in: {identity.mac}
            {identity.chipModel ? ` · ${identity.chipModel}` : ""}
          </p>
        ) : null}
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg text-white">Boards</h2>
          <p className="text-xs text-zinc-500">Assign a slot after identify so the MAC maps to kit 01–05.</p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">MAC</th>
                <th className="px-3 py-2 font-medium">Slot</th>
                <th className="px-3 py-2 font-medium">Writes</th>
                <th className="px-3 py-2 font-medium">Last SKU / SHA</th>
                <th className="px-3 py-2 font-medium">Last seen</th>
                <th className="px-3 py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {boards.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-zinc-500" colSpan={6}>
                    Plug a board in and press Identify. The MAC is burned into the ESP32.
                  </td>
                </tr>
              ) : (
                boards.map((board) => (
                  <tr key={board.mac} className="border-t border-zinc-800">
                    <td className="px-3 py-2 font-mono text-xs">
                      <button
                        type="button"
                        className="text-cyan-300 hover:underline"
                        onClick={() => setFilterMac(board.mac)}
                      >
                        {board.mac}
                      </button>
                    </td>
                    <td className="px-3 py-2">{board.slot || "—"}</td>
                    <td className="px-3 py-2">{board.flash_count}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {board.last_sku || "—"} {board.last_sha || ""}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{formatTime(board.last_seen_at)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-xs text-zinc-300 hover:text-white"
                        onClick={() => handleStartEdit(board)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {editingMac ? (
          <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={handleSaveBoard}>
            <p className="w-full font-mono text-xs text-zinc-400">{editingMac}</p>
            <label className="text-sm">
              Slot
              <input
                className="ml-2 rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                value={slotDraft}
                onChange={(event) => setSlotDraft(event.target.value)}
                placeholder="02"
                aria-label="Kit slot"
              />
            </label>
            <label className="text-sm">
              Notes
              <input
                className="ml-2 w-56 rounded border border-zinc-700 bg-zinc-950 px-2 py-1"
                value={notesDraft}
                onChange={(event) => setNotesDraft(event.target.value)}
                aria-label="Board notes"
              />
            </label>
            <button type="submit" className="rounded bg-zinc-700 px-3 py-1 text-sm">
              Save
            </button>
            <button type="button" className="text-sm text-zinc-400" onClick={() => setEditingMac("")}>
              Cancel
            </button>
          </form>
        ) : null}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg text-white">Write history</h2>
          {filterMac ? (
            <button
              type="button"
              className="text-xs text-cyan-400 hover:underline"
              onClick={() => setFilterMac("")}
            >
              Showing {filterMac} — clear filter
            </button>
          ) : (
            <p className="text-xs text-zinc-500">Every USB upload, including failures.</p>
          )}
        </div>
        <ul className="space-y-2">
          {flashes.length === 0 ? (
            <li className="text-sm text-zinc-500">No writes yet.</li>
          ) : (
            flashes.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 font-mono text-xs"
              >
                <span className={row.success ? "text-emerald-400" : "text-red-400"}>
                  {row.success ? "ok" : "fail"}
                </span>
                {" · "}
                {formatTime(row.finished_at)}
                {" · "}
                {row.sku}
                {" · "}
                {row.git_sha || "?"}
                {row.git_dirty ? " dirty" : ""}
                {" · "}
                <button type="button" className="text-cyan-300" onClick={() => setFilterMac(row.mac)}>
                  {row.mac}
                </button>
                {row.compile_bytes ? ` · ${row.compile_bytes} B` : ""}
                {row.error ? <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-red-300">{row.error}</pre> : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
};

export default App;
