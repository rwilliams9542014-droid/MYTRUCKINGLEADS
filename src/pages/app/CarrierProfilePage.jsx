import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Badge, Button } from "@/components/ui";
import ScoutEmptyState from "@/components/ScoutEmptyState";
import ScoutMascot from "@/components/ScoutMascot";
import SafetyBarsPanel from "@/components/SafetyBarsPanel";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  collectContactNumbersFromAllSources,
  dedupeContactNumbers,
  formatAllContactNumbers,
  getPrimaryContactNumber,
} from "@/lib/contactNumbers";
import { canUseAiEmailDraft, copyAiEmailDraft, openEmailClientForLeads } from "@/lib/emailDrafts";
import {
  getRenewalDisplay,
  normalizeBasicScores,
  normalizeInspectionSummary,
  normalizeLeadRecord,
  pick,
  splitCargo,
} from "@/lib/leadMapping";

const NOT_AVAILABLE = "Not available";
const FMCSA_UNAVAILABLE = "Not available from public FMCSA data.";
function valueOrUnavailable(value, fallback = NOT_AVAILABLE) {
  return value || value === 0 ? value : fallback;
}

function formatMc(value) {
  if (!value) return "";
  return String(value).toUpperCase().startsWith("MC") ? value : `MC-${value}`;
}

function firstObject(...items) {
  return items.find((item) => item && typeof item === "object" && !Array.isArray(item)) || {};
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function normalizeLimit(value) {
  if (!value && value !== 0) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (/coverage|limit|\$|source value/i.test(text)) return text;
  return `Max Coverage: ${text} (source value)`;
}

function dedupeFilings(filings = []) {
  const seen = new Set();
  return filings.filter((filing) => {
    const key = [
      filing.title,
      filing.company,
      filing.reference,
      filing.effectiveDate,
      filing.cancelDate || filing.expirationDate,
    ].map((value) => String(value || "").trim().toLowerCase()).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeInsuranceFilings(carrier, lead) {
  const filings = [];
  const insuranceFilings = carrier.insuranceFilings || carrier.insurance_filings || {};
  const publicLiability = insuranceFilings.publicLiability || insuranceFilings.public_liability || carrier.licensingInsurance || {};
  const cargo = insuranceFilings.cargo || carrier.cargoInsurance || {};
  const bmcFilings = asArray(carrier.bmcFilings || carrier.bmc_filings || carrier.licensingInsurance?.bmcFilings);

  if (Object.keys(publicLiability).length || lead.insuranceCompany || lead.filingType || lead.insuranceEffectiveDate || lead.insuranceCancelDate) {
    filings.push({
      title: pick(lead.filingType, publicLiability.filingType, publicLiability.coverageInfo, "BIPD Liability"),
      company: pick(lead.insuranceCompany, publicLiability.insuranceCompany, publicLiability.company),
      reference: pick(carrier.insurancePolicyNumber, carrier.insurance_policy_number, publicLiability.policyNumber, publicLiability.formNumber),
      limit: normalizeLimit(pick(publicLiability.limit, publicLiability.coverageLimit, publicLiability.coverageInfo, carrier.insuranceLimit)),
      effectiveDate: lead.insuranceEffectiveDate,
      cancelDate: lead.insuranceCancelDate,
      expirationDate: pick(carrier.insuranceExpiration, carrier.insuranceExpirationDate, carrier.insurance_expiration, publicLiability.insuranceExpirationDate),
      status: lead.insuranceFilingStatus,
    });
  }

  if (Object.keys(cargo).length || typeof cargo === "string") {
    filings.push({
      title: "Cargo",
      company: pick(cargo.insuranceCompany, cargo.company),
      reference: pick(cargo.policyNumber, cargo.formNumber, typeof cargo === "string" ? cargo : ""),
      limit: normalizeLimit(pick(cargo.limit, cargo.coverageLimit, cargo.coverageInfo)),
      effectiveDate: pick(cargo.effectiveDate, cargo.insuranceEffectiveDate),
      cancelDate: pick(cargo.cancelDate, cargo.cancellationDate),
      expirationDate: pick(cargo.expirationDate, cargo.insuranceExpirationDate),
      status: pick(cargo.status, cargo.insuranceFilingStatus),
    });
  }

  bmcFilings.forEach((filing, index) => {
    filings.push({
      title: pick(filing.filingType, filing.form, filing.type, `Filing ${index + 1}`),
      company: pick(filing.insuranceCompany, filing.company),
      reference: pick(filing.policyNumber, filing.formNumber, filing.docketNumber),
      limit: normalizeLimit(pick(filing.limit, filing.coverageLimit, filing.coverageInfo)),
      effectiveDate: pick(filing.effectiveDate, filing.insuranceEffectiveDate),
      cancelDate: pick(filing.cancelDate, filing.cancellationDate),
      expirationDate: pick(filing.expirationDate, filing.insuranceExpirationDate),
      status: pick(filing.status, filing.insuranceFilingStatus),
    });
  });

  const deduped = dedupeFilings(filings);
  return deduped.length ? deduped : [{
    title: "Insurance Filing",
    company: "",
    reference: "",
    limit: "",
    effectiveDate: "",
    cancelDate: "",
    expirationDate: "",
    status: "",
  }];
}

function normalizeCrashes(carrier, lead) {
  const crashes = firstObject(
    carrier.crashSummary,
    carrier.safety?.crashSummary,
    carrier.crashes,
    carrier.crashHistory,
    carrier.safety?.crashes,
    carrier.safety?.crashSummary,
    lead.raw?.safety?.crashes
  );
  return {
    total: pick(carrier.crashTotal, lead.crashCount, crashes.total, crashes.totalCrashes, crashes.count),
    fatal: pick(crashes.fatal, crashes.fatalCrashes, crashes.fatality),
    injury: pick(crashes.injury, crashes.injuryCrashes),
    tow: pick(crashes.tow, crashes.towaway, crashes.towAway, crashes.towawayCrashes),
  };
}

function formatRate(value) {
  return value || value === 0 ? `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%` : "";
}

function hasValue(value) {
  return value || value === 0;
}

function normalizeCarrier(data) {
  const carrier = data?.carrier || data?.profile || data?.result || data || {};
  const lead = normalizeLeadRecord(carrier, "profile");
  const addressParts = firstObject(carrier.addressParts, carrier.address);
  const addressText = typeof carrier.address === "string"
    ? carrier.address
    : [addressParts.street, addressParts.city, addressParts.state, addressParts.zip].filter(Boolean).join(", ");
  const city = pick(carrier.city, addressParts.city, carrier.phy_city, carrier.hq_city);
  const state = pick(carrier.state, addressParts.state, carrier.phy_state, carrier.hq_state);
  const zip = pick(carrier.zip, addressParts.zip, carrier.phy_zip, carrier.hq_zip);
  const contactNumbers = dedupeContactNumbers([
    ...lead.contactNumbers,
    ...collectContactNumbersFromAllSources({
      leadSearchResult: carrier,
      carrierProfile: carrier,
      motusRecord: carrier.motusProfile || carrier.raw?.motusProfile || carrier.raw?.motusRegister,
      fmcsaRecord: carrier.qcmobileDetails || carrier.raw?.liveCarrier || carrier.raw?.qcmobileDetails,
      saferRecord: carrier.saferData || carrier.raw?.saferData,
      dataTransportRecord: carrier.census || carrier.raw?.census,
      cachedDatabaseRecord: carrier.cachedDatabaseRecord || carrier.raw?.databaseRecord,
      enrichmentRecord: carrier,
    }),
  ]);
  const primaryContact = getPrimaryContactNumber(contactNumbers);
  const email = pick(carrier.email, carrier.emailAddress);
  const dot = pick(carrier.dotNumber, carrier.dot_number, carrier.usdot, carrier.usdotNumber, carrier.dot);
  const mc = pick(carrier.mcNumber, carrier.mc_number, carrier.mc, carrier.docketNumber);
  const trucks = pick(carrier.powerUnits, carrier.power_units, carrier.vehicleCount, carrier.vehicle_count, carrier.fleetSize);
  const drivers = pick(carrier.drivers, carrier.driverCount, carrier.driver_count);
  const fleetBreakdown = firstObject(carrier.fleetBreakdown);
  const cargo = splitCargo(pick(carrier.cargoHauled, carrier.cargo, carrier.cargoCarried, carrier.cargoTypes, carrier.cargo_hauled));
  const safety = firstObject(carrier.safety);
  const inspectionSummary = normalizeInspectionSummary(firstObject(carrier.inspectionSummary, safety.inspectionSummary, carrier.inspection_summary));
  const basicSummary = normalizeBasicScores(carrier);

  return {
    raw: carrier,
    dot,
    mc,
    mcNumber: formatMc(mc),
    name: pick(carrier.carrierName, carrier.legalName, carrier.legal_name, carrier.carrier_name, carrier.name, "Unknown carrier"),
    dbaName: pick(carrier.dbaName, carrier.dba_name),
    address: pick(addressText, carrier.physicalAddress, carrier.mailingAddress),
    city,
    state,
    zip,
    phone: primaryContact?.number || "",
    phoneNumber: primaryContact?.number || "",
    contactNumbers,
    email,
    entityType: pick(carrier.entityType, carrier.entity_type, carrier.carrierEntityType, carrier.carrierType, carrier.carrier?.entityType),
    operations: pick(carrier.operations, carrier.operationType, carrier.operationsScope, carrier.carrierOperation, carrier.carrier_operation),
    operationClassification: carrier.operationClassification || [],
    operatingStatus: pick(carrier.authorityStatus, carrier.authority_status, carrier.operatingStatus, carrier.operating_status, "Unknown"),
    outOfServiceStatus: pick(carrier.outOfServiceStatus, carrier.out_of_service_status, carrier.oosStatus, carrier.isOutOfService, carrier.outOfService),
    outOfServiceDate: pick(carrier.outOfServiceDate, carrier.out_of_service_date, carrier.outOfServiceDate, carrier.oosDate),
    safetyRating: pick(carrier.safetyRating, carrier.safety_rating, safety.safetyRating, "Not Rated"),
    safetyRatingDate: pick(carrier.safetyRatingDate, carrier.safety_rating_date, safety.safetyRatingDate),
    mcs150Date: pick(carrier.mcs150Date, carrier.mcs_150_date, carrier.mcs150_date),
    addDate: pick(carrier.addDate, carrier.add_date, carrier.dateCreated),
    trucks,
    drivers,
    tractors: pick(carrier.tractorCount, fleetBreakdown.tractors),
    trailers: pick(carrier.trailerCount, fleetBreakdown.trailers),
    straightTrucks: pick(carrier.straightTruckCount, fleetBreakdown.straightTrucks),
    cargo,
    insuranceCompany: lead.insuranceCompany,
    insuranceExpiration: pick(carrier.insuranceExpiration, carrier.insuranceExpirationDate, carrier.insurance_expiration, carrier.licensingInsurance?.insuranceExpirationDate),
    insuranceEffectiveDate: lead.insuranceEffectiveDate,
    insuranceCancelDate: lead.insuranceCancelDate,
    insurancePolicyNumber: pick(carrier.insurancePolicyNumber, carrier.insurance_policy_number, carrier.licensingInsurance?.policyNumber),
    insuranceFilingStatus: lead.insuranceFilingStatus,
    filingType: lead.filingType,
    renewalDisplay: getRenewalDisplay(lead),
    insuranceFilings: normalizeInsuranceFilings(carrier, lead),
    totalInspections: pick(inspectionSummary.totalInspections, lead.totalInspections),
    vehicleInspections: pick(inspectionSummary.vehicleInspections, lead.vehicleInspections),
    driverInspections: pick(inspectionSummary.driverInspections, lead.driverInspections),
    hazmatInspections: pick(inspectionSummary.hazmatInspections, lead.hazmatInspections),
    inspectionsWithViolations: lead.inspectionsWithViolations,
    inspectionsWithoutViolations: lead.inspectionsWithoutViolations,
    totalViolations: pick(inspectionSummary.totalViolations, lead.totalViolations),
    oosViolations: pick(inspectionSummary.oosViolations, lead.oosViolations),
    vehicleOos: pick(inspectionSummary.vehicleOosCount, lead.vehicleOos, carrier.vehicleOos, carrier.vehicle_oos, safety.vehicleOos, safety.vehicleOosCount),
    driverOos: pick(inspectionSummary.driverOosCount, lead.driverOos, carrier.driverOos, carrier.driver_oos, safety.driverOos, safety.driverOosCount),
    hazmatOos: pick(inspectionSummary.hazmatOosCount, lead.hazmatOos, carrier.hazmatOos, safety.hazmatOos),
    driverOosRate: pick(inspectionSummary.driverOosRate, lead.driverOosRate),
    vehicleOosRate: pick(inspectionSummary.vehicleOosRate, lead.vehicleOosRate),
    hazmatOosRate: pick(inspectionSummary.hazmatOosRate, lead.hazmatOosRate),
    nationalAverageVehicleOosRate: pick(inspectionSummary.nationalAverageVehicleOosRate, lead.nationalAverageVehicleOosRate),
    nationalAverageDriverOosRate: pick(inspectionSummary.nationalAverageDriverOosRate, lead.nationalAverageDriverOosRate),
    nationalAverageHazmatOosRate: pick(inspectionSummary.nationalAverageHazmatOosRate, lead.nationalAverageHazmatOosRate),
    smsSnapshotDate: pick(basicSummary.snapshotDate, lead.smsSnapshotDate),
    basicScores: basicSummary.scores,
    basicCategories: basicSummary.scores,
    basicSummary,
    smsProfileAvailable: lead.smsProfileAvailable,
    safetySource: lead.safetySource,
    inspectionHistory: lead.inspectionHistory,
    crashSummary: normalizeCrashes(carrier, lead),
    dataSources: carrier.dataSources || {},
    liveFmcsaStatus: carrier.liveFmcsaStatus || {},
    companyRep: pick(carrier.companyRep, carrier.companyOfficer1, carrier.company_rep),
    companyOfficerTitle: carrier.companyOfficerTitle,
  };
}

function ProfileCard({ title, children, className = "" }) {
  return (
    <section className={`profile-card ${className}`}>
      {title && <h2 className="text-lg font-bold text-white mb-5">{title}</h2>}
      {children}
    </section>
  );
}

function DetailItem({ label, value, fallback = NOT_AVAILABLE }) {
  return (
    <div>
      <p className="profile-label">{label}</p>
      <p className="profile-value">{valueOrUnavailable(value, fallback)}</p>
    </div>
  );
}

function statusVariant(status) {
  const value = String(status || "").toUpperCase();
  if (value.includes("AUTHORIZED") || value.includes("ACTIVE") || value.includes("SATISFACTORY")) return "success";
  if (value.includes("CONDITIONAL") || value.includes("PENDING")) return "warning";
  if (value.includes("UNSAT") || value.includes("REVOKED") || value.includes("INACTIVE")) return "danger";
  return "outline";
}

function SafetyRatingCard({ carrier }) {
  const rating = valueOrUnavailable(carrier.safetyRating);
  return (
    <ProfileCard title="Safety Rating">
      <div className="flex items-center gap-4">
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
          statusVariant(rating) === "success" ? "bg-accent-500/15 text-accent-300" :
          statusVariant(rating) === "warning" ? "bg-warning-500/15 text-warning-300" :
          statusVariant(rating) === "danger" ? "bg-danger-500/15 text-danger-300" :
          "bg-white/5 text-navy-300"
        }`}>
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12.75l2 2 4-5.5m5-3.5A11.5 11.5 0 0112 3 11.5 11.5 0 014 5.75v5.5c0 5 3.4 9.3 8 10.5 4.6-1.2 8-5.5 8-10.5v-5.5z" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-bold text-white">{rating}</p>
          <p className="text-xs text-navy-400">Rated {valueOrUnavailable(carrier.safetyRatingDate)}</p>
        </div>
      </div>
    </ProfileCard>
  );
}

function CrashHistoryCard({ crashes }) {
  const safeCrashes = crashes && typeof crashes === "object" ? crashes : {};
  const hasCrashData = [safeCrashes.total, safeCrashes.fatal, safeCrashes.injury, safeCrashes.tow].some(hasValue);
  const tiles = [
    ["Total", safeCrashes.total],
    ["Fatal", safeCrashes.fatal],
    ["Injury", safeCrashes.injury],
    ["Tow", safeCrashes.tow],
  ];
  return (
    <ProfileCard title="Crash History">
      {hasCrashData ? (
        <div className="grid grid-cols-2 gap-3">
          {tiles.map(([label, value]) => (
            <div key={label} className="profile-stat-tile">
              <p className="text-xl font-black text-white">{valueOrUnavailable(value)}</p>
              <p className="profile-label mt-1">{label}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-navy-400">Public crash summary not available from this data source.</p>
      )}
    </ProfileCard>
  );
}

function InspectionHistoryCard({ carrier }) {
  const safeCarrier = carrier && typeof carrier === "object" ? carrier : {};
  const tiles = [
    ["Total Inspections", safeCarrier.totalInspections],
    ["Vehicle Inspections", safeCarrier.vehicleInspections],
    ["Driver Inspections", safeCarrier.driverInspections],
    ["Hazmat Inspections", safeCarrier.hazmatInspections],
    ["Vehicle OOS", safeCarrier.vehicleOos],
    ["Driver OOS", safeCarrier.driverOos],
    ["Hazmat OOS", safeCarrier.hazmatOos],
    ["Vehicle OOS Rate", formatRate(safeCarrier.vehicleOosRate)],
    ["Driver OOS Rate", formatRate(safeCarrier.driverOosRate)],
  ].filter(([, value]) => hasValue(value));
  return (
    <ProfileCard title="Inspection History">
      {tiles.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {tiles.map(([label, value]) => (
            <div key={label} className="profile-stat-tile">
              <p className="text-xl font-black text-white">{valueOrUnavailable(value)}</p>
              <p className="profile-label mt-1">{label}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-navy-400">Inspection data could not be loaded.</p>
      )}
      <div className="mt-5">
        <SafetyBarsPanel record={safeCarrier} mode="inspection" />
      </div>
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <DetailItem label="Hazmat OOS Rate" value={formatRate(safeCarrier.hazmatOosRate)} />
        <DetailItem label="Total Violations" value={safeCarrier.totalViolations} />
        <DetailItem label="OOS Violations" value={safeCarrier.oosViolations} />
      </div>
    </ProfileCard>
  );
}

function InsuranceFilingCard({ carrier }) {
  return (
    <ProfileCard title="Insurance Filing">
      <div className="space-y-3">
        {carrier.insuranceFilings.map((filing, index) => (
          <div key={`${filing.title}-${index}`} className="profile-card-muted">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="profile-label">{valueOrUnavailable(filing.title, "Filing")}</p>
                <p className="profile-value">{valueOrUnavailable(filing.company, FMCSA_UNAVAILABLE)}</p>
                <p className="mt-1 text-xs font-mono text-sky-100/35">Policy/Filing Number: {valueOrUnavailable(filing.reference, FMCSA_UNAVAILABLE)}</p>
              </div>
              {filing.limit && <Badge variant="success">{filing.limit}</Badge>}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-white/[0.06] pt-3">
              <DetailItem label="Filing Status" value={filing.status} fallback={FMCSA_UNAVAILABLE} />
              <DetailItem label="Filing Effective Date" value={filing.effectiveDate} fallback={FMCSA_UNAVAILABLE} />
              <DetailItem label="Filing Cancellation Date" value={filing.cancelDate} fallback={FMCSA_UNAVAILABLE} />
              <DetailItem label="Expiration Date" value={filing.expirationDate} fallback={FMCSA_UNAVAILABLE} />
            </div>
          </div>
        ))}
      </div>
    </ProfileCard>
  );
}

function ContactNumbersSection({ numbers = [], onStatus }) {
  async function copyValue(value, label) {
    try {
      await navigator.clipboard.writeText(value);
      onStatus?.(`${label} copied.`);
    } catch {
      onStatus?.("Copy failed. Your browser may not allow clipboard access.");
    }
  }

  return (
    <div className="sm:col-span-2">
      <p className="profile-label">Contact Numbers</p>
      {numbers.length ? (
        <div className="mt-2 space-y-2">
          {numbers.map((entry) => (
            <div key={`${entry.type}-${entry.digits}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-navy-400">{entry.label}</p>
                <p className="text-sm font-semibold text-white">{entry.number}</p>
              </div>
              <button type="button" onClick={() => copyValue(entry.number, entry.label || "Phone number")} className="btn-secondary rounded-lg border border-white/10 px-3 py-1.5 text-xs">Copy</button>
            </div>
          ))}
          {numbers.length > 1 && (
            <button type="button" onClick={() => copyValue(formatAllContactNumbers(numbers), "All contact numbers")} className="btn-secondary rounded-lg border border-white/10 px-3 py-1.5 text-xs">Copy All</button>
          )}
        </div>
      ) : (
        <p className="mt-1 text-sm text-navy-400">No public phone number found.</p>
      )}
    </div>
  );
}

function CompanyDetailsCard({ carrier, onStatus }) {
  const fleet = [
    hasValue(carrier.trucks) && `${carrier.trucks} power units`,
    hasValue(carrier.tractors) && `${carrier.tractors} tractors`,
    hasValue(carrier.trailers) && `${carrier.trailers} trailers`,
    hasValue(carrier.straightTrucks) && `${carrier.straightTrucks} straight trucks`,
    hasValue(carrier.drivers) && `${carrier.drivers} drivers`,
  ].filter(Boolean).join(", ");
  return (
    <ProfileCard title="Company Details">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-5">
        <ContactNumbersSection numbers={carrier.contactNumbers} onStatus={onStatus} />
        <DetailItem label="Email" value={carrier.email} />
        <DetailItem label="Address" value={carrier.address || [carrier.city, carrier.state, carrier.zip].filter(Boolean).join(", ")} />
        <DetailItem label="Entity Type" value={carrier.entityType} />
        <DetailItem label="Owner / Company Officer" value={[carrier.companyRep, carrier.companyOfficerTitle].filter(Boolean).join(" - ")} />
        <DetailItem label="Fleet Size" value={fleet} />
        <DetailItem label="Operations" value={carrier.operations} />
        <DetailItem label="Authority Status" value={carrier.operatingStatus} />
        <DetailItem label="Out-of-Service Status" value={carrier.outOfServiceStatus} />
        <DetailItem label="Out-of-Service Date" value={carrier.outOfServiceDate} />
      </div>
      <div className="mt-6 border-t border-white/[0.06] pt-5">
        <p className="profile-label mb-3">Cargo Carried</p>
        {carrier.cargo.length ? (
          <div className="flex flex-wrap gap-2">
            {carrier.cargo.map((item) => (
              <span key={item} className="rounded-full border border-sky-300/20 bg-sky-300/5 px-3 py-1 text-xs font-semibold text-sky-100/75">
                {item}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-navy-400">{NOT_AVAILABLE}</p>
        )}
      </div>
    </ProfileCard>
  );
}

export default function CarrierProfilePage() {
  const { user } = useAuth();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const dot = id || searchParams.get("dot");
  const [carrier, setCarrier] = useState(null);
  const [loading, setLoading] = useState(Boolean(dot));
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const backTo = location.state?.from || "/carrier-search";
  const backLabel = location.state?.label || "Back to carrier search";
  const aiDraftAllowed = canUseAiEmailDraft(user);

  useEffect(() => {
    if (!dot) {
      setError("No DOT number was provided.");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");
    api.getCarrierProfile(dot)
      .then((data) => {
        if (active) setCarrier(normalizeCarrier(data));
      })
      .catch((err) => {
        if (active) setError(err.message || "Carrier profile could not be loaded.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dot]);

  const outreachLead = useMemo(() => {
    if (!carrier) return {};
    return {
      ...carrier,
      carrierName: carrier.name,
      dotNumber: carrier.dot,
      mcNumber: carrier.mcNumber,
      renewalDate: carrier.renewalDisplay?.date || "",
      renewalDateSource: carrier.renewalDisplay?.label || "",
    };
  }, [carrier]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("mtl:scout-context", {
      detail: { carrier: carrier ? outreachLead : null },
    }));

    return () => {
      window.dispatchEvent(new CustomEvent("mtl:scout-context", {
        detail: { carrier: null },
      }));
    };
  }, [carrier, outreachLead]);

  function emailCarrier() {
    const result = openEmailClientForLeads([outreachLead]);
    setSaveStatus(result.message);
  }

  async function copyDraft() {
    if (!aiDraftAllowed) {
      setSaveStatus("AI draft assistance is available on Pro and Agency plans.");
      return;
    }
    try {
      await copyAiEmailDraft(outreachLead);
      setSaveStatus("AI email draft copied. Paste it into your email app.");
    } catch {
      setSaveStatus("Copy failed. Your browser may not allow clipboard access.");
    }
  }

  async function saveToPipeline() {
    if (!carrier) return;
    setSaveStatus("Saving...");
    try {
      await api.addLead({
        carrier_name: carrier.name,
        dot_number: carrier.dot,
        mc_number: carrier.mc,
        state: carrier.state,
        status: "New",
        insurance_expiration: carrier.insuranceExpiration || null,
        contactNumbers: carrier.contactNumbers || [],
        notes: [
          carrier.state ? `State: ${carrier.state}` : "",
          carrier.phone ? `Phone: ${carrier.phone}` : "",
          carrier.contactNumbers?.length ? `All Contact Numbers: ${formatAllContactNumbers(carrier.contactNumbers)}` : "",
          carrier.email ? `Email: ${carrier.email}` : "",
          carrier.cargo.length ? `Cargo: ${carrier.cargo.join(", ")}` : "",
        ].filter(Boolean).join(" "),
      });
      setSaveStatus("Saved to CRM");
    } catch (err) {
      setSaveStatus(err.message || "Could not save carrier.");
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
        <ScoutMascot size="md" />
        <div>
          <p className="text-sm font-semibold text-white">Reviewing FMCSA details...</p>
          <p className="mt-1 text-sm text-navy-400">Scout is checking DOT records and carrier profile data.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => navigate(backTo)} className="text-brand-400 hover:text-brand-300 text-sm">{backLabel}</button>
        <div className="rounded-xl border border-danger-500/20 bg-danger-500/10 p-6">
          <ScoutEmptyState
            title="Some public carrier data was not returned."
            message={error || "Try refreshing or checking another DOT number."}
            actionLabel="Go Back"
            onAction={() => navigate(backTo)}
          />
        </div>
      </div>
    );
  }

  if (!carrier) {
    return (
      <ScoutEmptyState
        title="Some public carrier data was not returned."
        message="Try refreshing or checking another DOT number."
        actionLabel="Go Back"
        onAction={() => navigate(backTo)}
        className="py-20"
      />
    );
  }
  const isOwner = user?.isOwner || user?.role === "owner" || user?.role === "admin" || user?.email === "owner@mytruckingleads.com";
  const showFmcsaDebug = isOwner && carrier.liveFmcsaStatus?.attempted && carrier.liveFmcsaStatus?.success === false;

  return (
    <div className="carrier-profile-page min-w-0 space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 text-sm">
        <button type="button" onClick={() => navigate(backTo)} className="text-sky-100/45 hover:text-white transition-colors">{backLabel}</button>
        <span className="text-sky-100/30">/</span>
        <span className="font-semibold text-sky-100">{carrier.name}</span>
      </div>

      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">{carrier.name}</h1>
            <Badge variant={statusVariant(carrier.operatingStatus)} className="uppercase">{carrier.operatingStatus}</Badge>
          </div>
          {carrier.dbaName && <p className="mt-2 text-sm text-navy-400">DBA: {carrier.dbaName}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-sky-100/45">
            {carrier.dot && <span className="font-mono">DOT {carrier.dot}</span>}
            {carrier.mcNumber && <span className="font-mono">{carrier.mcNumber}</span>}
            <span>{valueOrUnavailable([carrier.city, carrier.state, carrier.zip].filter(Boolean).join(", "))}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {carrier.phone && <a href={`tel:${carrier.phone}`} className="btn-secondary text-sm px-4 py-2 rounded-xl border border-white/10">Call</a>}
          <Button size="sm" onClick={saveToPipeline}>Add to Pipeline</Button>
          {carrier.email && <button type="button" onClick={emailCarrier} className="btn-secondary text-sm px-4 py-2 rounded-xl border border-white/10">Email</button>}
          {aiDraftAllowed && <button type="button" onClick={copyDraft} className="btn-secondary text-sm px-4 py-2 rounded-xl border border-white/10">Copy AI Draft</button>}
        </div>
      </div>

      {saveStatus && (
        <div className="rounded-xl border border-brand-500/20 bg-brand-500/10 p-3 text-sm text-brand-200">{saveStatus}</div>
      )}
      {showFmcsaDebug && (
        <div className="rounded-xl border border-warning-500/25 bg-warning-500/10 p-3 text-sm text-warning-100">
          Live FMCSA request failed: {carrier.liveFmcsaStatus.reason || "No successful live QCMobile response returned."}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(320px,0.9fr)] gap-6">
        <div className="min-w-0 space-y-6">
          <CompanyDetailsCard carrier={carrier} onStatus={setSaveStatus} />

          <ProfileCard title="BASIC Safety Scores">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-100/45">SMS Snapshot Date</p>
              <p className="text-sm font-bold text-white">{valueOrUnavailable(carrier.smsSnapshotDate)}</p>
            </div>
            <SafetyBarsPanel record={carrier} mode="basic" />
          </ProfileCard>

          <InspectionHistoryCard carrier={carrier} />
        </div>

        <aside className="min-w-0 space-y-6">
          <InsuranceFilingCard carrier={carrier} />
          <SafetyRatingCard carrier={carrier} />
          <CrashHistoryCard crashes={carrier.crashSummary} />
        </aside>
      </div>

    </div>
  );
}
