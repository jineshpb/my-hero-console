import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { Columns2, Copy, Plus } from "lucide-react";
import { ConsoleAlert } from "@/components/ConsoleAlert";
import { KioskTabs } from "@/components/KioskTabs";
import { StatusLight } from "@/components/StatusLight";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useKiosk } from "@/hooks/useKiosk";
import {
  comLightLabel,
  isUsbConnected,
  kitLabel,
  kioskName,
  portSelectOptions,
} from "@/lib/kiosk";

export const KioskDetailPage = () => {
  const navigate = useNavigate();
  const {
    kioskId,
    mac,
    board,
    ready,
    identity,
    ports,
    portsLoading,
    port,
    setPort,
    busy,
    error,
    notice,
    progress,
    handleIdentify,
    setFlashPanelOpen,
    dismissAlerts,
  } = useKiosk();
  const [copied, setCopied] = useState(false);
  const usbMismatch = Boolean(identity?.mac && identity.mac !== mac);

  useEffect(() => {
    if (!board?.last_port) {
      return;
    }
    if (!ports.some((item) => item.address === board.last_port)) {
      return;
    }
    setPort((current) =>
      current && ports.some((item) => item.address === current) ? current : board.last_port
    );
  }, [board?.last_port, ports, setPort]);

  if (!ready) {
    return <p className="text-sm text-muted-foreground">Loading kiosk…</p>;
  }

  if (!board) {
    return (
      <div>
        <p className="text-2xl font-medium text-white">Unassigned</p>
        <p className="mt-3 text-sm text-muted-foreground">
          No kiosk yet for <span className="font-mono">{mac}</span>. Identify USB first.
        </p>
        <Button className="mt-4" variant="outline" asChild>
          <Link to="/kiosks">Back to kiosks</Link>
        </Button>
      </div>
    );
  }

  const name = kioskName(board);
  const usbOn = isUsbConnected(board, ports, identity);
  const portsOn = ports.length > 0;
  const selectedPort = ports.find((item) => item.address === port);
  const kit = kitLabel(board.last_sku);

  const handleCopyMac = async () => {
    try {
      await navigator.clipboard.writeText(board.mac);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const alertTitle = error || notice || (usbMismatch ? "USB identity mismatch" : "");
  const alertDescription = error && notice
    ? notice
    : usbMismatch
      ? `USB identified as ${identity.mac}. Flash still writes the plugged-in chip, not this kiosk record.`
      : progress?.detail && progress.mode !== "flash"
        ? progress.detail
        : "";
  const alertAction = error ? "Logs" : notice ? "Dismiss" : "";

  const handleAlertAction = () => {
    if (error) {
      navigate(`/kiosks/${kioskId}/logs`);
      setFlashPanelOpen(true);
      return;
    }
    dismissAlerts();
  };

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <h1 className="text-2xl font-medium text-white">{name}</h1>
            <div className="flex gap-4">
              <StatusLight on={usbOn} label="USB" />
              <StatusLight
                on={portsOn}
                pulse={portsLoading && !portsOn}
                label={comLightLabel(ports, portsLoading, selectedPort)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {kit ? (
                <span className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium">
                  {kit}
                </span>
              ) : null}
              <button
                type="button"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 font-mono text-xs font-medium"
                onClick={handleCopyMac}
                aria-label={copied ? "MAC copied" : `Copy MAC ${board.mac}`}
              >
                {board.mac}
                <Copy className="size-3" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="w-auto min-w-56 max-w-xs"
              value={port}
              onChange={setPort}
              aria-label="USB serial port"
              options={portSelectOptions(ports, portsLoading)}
            />
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={handleIdentify}
              disabled={!port || Boolean(busy)}
              aria-label="Read ESP32 MAC from the selected USB port"
            >
              <Columns2 className="size-4" aria-hidden="true" />
              {busy === "identify" ? "Identifying…" : "Identify"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => setFlashPanelOpen(true)}
              aria-label="Open flash panel"
            >
              <Plus className="size-4" aria-hidden="true" />
              Flash
            </Button>
          </div>
        </div>

        {alertTitle ? (
          <ConsoleAlert
            tone={error || usbMismatch ? "danger" : "success"}
            title={alertTitle}
            description={alertDescription}
            actionLabel={alertAction}
            onAction={handleAlertAction}
          />
        ) : null}
      </div>

      <div>
        <KioskTabs kioskId={kioskId} />
        <div className="pt-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
};
