import { AcceptReport, parseAccept } from "@/components/AcceptReport";
import { LogConsole } from "@/components/LogConsole";
import { formatTime } from "@/lib/kiosk";

export const WriteHistory = ({ flashes, openLogId, flashLogs, logLoadingId, onToggleLog }) => (
  <ul className="space-y-2">
    {flashes.length === 0 ? (
      <li className="text-sm text-muted-foreground">No writes yet.</li>
    ) : (
      flashes.map((row) => (
        <li key={row.id} className="rounded-lg border bg-card px-3 py-2 font-mono text-xs">
          <span
            className={
              row.serial_grade === "pass"
                ? "text-emerald-400"
                : row.serial_grade === "warn"
                  ? "text-amber-300"
                  : row.success
                    ? "text-emerald-400"
                    : "text-red-400"
            }
          >
            {row.serial_score
              ? `${row.serial_score} ${row.serial_grade || ""}`.trim()
              : row.success
                ? "ok"
                : "fail"}
          </span>
          {" · "}
          {formatTime(row.finished_at)}
          {" · "}
          {row.sku}
          {" · "}
          {row.git_sha || "?"}
          {row.git_dirty ? " dirty" : ""}
          {row.compile_bytes ? ` · ${row.compile_bytes} B` : ""}
          {row.has_compile_log || row.has_upload_log || row.has_serial_log ? (
            <>
              {" · "}
              <button
                type="button"
                className="text-cyan-400 hover:underline"
                onClick={() => onToggleLog(row.id)}
                aria-expanded={openLogId === row.id}
                aria-label={openLogId === row.id ? "Hide write log" : "Show write log"}
              >
                {openLogId === row.id ? "Hide log" : "Show log"}
              </button>
              {" · "}
              <a
                className="text-cyan-400 hover:underline"
                href={`/api/flashes/${row.id}/log`}
                target="_blank"
                rel="noreferrer"
              >
                Open as text
              </a>
            </>
          ) : null}
          {row.error ? (
            <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-red-300">{row.error}</pre>
          ) : null}
          <AcceptReport report={parseAccept(row)} />
          {openLogId === row.id ? (
            logLoadingId === row.id ? (
              <p className="mt-2 text-muted-foreground">Loading log…</p>
            ) : (
              <LogConsole text={flashLogs[row.id] || ""} label={`Write log ${row.id}`} />
            )
          ) : null}
        </li>
      ))
    )}
  </ul>
);
