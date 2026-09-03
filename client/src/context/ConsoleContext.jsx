import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, streamApi } from "@/lib/api";

const LIVE_LOG_MAX = 512 * 1024;

const ConsoleContext = createContext(null);

export const ConsoleProvider = ({ children }) => {
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
  const [liveLog, setLiveLog] = useState("");
  const [openLogId, setOpenLogId] = useState(null);
  const [flashLogs, setFlashLogs] = useState({});
  const [logLoadingId, setLogLoadingId] = useState(null);
  const [ready, setReady] = useState(false);
  const [flashPanelOpen, setFlashPanelOpen] = useState(false);
  const monitorAbortRef = useRef(null);

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
      api("/api/flashes"),
      api("/api/versions")
        .then((payload) => payload)
        .catch(() => null),
      api("/api/firmware-source").catch(() => null),
    ]);
    setGit(gitInfo);
    setSkus(skuList);
    setSkuId((current) => (skuList.some((item) => item.id === current) ? current : skuList[0]?.id || ""));
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
    setReady(true);
  }, [applyPortList]);

  useEffect(() => {
    refresh().catch((err) => {
      setError(err.message);
      setPortsLoading(false);
      setReady(true);
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
    if (event.type === "log") {
      const chunk = event.text || (event.line ? `${event.line}\n` : "");
      if (!chunk) {
        return;
      }
      setLiveLog((current) => {
        const next = current + chunk;
        return next.length > LIVE_LOG_MAX ? next.slice(-LIVE_LOG_MAX) : next;
      });
      return;
    }
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
      await refresh();
      return result;
    } catch (err) {
      setError(err.message);
      setProgress(null);
      return null;
    } finally {
      setBusy("");
    }
  };

  const handleFlash = async () => {
    setFlashPanelOpen(true);
    setError("");
    setNotice("");
    setLiveLog("");
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
        label: result.accept
          ? `Wrote ${result.sku} to ${result.mac} · ${result.accept.score} ${result.accept.grade}`
          : `Wrote ${result.sku} to ${result.mac}`,
        detail: result.accept?.summary || "",
      });
      setIdentity({ mac: result.mac });
      const acceptBit = result.accept ? ` · ${result.accept.score} ${result.accept.grade}` : "";
      setNotice(
        `Wrote ${result.sku} to ${result.mac} @ ${result.git?.shortSha || "?"}${result.cached ? " (cached)" : ""}${acceptBit}`
      );
      if (result.accept?.grade === "fail") {
        setError(result.accept.summary || "Boot acceptance failed");
      }
      await refresh();
      return result;
    } catch (err) {
      setError(err.message);
      setProgress((current) =>
        current
          ? { ...current, label: "Flash failed", detail: err.message }
          : { mode: "flash", phase: "upload", percent: 0, label: "Flash failed", detail: err.message }
      );
      refresh().catch(() => {});
      return null;
    } finally {
      setBusy("");
    }
  };

  const handleMonitor = async () => {
    if (busy === "monitor") {
      monitorAbortRef.current?.abort();
      return;
    }
    setError("");
    setNotice("");
    setLiveLog("");
    setBusy("monitor");
    setProgress({
      mode: "monitor",
      phase: "serial",
      percent: 100,
      label: `Serial ${port} @ 115200`,
      detail: "Listening…",
    });
    const controller = new AbortController();
    monitorAbortRef.current = controller;
    try {
      await streamApi("/api/monitor", { port }, (event) => handleProgressEvent("monitor", event), {
        signal: controller.signal,
        requireResult: false,
      });
      setProgress((current) => ({
        ...(current || {}),
        mode: "monitor",
        phase: "done",
        percent: 100,
        label: "Serial monitor stopped",
      }));
    } catch (err) {
      if (err.name === "AbortError") {
        setProgress((current) => ({
          ...(current || {}),
          mode: "monitor",
          phase: "done",
          percent: 100,
          label: "Serial monitor stopped",
        }));
      } else {
        setError(err.message);
        setProgress((current) =>
          current
            ? { ...current, label: "Serial monitor failed", detail: err.message }
            : {
                mode: "monitor",
                phase: "serial",
                percent: 0,
                label: "Serial monitor failed",
                detail: err.message,
              }
        );
      }
    } finally {
      setBusy("");
      monitorAbortRef.current = null;
    }
  };

  const handleToggleLog = async (id) => {
    if (openLogId === id) {
      setOpenLogId(null);
      return;
    }
    setOpenLogId(id);
    if (flashLogs[id]) {
      return;
    }
    setLogLoadingId(id);
    try {
      const response = await fetch(`/api/flashes/${id}/log`);
      const text = await response.text();
      if (!response.ok) {
        throw new Error(text || `HTTP ${response.status}`);
      }
      setFlashLogs((current) => ({ ...current, [id]: text }));
    } catch (err) {
      setFlashLogs((current) => ({ ...current, [id]: err.message }));
    } finally {
      setLogLoadingId(null);
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

  const handleSaveBoard = async (mac, { slot, notes }) => {
    setError("");
    await api(`/api/boards/${encodeURIComponent(mac)}`, {
      method: "PATCH",
      body: JSON.stringify({ slot, notes }),
    });
    await refresh();
  };

  const value = useMemo(
    () => ({
      git,
      skus,
      ports,
      portsLoading,
      boards,
      flashes,
      skuId,
      setSkuId,
      sha,
      setSha,
      versions,
      firmwareGit,
      setFirmwareGit,
      firmwareBranch,
      setFirmwareBranch,
      pulling,
      port,
      setPort,
      identity,
      busy,
      progress,
      elapsed,
      error,
      notice,
      liveLog,
      openLogId,
      flashLogs,
      logLoadingId,
      ready,
      flashPanelOpen,
      setFlashPanelOpen,
      setNotice,
      dismissAlerts: () => {
        setError("");
        setNotice("");
      },
      refresh,
      handleIdentify,
      handleFlash,
      handleMonitor,
      handleToggleLog,
      handlePull,
      handleSaveFirmwareSource,
      handleSaveBoard,
      setError,
    }),
    [
      git,
      skus,
      ports,
      portsLoading,
      boards,
      flashes,
      skuId,
      sha,
      versions,
      firmwareGit,
      firmwareBranch,
      pulling,
      port,
      identity,
      busy,
      progress,
      elapsed,
      error,
      notice,
      liveLog,
      openLogId,
      flashLogs,
      logLoadingId,
      ready,
      flashPanelOpen,
      refresh,
    ]
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
};

export const useConsole = () => {
  const value = useContext(ConsoleContext);
  if (!value) {
    throw new Error("useConsole must be used within ConsoleProvider");
  }
  return value;
};
