import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Columns2, Copy, Plus } from "lucide-react";
import { ConsoleAlert } from "@/components/ConsoleAlert";
import { KioskTabs } from "@/components/KioskTabs";
import { StatusLight } from "@/components/StatusLight";
import { ViewModeTabs, isLiveView } from "@/components/ViewModeTabs";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useKiosk } from "@/hooks/useKiosk";
import { LiveKioskPanel } from "@/pages/live/LiveKioskPanel";
import {
  comLightLabel,
  fieldPresence,
  fieldPresenceLabel,
  formatRelative,
  isUsbConnected,
  kitLabel,
  kioskName,
  kiosksHref,
  portSelectOptions,
} from "@/lib/kiosk";

export const KioskDetailPage = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const live = isLiveView(params);
  const {
    kioskId,
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
  const usbMismatch = Boolean(identity?.mac && board?.mac && identity.mac !== board.mac);

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
        <p className="text-2xl font-medium text-white">Unknown kiosk</p>
        <p className="mt-3 text-sm text-muted-foreground">
          No kiosk for <span className="font-mono">{kioskId}</span>. Create one from the kiosk list.
        </p>
        <Button className="mt-4" variant="outline" asChild>
          <Link to={kiosksHref({ live })}>Back to kiosks</Link>
        </Button>
      </div>
    );
  }

  const name = kioskName(board);
  const usbOn = isUsbConnected(board, ports, identity);
  const portsOn = ports.length > 0;
  const selectedPort = ports.find((item) => item.address === port);
  const kit = kitLabel(board.last_sku);
  const field = fieldPresence(board);

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
          <div className="grid min-w-0 flex-1 grid-cols-[1.5rem_minmax(0,1fr)] items-center gap-x-[9px] gap-y-2">
            <Link
              to={kiosksHref({ live })}
              aria-label="Back to kiosks"
              className="inline-flex size-6 items-center justify-center rounded-md text-white hover:bg-accent"
            >
              <ArrowLeft className="size-6" aria-hidden="true" />
            </Link>
            <div className="flex min-w-0 items-center gap-[9px]">
              <h1 className="min-w-0 truncate text-2xl font-medium text-white">{name}</h1>
              <ViewModeTabs className="shrink-0" />
            </div>
            <div className="col-start-2 flex gap-4">
              {live ? (
                <>
                  <StatusLight
                    on={field === "online"}
                    pulse={field === "stale"}
                    label={fieldPresenceLabel(field)}
                  />
                  <StatusLight
                    on={Boolean(board.last_sos_at)}
                    label={board.last_sos_at ? `SOS ${formatRelative(board.last_sos_at)}` : "No SOS"}
                  />
                </>
              ) : (
                <>
                  <StatusLight on={usbOn} label="USB" />
                  <StatusLight
                    on={portsOn}
                    pulse={portsLoading && !portsOn}
                    label={comLightLabel(ports, portsLoading, selectedPort)}
                  />
                </>
              )}
            </div>
            <div className="col-start-2 flex flex-wrap items-center gap-2">
              {live ? (
                <>
                  {board.kit_id ? (
                    <span className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 font-mono text-xs font-medium">
                      {board.kit_id}
                    </span>
                  ) : (
                    <span className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground">
                      No kit ID
                    </span>
                  )}
                  {board.location_label ? (
                    <span className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium">
                      {board.location_label}
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  {kit ? (
                    <span className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium">
                      {kit}
                    </span>
                  ) : null}
                  {board.mac ? (
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 font-mono text-xs font-medium"
                      onClick={handleCopyMac}
                      aria-label={copied ? "MAC copied" : `Copy MAC ${board.mac}`}
                    >
                      {board.mac}
                      <Copy className="size-3" aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground">
                      No controller yet
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {!live ? (
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
                onClick={() => handleIdentify(board.id)}
                disabled={!port || Boolean(busy)}
                aria-label="Read ESP32 MAC from the selected USB port"
              >
                <Columns2 className="size-4" aria-hidden="true" />
                {busy === "identify" ? "Identifying…" : board.mac ? "Identify" : "Bind USB"}
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
          ) : null}
        </div>

        {!live && alertTitle ? (
          <ConsoleAlert
            tone={error || usbMismatch ? "danger" : "success"}
            title={alertTitle}
            description={alertDescription}
            actionLabel={alertAction}
            onAction={handleAlertAction}
          />
        ) : null}
      </div>

      {live ? (
        <LiveKioskPanel kioskId={board.id || kioskId} />
      ) : (
        <div>
          <KioskTabs kioskId={kioskId} />
          <div className="pt-6">
            <Outlet />
          </div>
        </div>
      )}
    </div>
  );
};
