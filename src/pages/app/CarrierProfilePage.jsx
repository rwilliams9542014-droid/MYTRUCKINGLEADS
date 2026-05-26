import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, Badge, Button, Modal } from "@/components/ui";

const mockCarrier = {
  dot: "4102847",
  name: "Martinez Trucking LLC",
  dbaName: "Martinez Transport",
  address: "4521 Industrial Blvd",
  city: "Houston",
  state: "TX",
  zip: "77034",
  phone: "(713) 555-0142",
  email: "dispatch@martineztrucking.com",
  website: "www.martineztrucking.com",
  entityType: "CARRIER",
  operatingStatus: "AUTHORIZED",
  safetyRating: "Satisfactory",
  ratingDate: "2026-03-15",
  mcNumber: "MC-1298374",
  mcs150Date: "2026-01-20",
  addDate: "2024-08-12",
  fleetSize: { trucks: 4, drivers: 5 },
  cargoCarried: ["General Freight", "Household Goods", "Building Materials"],
  operationTypes: ["Interstate", "Intrastate-HM"],
  contacts: [
    { name: "Carlos Martinez", title: "Owner / Operator", phone: "(713) 555-0142", email: "carlos@martineztrucking.com", primary: true },
    { name: "Maria Gonzalez", title: "Safety Manager", phone: "(713) 555-0143", email: "safety@martineztrucking.com", primary: false },
  ],
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

function EmailModal({ contact, onClose }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  return (
    <Modal open onClose={onClose} title={`Email ${contact.name}`}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-navy-400 mb-1">To</label>
          <div className="input-field py-2 text-sm text-navy-300">{contact.email}</div>
        </div>
        <div>
          <label className="block text-xs font-medium text-navy-400 mb-1">Subject</label>
          <input className="input-field text-sm py-2" placeholder="Insurance quote for your fleet" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-navy-400 mb-1">Message</label>
          <textarea className="input-field text-sm py-2 min-h-[120px] resize-y" placeholder="Hi, I'd like to discuss your commercial trucking insurance..." value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className="bg-navy-900/50 border border-white/5 rounded-lg p-3">
          <p className="text-[11px] text-navy-500">By sending, you confirm this email complies with CAN-SPAM Act requirements including your business address and an unsubscribe option. Recipient opt-out requests must be honored within 10 days.</p>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm">Send Email</Button>
        </div>
      </div>
    </Modal>
  );
}

function SmsModal({ contact, onClose }) {
  const [message, setMessage] = useState("");

  return (
    <Modal open onClose={onClose} title={`Text ${contact.name}`}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-navy-400 mb-1">To</label>
          <div className="input-field py-2 text-sm text-navy-300">{contact.phone}</div>
        </div>
        <div>
          <label className="block text-xs font-medium text-navy-400 mb-1">Message</label>
          <textarea className="input-field text-sm py-2 min-h-[100px] resize-y" placeholder="Hi, this is [Your Name] from [Agency]. I'd like to discuss your commercial insurance options..." value={message} onChange={(e) => setMessage(e.target.value)} maxLength={160} />
          <p className="text-[11px] text-navy-500 mt-1 text-right">{message.length}/160 characters</p>
        </div>
        <div className="bg-navy-900/50 border border-white/5 rounded-lg p-3">
          <p className="text-[11px] text-navy-500">By sending, you confirm you have prior express consent to text this number per TCPA regulations. All messages must include opt-out instructions. Reply STOP requests are processed automatically.</p>
        </div>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm">Send SMS</Button>
        </div>
      </div>
    </Modal>
  );
}

export default function CarrierProfilePage() {
  const { id } = useParams();
  const carrier = mockCarrier;
  const [emailContact, setEmailContact] = useState(null);
  const [smsContact, setSmsContact] = useState(null);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to="/carrier-search" className="text-navy-400 hover:text-white transition-colors">Carrier Search</Link>
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
          {carrier.dbaName && <p className="text-sm text-navy-400 mb-1">DBA: {carrier.dbaName}</p>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-navy-400">
            <span className="font-mono">DOT {carrier.dot}</span>
            <span className="font-mono">{carrier.mcNumber}</span>
            <span>{carrier.city}, {carrier.state} {carrier.zip}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`tel:${carrier.phone}`} className="btn-secondary text-sm px-4 py-2 flex items-center gap-2 rounded-xl border border-white/10">
            <svg className="w-4 h-4 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Call
          </a>
          <button onClick={() => setEmailContact(carrier.contacts[0])} className="btn-secondary text-sm px-4 py-2 flex items-center gap-2 rounded-xl border border-white/10">
            <svg className="w-4 h-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            Email
          </button>
          <button onClick={() => setSmsContact(carrier.contacts[0])} className="btn-secondary text-sm px-4 py-2 flex items-center gap-2 rounded-xl border border-white/10">
            <svg className="w-4 h-4 text-warning-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            SMS
          </button>
          <Button size="sm">+ Pipeline</Button>
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contacts */}
          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Contacts</h2>
            <div className="space-y-3">
              {carrier.contacts.map((contact, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-navy-800/30 rounded-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center text-brand-400 text-sm font-bold">
                      {contact.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white">{contact.name}</p>
                        {contact.primary && <Badge variant="brand" className="text-[9px]">Primary</Badge>}
                      </div>
                      <p className="text-xs text-navy-400">{contact.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-navy-500">
                        <span>{contact.phone}</span>
                        <span>&middot;</span>
                        <span>{contact.email}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a href={`tel:${contact.phone}`} className="w-8 h-8 rounded-lg bg-accent-500/10 flex items-center justify-center hover:bg-accent-500/20 transition-colors" title="Call">
                      <svg className="w-3.5 h-3.5 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </a>
                    <button onClick={() => setEmailContact(contact)} className="w-8 h-8 rounded-lg bg-brand-500/10 flex items-center justify-center hover:bg-brand-500/20 transition-colors" title="Email">
                      <svg className="w-3.5 h-3.5 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </button>
                    <button onClick={() => setSmsContact(contact)} className="w-8 h-8 rounded-lg bg-warning-500/10 flex items-center justify-center hover:bg-warning-500/20 transition-colors" title="SMS">
                      <svg className="w-3.5 h-3.5 text-warning-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Company Details */}
          <Card>
            <h2 className="text-lg font-semibold text-white mb-4">Company Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { label: "Legal Name", value: carrier.name },
                { label: "DBA Name", value: carrier.dbaName || "N/A" },
                { label: "Address", value: `${carrier.address}, ${carrier.city}, ${carrier.state} ${carrier.zip}` },
                { label: "Entity Type", value: carrier.entityType },
                { label: "Fleet Size", value: `${carrier.fleetSize.trucks} trucks, ${carrier.fleetSize.drivers} drivers` },
                { label: "Operations", value: carrier.operationTypes.join(", ") },
                { label: "DOT Issued", value: carrier.addDate },
                { label: "MCS-150 Updated", value: carrier.mcs150Date },
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
          {/* Quick Contact Card */}
          <Card className="border-brand-500/20">
            <h2 className="text-sm font-semibold text-white mb-3">Quick Contact</h2>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <svg className="w-4 h-4 text-navy-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="text-white">Ask for: <strong>{carrier.contacts[0].name}</strong></span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <svg className="w-4 h-4 text-navy-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <span className="text-navy-300">{carrier.contacts[0].title}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <svg className="w-4 h-4 text-navy-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <a href={`tel:${carrier.contacts[0].phone}`} className="text-brand-400 hover:text-brand-300">{carrier.contacts[0].phone}</a>
              </div>
            </div>
          </Card>

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

      {/* Modals */}
      {emailContact && <EmailModal contact={emailContact} onClose={() => setEmailContact(null)} />}
      {smsContact && <SmsModal contact={smsContact} onClose={() => setSmsContact(null)} />}
    </div>
  );
}
