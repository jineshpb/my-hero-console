import { LogConsole } from "@/components/LogConsole";
import { ProgressPanel } from "@/components/ProgressPanel";
import { WriteHistory } from "@/components/WriteHistory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useKiosk } from "@/hooks/useKiosk";

export const KioskLogsTab = () => {
  const {
    kioskFlashes,
    busy,
    progress,
    elapsed,
    liveLog,
    flashPanelOpen,
    openLogId,
    flashLogs,
    logLoadingId,
    handleToggleLog,
  } = useKiosk();
  const showLive =
    Boolean(liveLog) && (progress?.mode === "flash" || progress?.mode === "identify" || busy === "flash");

  return (
    <div className="space-y-8">
      {progress?.mode === "flash" && !flashPanelOpen ? (
        <ProgressPanel progress={progress} elapsed={elapsed} liveLog={liveLog} />
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Live log</CardTitle>
        </CardHeader>
        <CardContent>
          <LogConsole
            text={showLive || liveLog ? liveLog : ""}
            label="Compile, upload, and serial log"
            follow
            className="mt-0 min-h-64 max-h-[28rem]"
            placeholder="Flash a board to capture compile and upload output here."
          />
        </CardContent>
      </Card>

      <section>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-lg">Write logs</h2>
          <p className="text-xs text-muted-foreground">Stored compile, upload, and boot captures for this kiosk.</p>
        </div>
        <WriteHistory
          flashes={kioskFlashes}
          openLogId={openLogId}
          flashLogs={flashLogs}
          logLoadingId={logLoadingId}
          onToggleLog={handleToggleLog}
        />
      </section>
    </div>
  );
};
