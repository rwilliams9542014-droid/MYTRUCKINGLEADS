function numeric(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace("%", ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
}

function statusFor(value) {
  const score = numeric(value);
  if (score === null) return { label: String(value || "").trim() || "Not available", color: "bg-navy-600", text: "text-navy-300" };
  if (score < 50) return { label: "Good", color: "bg-accent-500", text: "text-accent-300" };
  if (score < 75) return { label: "Watch", color: "bg-warning-500", text: "text-warning-300" };
  return { label: "High Risk", color: "bg-danger-500", text: "text-danger-300" };
}

function formatScore(value) {
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}

export default function SafetyScoreBar({ label, value, description, inspections, violations }) {
  const score = numeric(value);
  if (score === null) return null;
  const status = statusFor(value);
  const width = Math.max(score === 0 ? 1 : score, 0);
  const safeLabel = label || "Safety score";

  return (
    <div className="profile-score-row">
      <div className="min-w-0">
        <p className="profile-score-label">{safeLabel}</p>
        {description && <p className="profile-score-note">{description}</p>}
      </div>
      <div className="profile-score-track" aria-label={`${safeLabel} score`}>
        <div className={`profile-score-fill ${status.color}`} style={{ width: `${width}%` }} />
      </div>
      <div className="profile-score-value">
        {formatScore(score)}
        {(inspections || violations) && (
          <span className="block text-[10px] font-normal text-navy-500">
            {[inspections && `${inspections} insp.`, violations && `${violations} viol.`].filter(Boolean).join(" / ")}
          </span>
        )}
      </div>
    </div>
  );
}
