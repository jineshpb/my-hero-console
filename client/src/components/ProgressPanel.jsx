import { formatElapsed } from "@/lib/kiosk";
import { LogConsole } from "@/components/LogConsole";
import { cn } from "@/lib/utils";

const FLASH_STEPS = [
  { id: "identify", label: "Identify" },
  { id: "compile", label: "Compile" },
  { id: "upload", label: "Upload" },
  { id: "serial", label: "Serial" },
];

export const ProgressPanel = ({ progress, elapsed, liveLog, className }) => {
  const steps =
    progress.mode === "identify"
      ? FLASH_STEPS.slice(0, 1)
      : progress.mode === "monitor"
        ? FLASH_STEPS.slice(3)
        : FLASH_STEPS;
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
      className={cn("mb-4 min-w-0 overflow-x-hidden rounded-xl border border-amber-900/70 bg-card p-4", className)}
      aria-live="polite"
      aria-label="Job progress"
    >
      <div className="mb-2 flex min-w-0 items-baseline justify-between gap-3">
        <p className="min-w-0 flex-1 break-words text-sm text-amber-200">{progress.label || "Working…"}</p>
        <p className="shrink-0 font-mono text-xs text-muted-foreground">
          {percent}% · {formatElapsed(elapsed)}
        </p>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
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
          const tone = complete ? "text-emerald-400" : active ? "text-amber-200" : "text-muted-foreground";
          return (
            <li key={step.id} className={tone}>
              {complete ? "✓" : active ? "●" : "○"} {step.label}
            </li>
          );
        })}
      </ol>
      {progress.detail ? (
        <p className="mt-3 min-w-0 break-words font-mono text-xs text-muted-foreground" title={progress.detail}>
          {progress.detail}
        </p>
      ) : null}
      {liveLog ? (
        <>
          <p className="mt-3 text-xs uppercase tracking-wide text-muted-foreground">Live log</p>
          <LogConsole
            text={liveLog}
            label="Compile, upload, and serial log"
            follow
            className="mt-3 min-h-0 min-w-0 flex-1 overflow-x-hidden"
          />
        </>
      ) : null}
    </section>
  );
};
