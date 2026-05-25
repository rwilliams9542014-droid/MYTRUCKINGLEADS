import { useParams, Link } from "react-router-dom";
import { Card, Badge, Button } from "@/components/ui";

const mockCarrier = {
  dot: "4102847",
  name: "Martinez Trucking LLC",
  dbaName: "",
  address: "4521 Industrial Blvd",
  city: "Houston",
  state: "TX",
  zip: "77034",
  phone: "(713) 555-0142",
  email: "dispatch@martineztrucking.com",
  entityType: "CARRIER",
  operatingStatus: "AUTHORIZED",
  safetyRating: "Satisfactory",
  ratingDate: "2026-03-15",
  mcNumber: "MC-1298374",
  fleetSize: { trucks: 4, drivers: 5 },
  cargoCarried: ["General Freight", "Household Goods", "Building Materials"],
  operationTypes: ["Interstate", "Intrastate-HM"],
  insuranceFiling: {
    bipd: { insurer: "National Interstate Insurance", policyNumber: "TRK-2026-4847", coverage: "$1,000,000", effectiveDate: "2026-01-15", expirationDate: "2026-07-15" },
    cargo: { insurer: "Great West Casualty", policyNumber: "CRG-889124", coverage: "$250,000", effectiveDate: "2026-02-01", expirationDate: "2026-08-01" },
  },
  inspections: { total: 6, vehicleOos: 1, driverOos: 0, vehicleOosRate: "16.7%", driverOosRate: "0%" },
  crashes: { total: 0, fatal: 0, injury: 0, tow: 0 },
  basicsScores: {
    unsafe_driving: 22,
    crash_indicator: 0,
    hos_compliance: 45,
    vehicle_maintenance: 38,
    controlled_substances: 0,
    hazmat: null,
    driver_fitness: 12,
  },
};

function ScoreBar({ label, score, threshold = 65 }) {
  if (score === null) return null;
  const color = score >= threshold ? "bg-danger-500" : score >= threshold * 0.7 ? "bg-warning-500" : "bg-accent-500";
  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-navy-300 w-40 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-navy-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-sm font-mono text-white w-8 text-right">{score}</span>
    </div>
  );
}

export default function CarrierProfilePage() {
  const { id } = useParams();
  const carrier = mockCarrier;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/app/carrier-search" className="text-navy-400 hover:text-white transition-colors">Carrier Search</Link>
        <svg className="w-3 h-3 text-navy-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-white">{carrier.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-bold text-white">{carrier.name}</h1>
            <Badge variant={carrier.operatingStatus === "AUTHORIZED" ? "success" : "danger"}>
              {carrier.operatingStatus}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-navy-400">
            <span className="font-mono">DOT {carrier.dot}</span>
            <span className="font-mono">{carrier.mcNumber}</span>
            <span>{carrier.city}, {carrier.state} {carrier.zip}</span>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" size="sm">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Call
          </Button>
          <Button size="sm">Add to Pipeline</Button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contact & Company */}
          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Company Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "Phone", value: carrier.phone },
                { label: "Email", value: carrier.email },
                { label: "Address", value: `${carrier.address}, ${carrier.city}, ${carrier.state} ${carrier.zip}` },
                { label: "Entity Type", value: carrier.entityType },
                { label: "Fleet Size", value: `${carrier.fleetSize.trucks} trucks, ${carrier.fleetSize.drivers} drivers` },
                { label: "Operations", value: carrier.operationTypes.join(", ") },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-navy-500 uppercase tracking-wide">{item.label}</p>
                  <p className="text-sm text-white mt-1">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-white/5">
              <p className="text-xs text-navy-500 uppercase tracking-wide mb-2">Cargo Carried</p>
              <div className="flex flex-wrap gap-2">
                {carrier.cargoCarried.map((c) => (
                  <Badge key={c} variant="outline">{c}</Badge>
                ))}
              </div>
            </div>
          </Card>

          {/* Safety Scores */}
          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">BASIC Safety Scores</h2>
            <p className="text-xs text-navy-500 mb-4">Higher scores indicate worse performance. Threshold for intervention varies by category.</p>
            <div className="space-y-3">
              <ScoreBar label="Unsafe Driving" score={carrier.basicsScores.unsafe_driving} />
              <ScoreBar label="Crash Indicator" score={carrier.basicsScores.crash_indicator} />
              <ScoreBar label="HOS Compliance" score={carrier.basicsScores.hos_compliance} />
              <ScoreBar label="Vehicle Maintenance" score={carrier.basicsScores.vehicle_maintenance} />
              <ScoreBar label="Controlled Substances" score={carrier.basicsScores.controlled_substances} />
              <ScoreBar label="Driver Fitness" score={carrier.basicsScores.driver_fitness} />
            </div>
          </Card>

          {/* Inspections */}
          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Inspection History</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Inspections", value: carrier.inspections.total },
                { label: "Vehicle OOS", value: carrier.inspections.vehicleOos },
                { label: "Vehicle OOS Rate", value: carrier.inspections.vehicleOosRate },
                { label: "Driver OOS Rate", value: carrier.inspections.driverOosRate },
              ].map((s) => (
                <div key={s.label} className="text-center p-3 bg-navy-800/50 rounded-xl">
                  <p className="text-lg font-bold text-white">{s.value}</p>
                  <p className="text-[10px] text-navy-400 mt-1 uppercase">{s.label}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right: Insurance & Quick Info */}
        <div className="space-y-6">
          {/* Insurance Filing */}
          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Insurance Filing</h2>
            <div className="space-y-4">
              {Object.entries(carrier.insuranceFiling).map(([type, info]) => (
                <div key={type} className="p-3 bg-navy-800/50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-navy-300 uppercase">{type === "bipd" ? "BIPD Liability" : "Cargo"}</span>
                    <Badge variant="success">{info.coverage}</Badge>
                  </div>
                  <p className="text-sm text-white">{info.insurer}</p>
                  <p className="text-xs text-navy-500 font-mono mt-1">{info.policyNumber}</p>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-xs">
                    <span className="text-navy-400">Expires</span>
                    <span className="text-warning-400 font-medium">{info.expirationDate}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Safety Rating */}
          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Safety Rating</h2>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-accent-500/20 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-medium text-white">{carrier.safetyRating}</p>
                <p className="text-xs text-navy-500">Rated {carrier.ratingDate}</p>
              </div>
            </div>
          </Card>

          {/* Crash History */}
          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Crash History (24mo)</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total", value: carrier.crashes.total },
                { label: "Fatal", value: carrier.crashes.fatal },
                { label: "Injury", value: carrier.crashes.injury },
                { label: "Tow", value: carrier.crashes.tow },
              ].map((c) => (
                <div key={c.label} className="text-center p-3 bg-navy-800/50 rounded-xl">
                  <p className="text-lg font-bold text-white">{c.value}</p>
                  <p className="text-[10px] text-navy-400 uppercase">{c.label}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
