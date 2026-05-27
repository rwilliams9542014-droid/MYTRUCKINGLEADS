function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace("%", ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
}

function statusFor(value) {
  const score = numeric(value);
  if (score === null) return { label: "Not Publicly Available", color: "bg-navy-600", text: "text-navy-300" };
  if (score < 50) return { label: "Good", color: "bg-accent-500", text: "text-accent-300" };
  if (score < 75) return { label: "Watch", color: "bg-warning-500", text: "text-warning-300" };
  return { label: "High Risk", color: "bg-danger-500", text: "text-danger-300" };
}

export default function SafetyScoreBar({ label, value, description, inspections, violations }) {
  const score = numeric(value);
  const status = statusFor(value);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-navy-900/35 p-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          {description && <p className="text-xs text-navy-500 mt-0.5">{description}</p>}
        </div>
        <span className={`text-[11px] font-semibold ${status.text}`}>{status.label}</span>
      </div>
      {score === null ? (
        <p className="text-xs text-navy-500">Public SMS data not available for this carrier/category.</p>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-navy-400">Percentile or public measure</span>
            <span className="text-white font-semibold">{Math.round(score)}%</span>
          </div>
          <div className="h-2 rounded-full bg-navy-800 overflow-hidden">
            <div className={`h-full rounded-full ${status.color}`} style={{ width: `${Math.round(score)}%` }} />
          </div>
          <p className="text-[11px] text-navy-500 mt-2">Lower FMCSA SMS percentiles are generally better.</p>
        </>
      )}
      {(inspections || violations) && (
        <p className="text-[11px] text-navy-500 mt-2">
          {[inspections && `${inspections} inspections`, violations && `${violations} violations`].filter(Boolean).join(" | ")}
        </p>
      )}
    </div>
  );
}
