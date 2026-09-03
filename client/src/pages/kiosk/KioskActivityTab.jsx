import { WriteHistory } from "@/components/WriteHistory";
import { useKiosk } from "@/hooks/useKiosk";

export const KioskActivityTab = () => {
  const { kioskFlashes, openLogId, flashLogs, logLoadingId, handleToggleLog } = useKiosk();

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg">Activity</h2>
        <p className="text-xs text-muted-foreground">Firmware writes for this kiosk. SOS and access events will land here later.</p>
      </div>
      <WriteHistory
        flashes={kioskFlashes}
        openLogId={openLogId}
        flashLogs={flashLogs}
        logLoadingId={logLoadingId}
        onToggleLog={handleToggleLog}
      />
    </section>
  );
};
