import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useConsole } from "@/context/ConsoleContext";
import { kioskHref, kioskName } from "@/lib/kiosk";

export const PluggedInPanel = ({ onOnboard }) => {
  const { ports, portsLoading, busy, kiosks, handlePeekIdentify, refresh } = useConsole();
  const [chips, setChips] = useState({});
  const [scanningPort, setScanningPort] = useState("");
  const [scanTick, setScanTick] = useState(0);
  const scannedRef = useRef(new Set());

  useEffect(() => {
    const liveAddresses = new Set(ports.map((item) => item.address));
    setChips((current) => {
      const next = {};
      for (const [address, chip] of Object.entries(current)) {
        if (liveAddresses.has(address)) {
          next[address] = chip;
        }
      }
      return next;
    });
    for (const address of [...scannedRef.current]) {
      if (!liveAddresses.has(address)) {
        scannedRef.current.delete(address);
      }
    }
  }, [ports]);

  useEffect(() => {
    if (busy) {
      return undefined;
    }
    let cancelled = false;
    const run = async () => {
      for (const item of ports) {
        if (cancelled || scannedRef.current.has(item.address)) {
          continue;
        }
        setScanningPort(item.address);
        try {
          const result = await handlePeekIdentify(item.address, item.serialNumber);
          if (cancelled) {
            return;
          }
          scannedRef.current.add(item.address);
          setChips((current) => ({
            ...current,
            [item.address]: {
              status: "ok",
              port: item.address,
              label: item.label,
              mac: result.mac,
              chipModel: result.chipModel,
              kioskId: result.kioskId,
              name: result.name,
              slot: result.slot,
            },
          }));
          if (result.kioskId) {
            refresh().catch(() => {});
          }
        } catch (error) {
          if (cancelled) {
            return;
          }
          scannedRef.current.add(item.address);
          setChips((current) => ({
            ...current,
            [item.address]: {
              status: "error",
              port: item.address,
              label: item.label,
              error: error.message,
            },
          }));
        }
      }
      if (!cancelled) {
        setScanningPort("");
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [ports, busy, handlePeekIdentify, refresh, scanTick]);

  const handleRetry = (address) => {
    scannedRef.current.delete(address);
    setChips((current) => {
      const next = { ...current };
      delete next[address];
      return next;
    });
    setScanTick((current) => current + 1);
  };

  const rows = ports.map((item) => chips[item.address] || { status: "pending", port: item.address, label: item.label });

  return (
    <section className="flex flex-col gap-2" aria-label="Plugged in boards">
      <div>
        <h2 className="text-sm font-medium text-white">Plugged in</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Auto-reads the factory MAC on this bench. Onboard a new kit or open one you already have.
        </p>
      </div>
      {portsLoading && ports.length === 0 ? (
        <p className="rounded-lg border border-border px-3 py-4 text-sm text-muted-foreground">Looking for USB…</p>
      ) : ports.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          No USB device. Plug an ESP32 into this machine.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((chip) => {
            const matched = chip.mac ? kiosks.find((board) => board.mac === chip.mac) : null;
            const name = matched ? kioskName(matched) : chip.name;
            return (
              <li
                key={chip.port}
                className="flex items-start gap-2.5 rounded-lg border border-border bg-accent/20 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-card-foreground">
                    {chip.status === "ok"
                      ? name || "Unknown board"
                      : chip.status === "error"
                        ? "Could not read chip"
                        : `Reading ${chip.port}…`}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {chip.port}
                    {chip.mac ? ` · ${chip.mac}` : ""}
                    {chip.chipModel ? ` · ${chip.chipModel}` : ""}
                  </p>
                  {chip.status === "error" ? (
                    <p className="mt-1 text-xs text-destructive">{chip.error}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {chip.status === "ok" && matched ? (
                    <Button asChild size="sm" variant="outline">
                      <Link to={kioskHref(matched)} aria-label={`Open ${name}`}>
                        Open
                      </Link>
                    </Button>
                  ) : null}
                  {chip.status === "ok" && !matched ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onOnboard(chip)}
                      aria-label={`Onboard ${chip.mac}`}
                    >
                      Onboard
                    </Button>
                  ) : null}
                  {chip.status === "error" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleRetry(chip.port)}
                      disabled={Boolean(busy) || scanningPort === chip.port}
                      aria-label={`Retry identify on ${chip.port}`}
                    >
                      Retry
                    </Button>
                  ) : null}
                  {chip.status === "pending" || scanningPort === chip.port ? (
                    <span className="text-xs text-muted-foreground">Identifying…</span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
