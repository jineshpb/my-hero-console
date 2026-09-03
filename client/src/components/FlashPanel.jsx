import { useLocation } from "react-router-dom";
import { ProgressPanel } from "@/components/ProgressPanel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useConsole } from "@/context/ConsoleContext";
import { formatCommit, kioskIdToMac, kioskName, portSelectOptions } from "@/lib/kiosk";

export const FlashPanel = () => {
  const location = useLocation();
  const {
    flashPanelOpen,
    setFlashPanelOpen,
    boards,
    identity,
    skus,
    skuId,
    setSkuId,
    sha,
    setSha,
    versions,
    ports,
    portsLoading,
    port,
    setPort,
    busy,
    progress,
    elapsed,
    liveLog,
    handleFlash,
  } = useConsole();

  const routeId = location.pathname.match(/^\/kiosks\/([^/]+)/)?.[1];
  const pageMac = routeId ? kioskIdToMac(routeId) : "";
  const target =
    boards.find((board) => board.mac === identity?.mac) ||
    boards.find((board) => board.mac === pageMac) ||
    null;
  const canClose = busy !== "flash";

  const handleOpenChange = (open) => {
    if (!open && !canClose) {
      return;
    }
    setFlashPanelOpen(open);
  };

  return (
    <Sheet open={flashPanelOpen} onOpenChange={handleOpenChange}>
      <SheetContent aria-labelledby="flash-panel-title">
        <SheetHeader>
          <div className="min-w-0 flex-1">
            <SheetTitle id="flash-panel-title">Flash firmware</SheetTitle>
            <p className="mt-1 break-all text-sm text-muted-foreground">
              {target ? kioskName(target) : "USB board"}
              {target?.mac ? ` · ${target.mac}` : ""}
            </p>
          </div>
          <SheetClose onClick={() => handleOpenChange(false)} disabled={!canClose} />
        </SheetHeader>
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-5 py-4">
          <div className="grid w-full min-w-0 gap-4">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="flash-sku">SKU</Label>
              <Select
                id="flash-sku"
                value={skuId}
                onChange={setSkuId}
                aria-label="Firmware SKU"
                disabled={busy === "flash"}
                options={skus.map((sku) => ({ value: sku.id, label: `${sku.name} — ${sku.hardware}` }))}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="flash-sha">Firmware version</Label>
              <Select
                id="flash-sha"
                value={sha}
                onChange={setSha}
                aria-label="Firmware git commit"
                disabled={busy === "flash"}
                options={[
                  { value: "", label: "Firmware HEAD (pulled tree)" },
                  ...versions.map((version) => ({ value: version.sha, label: formatCommit(version) })),
                ]}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <Label htmlFor="flash-port">USB port</Label>
              <Select
                id="flash-port"
                value={port}
                onChange={setPort}
                aria-label="USB serial port"
                disabled={busy === "flash"}
                options={portSelectOptions(ports, portsLoading)}
              />
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={handleFlash}
              disabled={!port || !skuId || Boolean(busy)}
              aria-label="Compile and upload firmware to the plugged-in board"
            >
              {busy === "flash" ? "Flashing…" : "Start flash"}
            </Button>
          </div>
          {progress?.mode === "flash" ? (
            <div className="mt-4 flex min-h-0 min-w-0 flex-1 flex-col">
              <ProgressPanel
                progress={progress}
                elapsed={elapsed}
                liveLog={liveLog}
                className="mb-0 flex min-h-0 min-w-0 flex-1 flex-col"
              />
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
};
