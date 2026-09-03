export const parseAccept = (row) => {
  if (row?.accept && typeof row.accept === "object") {
    return row.accept;
  }
  if (!row?.serial_report) {
    return null;
  }
  try {
    return JSON.parse(row.serial_report);
  } catch {
    return null;
  }
};

export const AcceptReport = ({ report }) => {
  if (!report) {
    return null;
  }
  const tone =
    report.grade === "pass" ? "text-emerald-400" : report.grade === "warn" ? "text-amber-300" : "text-red-400";
  return (
    <div className="mt-2" aria-label={`Acceptance ${report.score} ${report.grade}`}>
      <p className={`font-mono text-xs ${tone}`}>
        {report.score} {report.grade}
        {report.summary ? ` · ${report.summary}` : ""}
      </p>
      <ol className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
        {(report.steps || []).map((step) => (
          <li key={step.id}>
            {step.status === "pass" ? "✓" : step.status === "warn" ? "!" : "✗"} {step.label}
            {step.detail ? ` — ${step.detail}` : ""}
          </li>
        ))}
      </ol>
      {report.llm ? <p className="mt-1 text-[11px] text-muted-foreground">{report.llm}</p> : null}
    </div>
  );
};
