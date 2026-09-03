import { LogConsole } from "@/components/LogConsole";
import { WriteHistory } from "@/components/WriteHistory";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useKiosk } from "@/hooks/useKiosk";
import { portSelectOptions } from "@/lib/kiosk";

export const KioskSerialTab = () => {
  const {
    kioskFlashes,
    ports,
    portsLoading,
    port,
    setPort,
    busy,
    liveLog,
    handleMonitor,
    openLogId,
    flashLogs,
    logLoadingId,
    handleToggleLog,
  } = useKiosk();
  const serialWrites = kioskFlashes.filter((row) => row.has_serial_log);

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">Serial monitor</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">115200 baud. Opening the port resets the board (DTR).</p>
          </div>
          <Button
            type="button"
            onClick={handleMonitor}
            disabled={!port || (Boolean(busy) && busy !== "monitor")}
            aria-label={busy === "monitor" ? "Stop serial monitor" : "Open serial monitor on the selected port"}
          >
            {busy === "monitor" ? "Stop" : "Monitor"}
          </Button>
        </CardHeader>
        <CardContent>
          <Label htmlFor="serial-port" className="text-xs text-muted-foreground">
            USB port
          </Label>
          <Select
            id="serial-port"
            className="mt-1 max-w-sm"
            value={port}
            onChange={setPort}
            aria-label="USB serial port"
            options={portSelectOptions(ports, portsLoading)}
          />
          <LogConsole
            text={liveLog}
            label="Live serial monitor"
            follow
            className="mt-4 min-h-64 max-h-[28rem]"
            placeholder="Start the serial monitor to capture boot and runtime logs."
          />
        </CardContent>
      </Card>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-lg">Captured logs</h2>
          <p className="text-xs text-muted-foreground">Serial tails stored from previous flashes.</p>
        </div>
        <WriteHistory
          flashes={serialWrites}
          openLogId={openLogId}
          flashLogs={flashLogs}
          logLoadingId={logLoadingId}
          onToggleLog={handleToggleLog}
        />
      </section>
    </div>
  );
};
