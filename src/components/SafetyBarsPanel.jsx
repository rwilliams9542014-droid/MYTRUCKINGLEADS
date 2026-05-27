import { Badge } from "@/components/ui";
import {
  BASIC_CATEGORY_LABELS,
  BASIC_UNAVAILABLE_MESSAGE,
  INSPECTION_UNAVAILABLE,
  buildInspectionBars,
  normalizeBasicScores,
} from "@/lib/leadMapping";
import SafetyScoreBar from "./SafetyScoreBar";

function metricValue(value) {
  return value || value === 0 ? value : "Not available";
}

function inspectionColor(value, nationalAverage = null) {
  if (nationalAverage || nationalAverage === 0) {
    if (value < nationalAverage) return "bg-accent-500";
    if (value <= nationalAverage * 1.5) return "bg-warning-500";
    return "bg-danger-500";
  }
  if (value < 25) return "bg-accent-500";
  if (value < 50) return "bg-warning-500";
  return "bg-danger-500";
}

function hasPublicBasicValue(item = {}) {
  return item.hasRealValue === true;
}

function normalizeBasics(record = {}) {
  const preferredOrder = [
    "Unsafe Driving",
    "Crash Indicator",
    "HOS Compliance",
    "Vehicle Maintenance",
    "Controlled Substances / Alcohol",
    "Driver Fitness",
    "Hazardous Materials Compliance",
  ];
  const basicSummary = normalizeBasicScores(record);
  const basics = basicSummary.scores.filter((item) => item.hasRealValue);

  return basics.map((item) => {
    const label = item.label || item.category || BASIC_CATEGORY_LABELS[item.id] || item.id;
    return {
      ...item,
      label: label === "Hours-of-Service Compliance" ? "HOS Compliance" : label,
      percentile: item.value,
      description: item.description || item.alert || item.threshold || (
        item.publicStatus === "not_public"
          ? "Not publicly available"
          : item.publicStatus === "unavailable"
            ? BASIC_UNAVAILABLE_MESSAGE
            : ""
      ),
    };
  }).sort((a, b) => {
    const aIndex = preferredOrder.indexOf(a.label);
    const bIndex = preferredOrder.indexOf(b.label);
    return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
  });
}

export default function SafetyBarsPanel({ record = {}, compact = false, mode = "full" }) {
  const { totalInspections, bars } = buildInspectionBars(record);
  const basics = normalizeBasics(record);
  const hasBasics = basics.some(hasPublicBasicValue);
  const inspections = Array.isArray(record.inspectionHistory) ? record.inspectionHistory : [];

  if (mode === "basic") {
    return (
      <div className="space-y-4">
        <p className="text-xs font-medium text-navy-400">
          Higher scores indicate worse performance. Threshold for intervention varies by category.
        </p>
        <div className="space-y-3">
          {basics.map((item) => (
            <SafetyScoreBar
              key={item.id || item.label}
              label={item.label}
              value={item.value ?? item.percentile ?? item.measure}
              inspections={item.inspections}
              violations={item.violations}
              description={item.description}
            />
          ))}
        </div>
        {!hasBasics && (
          <p className="text-sm text-navy-400">
            {record.dataSources?.basics?.attempted && record.dataSources?.basics?.success === false
              ? "BASIC safety scores could not be loaded right now."
              : "BASIC safety scores are not available from the current FMCSA data source for this carrier."}
          </p>
        )}
      </div>
    );
  }

  if (mode === "inspection") {
    if (!totalInspections && bars.length === 0) {
      return <p className="text-sm text-navy-400">{INSPECTION_UNAVAILABLE}</p>;
    }
    return (
      <div className="space-y-3">
        {bars.map((bar) => (
          <div key={bar.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-navy-300">{bar.label}</span>
              <span className="text-white font-semibold">{Math.round(bar.value)}%</span>
            </div>
            <div className="h-2 rounded-full bg-navy-800 overflow-hidden">
              <div className={`h-full rounded-full ${inspectionColor(bar.value, bar.nationalAverage)}`} style={{ width: `${Math.round(bar.value)}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (compact) {
    if (!totalInspections && !bars.length && !hasBasics) {
      return <p className="text-xs text-navy-500">{INSPECTION_UNAVAILABLE}</p>;
    }
    return (
      <div className="space-y-3">
        <p className="text-xs text-navy-500">
          {totalInspections ? `${totalInspections} total inspections. Public inspection data available.` : "Public SMS/BASIC data available."}
        </p>
        {bars.slice(0, 3).map((bar) => (
          <div key={bar.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-navy-300">{bar.label}</span>
              <span className="text-white font-medium">{Math.round(bar.value)}%</span>
            </div>
            <div className="h-2 rounded-full bg-navy-800 overflow-hidden">
              <div className={`h-full rounded-full ${inspectionColor(bar.value, bar.nationalAverage)}`} style={{ width: `${Math.round(bar.value)}%` }} />
            </div>
          </div>
        ))}
        {!bars.length && hasBasics && <p className="text-xs text-navy-500">Public SMS/BASIC data available.</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-navy-900/45 border border-white/[0.06] p-3">
          <p className="text-xs text-navy-500 uppercase">Safety Rating</p>
          <p className="text-sm text-white mt-1">{metricValue(record.safetyRating)}</p>
        </div>
        <div className="rounded-xl bg-navy-900/45 border border-white/[0.06] p-3">
          <p className="text-xs text-navy-500 uppercase">Total Inspections</p>
          <p className="text-sm text-white mt-1">{metricValue(totalInspections || record.totalInspections)}</p>
        </div>
        <div className="rounded-xl bg-navy-900/45 border border-white/[0.06] p-3">
          <p className="text-xs text-navy-500 uppercase">Total Violations</p>
          <p className="text-sm text-white mt-1">{metricValue(record.totalViolations)}</p>
        </div>
        <div className="rounded-xl bg-navy-900/45 border border-white/[0.06] p-3">
          <p className="text-xs text-navy-500 uppercase">OOS / Crashes</p>
          <p className="text-sm text-white mt-1">{[record.oosViolations, record.crashCount || record.crashTotal].filter(Boolean).join(" / ") || "Not available"}</p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold text-white">SMS BASIC Bars</h3>
          <Badge variant={hasBasics ? "success" : "outline"}>
            {hasBasics ? "Public SMS/BASIC data available" : "Public SMS data not available for this carrier/category"}
          </Badge>
        </div>
        <div className="space-y-3">
          {basics.map((item) => (
            <SafetyScoreBar
              key={item.id || item.label}
              label={item.label}
              value={item.value ?? item.percentile ?? item.measure}
              inspections={item.inspections}
              violations={item.violations}
              description={item.description}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Inspection History Bars</h3>
        {!totalInspections && bars.length === 0 ? (
          <p className="text-sm text-navy-400">{INSPECTION_UNAVAILABLE}</p>
        ) : (
          <div className="space-y-3">
            {bars.map((bar) => (
              <div key={bar.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-navy-300">{bar.label}</span>
                  <span className="text-white font-medium">{Math.round(bar.value)}%</span>
                </div>
                <div className="h-2 rounded-full bg-navy-800 overflow-hidden">
                  <div className={`h-full rounded-full ${inspectionColor(bar.value, bar.nationalAverage)}`} style={{ width: `${Math.round(bar.value)}%` }} />
                </div>
              </div>
            ))}
            <p className="text-[11px] text-navy-500">Inspection colors use MyTruckingLeads app thresholds when official national averages are unavailable.</p>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Inspection Details</h3>
        {inspections.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="text-navy-400">
                <tr className="border-b border-white/[0.06]">
                  {["Date", "Level", "State", "Violations", "OOS"].map((heading) => (
                    <th key={heading} className="text-left py-2 pr-3">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inspections.slice(0, 10).map((item, index) => (
                  <tr key={`${item.date || "inspection"}-${index}`} className="border-b border-white/[0.04]">
                    <td className="py-2 pr-3 text-navy-300">{item.date || item.inspectionDate || "Not available"}</td>
                    <td className="py-2 pr-3 text-navy-300">{item.level || item.inspectionLevel || "Not available"}</td>
                    <td className="py-2 pr-3 text-navy-300">{item.state || "Not available"}</td>
                    <td className="py-2 pr-3 text-navy-300">{metricValue(item.violations || item.violationCount)}</td>
                    <td className="py-2 pr-3 text-navy-300">{metricValue(item.oos || item.outOfService)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-navy-400">Public SMS data not available for this carrier/category.</p>
        )}
      </div>
    </div>
  );
}
