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
  cleanDisplayValue,
  formatAuthorityStatus,
  formatCargoList,
  formatCarrierOperation,
  formatDate,
  formatDriverBreakdown,
  formatEntityType,
  formatMcNumber,
  formatOosStatus,
  formatUnavailable,
  formatVehicleBreakdown,
} from "@/lib/displayFormatters";
import {
  getRenewalDisplay,
  normalizeBasicScores,
  normalizeInspectionSummary,
  normalizeLeadRecord,
  pick,
  splitCargo,
} from "@/lib/leadMapping";

const NOT_AVAILABLE = "Not available";
const FMCSA_UNAVAILABLE = "None Shown";
function displayUnavailable(short = false) {
  return formatUnavailable("", short);
}

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

function numberFromValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFilingType(value) {
  const text = String(value || "").split(/\s+-\s+Max coverage/i)[0].trim();
  if (!text) return "";
  return text.replace(/\s*\/\s*/g, " / ");
}

function coverageFromText(value) {
  const text = String(value || "");
  const match = text.match(/max\s+coverage\s+\$?([\d,]+)/i);
  return match ? numberFromValue(match[1]) : null;
}

function normalizeCoverageAmount(rawFiling = {}) {
  const explicitCoverage = numberFromValue(rawFiling.maxCoverage);
  if (explicitCoverage !== null && explicitCoverage >= 1000) return explicitCoverage;

  const rawMaxCoverage = numberFromValue(rawFiling.rawMaxCoverage);
  const sourceField = rawFiling.coverageSourceField || rawFiling.sourceField;
  const sourceUnit = rawFiling.coverageSourceUnit || rawFiling.sourceUnit;
  if (rawMaxCoverage !== null && sourceField === "max_cov_amount" && sourceUnit === "thousands") {
    return rawMaxCoverage * 1000;
  }

  const textCoverage = coverageFromText(rawFiling.coverageInfo || rawFiling.limit || rawFiling.coverageLimit);
  if (textCoverage !== null && /max\s+coverage/i.test(String(rawFiling.coverageInfo || rawFiling.limit || ""))) {
    return textCoverage < 1000 ? textCoverage * 1000 : textCoverage;
  }

  return explicitCoverage;
}

function formatCoverageAmount(value, rawFieldInfo = {}) {
  const coverage = numberFromValue(value);
  if (coverage !== null && coverage >= 1000) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(coverage);
  }

  const rawMaxCoverage = numberFromValue(rawFieldInfo.rawMaxCoverage);
  const sourceField = rawFieldInfo.coverageSourceField || rawFieldInfo.sourceField;
  const sourceUnit = rawFieldInfo.coverageSourceUnit || rawFieldInfo.sourceUnit;
  if (rawMaxCoverage !== null && sourceField === "max_cov_amount" && sourceUnit === "thousands") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(rawMaxCoverage * 1000);
  }

  if (coverage !== null) return String(coverage);
  if (rawMaxCoverage !== null) return String(rawMaxCoverage);
  return FMCSA_UNAVAILABLE;
}

function formatFilingDate(value) {
  return formatDate(value) || FMCSA_UNAVAILABLE;
}

function dedupeInsuranceFilings(filings = []) {
  const seen = new Set();
  return filings.filter((filing) => {
    const key = [
      filing.carrierName,
      filing.policyNumber,
      filing.filingType,
      filing.status,
      filing.effectiveDate,
      filing.maxCoverage,
    ].map((value) => String(value || "").trim().toLowerCase()).join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeInsuranceFiling(rawFiling = {}, fallback = {}) {
  const coverageInfo = pick(rawFiling.coverageInfo, rawFiling.limit, rawFiling.coverageLimit);
  const filingType = normalizeFilingType(pick(
    rawFiling.filingType,
    rawFiling.insuranceType,
    rawFiling.form,
    rawFiling.type,
    coverageInfo,
    fallback.filingType
  ));
  const rawMaxCoverage = numberFromValue(rawFiling.rawMaxCoverage) ?? coverageFromText(coverageInfo);
  const sourceField = rawFiling.coverageSourceField || rawFiling.sourceField || (rawMaxCoverage !== null && /max\s+coverage/i.test(String(coverageInfo)) ? "max_cov_amount" : "");
  const sourceUnit = rawFiling.coverageSourceUnit || rawFiling.sourceUnit || (sourceField === "max_cov_amount" ? "thousands" : "");
  const maxCoverage = normalizeCoverageAmount({
    ...rawFiling,
    rawMaxCoverage,
    coverageSourceField: sourceField,
    coverageSourceUnit: sourceUnit,
  });
  const cancellationDate = pick(
    rawFiling.cancellationDate,
    rawFiling.insuranceCancellationDate,
    rawFiling.cancelDate,
    rawFiling.canclEffectiveDate,
    fallback.cancellationDate
  );

  return {
    filingType,
    coverageType: filingType.split("/")[0]?.trim() || "",
    carrierName: pick(rawFiling.carrierName, rawFiling.insuranceCompany, rawFiling.company, fallback.carrierName),
    policyNumber: pick(rawFiling.policyNumber, rawFiling.formNumber, rawFiling.docketNumber, fallback.policyNumber),
    status: pick(rawFiling.status, rawFiling.insuranceFilingStatus, rawFiling.formCode, fallback.status),
    effectiveDate: pick(rawFiling.effectiveDate, rawFiling.insuranceEffectiveDate, fallback.effectiveDate),
    cancellationDate,
    expirationDate: pick(rawFiling.expirationDate, fallback.expirationDate),
    maxCoverage,
    rawMaxCoverage,
    source: rawFiling.source || fallback.source || "FMCSA",
    sourceField,
    sourceUnit,
    isActive: cancellationDate ? false : null,
  };
}

function normalizeInsuranceFilings(rawCarrier, lead) {
  const filings = [];
  const carrier = rawCarrier || {};
  const insuranceFilings = carrier.insuranceFilings || carrier.insurance_filings || {};
  const publicLiability = insuranceFilings.publicLiability || insuranceFilings.public_liability || carrier.licensingInsurance || {};
  const cargo = insuranceFilings.cargo || carrier.cargoInsurance || {};
  const bmcFilings = asArray(carrier.bmcFilings || carrier.bmc_filings || carrier.licensingInsurance?.bmcFilings);

  if (Object.keys(publicLiability).length || lead.insuranceCompany || lead.filingType || lead.insuranceEffectiveDate || lead.insuranceCancelDate) {
    filings.push(normalizeInsuranceFiling(publicLiability, {
      filingType: pick(lead.filingType, publicLiability.coverageInfo, "BIPD / Primary"),
      carrierName: pick(lead.insuranceCompany, publicLiability.insuranceCompany, publicLiability.company),
      policyNumber: pick(carrier.insurancePolicyNumber, carrier.insurance_policy_number, publicLiability.policyNumber, publicLiability.formNumber),
      status: lead.insuranceFilingStatus,
      effectiveDate: lead.insuranceEffectiveDate,
      cancellationDate: pick(
        carrier.insuranceCancellationDate,
        carrier.fmcsaInsuranceCancellationDate,
        publicLiability.insuranceCancellationDate,
        publicLiability.cancellationDate,
        publicLiability.cancelDate
      ),
      expirationDate: pick(carrier.insuranceExpiration, carrier.insuranceExpirationDate, carrier.insurance_expiration, publicLiability.insuranceExpirationDate),
      source: "FMCSA",
    }));
  }

  if (Object.keys(cargo).length || typeof cargo === "string") {
    filings.push(normalizeInsuranceFiling(typeof cargo === "string" ? { coverageInfo: cargo } : cargo, { filingType: "Cargo" }));
  }

  bmcFilings.forEach((filing) => filings.push(normalizeInsuranceFiling(filing)));

  return dedupeInsuranceFilings(filings).filter((filing) => (
    filing.filingType ||
    filing.carrierName ||
    filing.policyNumber ||
    filing.status ||
    filing.effectiveDate ||
    filing.maxCoverage
  ));
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

function normalizeDotStatus(value) {
  const text = cleanDisplayValue(value);
  const upper = text.toUpperCase();
  if (!text) return "";
  if (upper === "A" || upper === "ACTIVE") return "Active";
  if (upper === "I" || upper === "INACTIVE") return "Inactive";
  if (upper === "P" || upper === "PENDING") return "Pending";
  return text;
}

function isDotStatusValue(value) {
  return /^(a|active|i|inactive|p|pending)$/i.test(cleanDisplayValue(value));
}

function normalizeAuthorityStatus(value) {
  return formatAuthorityStatus(value);
}

function normalizeEntityType(value) {
  return formatEntityType(value);
}

function normalizeOutOfService(value) {
  return formatOosStatus(value);
}

function normalizeOperations(value) {
  return formatCarrierOperation(value);
}

function normalizeSafetyRatingDisplay(value) {
  const text = cleanDisplayValue(value);
  if (!text || /^unknown$/i.test(text)) return "";
  if (/^not\s+rated$/i.test(text)) return "Not Rated";
  return text;
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
  const entityType = pick(carrier.entityType, carrier.entity_type, carrier.carrierEntityType, carrier.carrierType, carrier.carrier?.entityType);
  const operations = pick(carrier.operations, carrier.operationType, carrier.operationsScope, carrier.carrierOperation, carrier.carrier_operation);
  const rawAuthorityStatus = pick(carrier.authorityStatus, carrier.authority_status);
  const rawOperatingStatus = pick(carrier.operatingStatus, carrier.operating_status);
  const liveAuthority = firstObject(carrier.qcmobileDetails?.authority, carrier.raw?.liveCarrier?.qcmobileDetails?.authority, carrier.raw?.qcmobileDetails?.authority);
  const liveSaferData = firstObject(carrier.saferData, carrier.raw?.saferData, carrier.raw?.liveCarrier?.saferData);
  const dotStatus = pick(
    carrier.usdotStatus,
    carrier.usdot_status,
    carrier.dotStatus,
    carrier.dot_status,
    carrier.statusCode,
    carrier.status_code,
    carrier.raw?.census?.status_code,
    carrier.raw?.census?.authorityStatus,
    isDotStatusValue(rawAuthorityStatus) ? rawAuthorityStatus : "",
    isDotStatusValue(rawOperatingStatus) ? rawOperatingStatus : ""
  );
  const operatingStatus = pick(
    carrier.operatingAuthorityStatus,
    carrier.operating_authority_status,
    liveSaferData.authorityStatus,
    liveAuthority.authorityStatus,
    !isDotStatusValue(rawAuthorityStatus) ? rawAuthorityStatus : "",
    !isDotStatusValue(rawOperatingStatus) ? rawOperatingStatus : ""
  );
  const outOfServiceStatus = pick(carrier.outOfServiceStatus, carrier.out_of_service_status, carrier.oosStatus, carrier.isOutOfService, carrier.outOfService);
  const safetyRating = pick(carrier.safetyRating, carrier.safety_rating, safety.safetyRating);
  const mailingAddress = pick(carrier.mailingAddress, carrier.mailing_address, carrier.raw?.census?.mailing_address);
  const companyOfficials = [
    {
      name: pick(carrier.companyRep, carrier.companyOfficer1, carrier.company_rep),
      title: pick(carrier.companyOfficerTitle, "Owner / Company Officer"),
      role: "Company Official",
      phone: "",
      email: "",
    },
    {
      name: pick(carrier.companyOfficer2),
      title: "",
      role: "Company Official",
      phone: "",
      email: "",
    },
  ].filter((official, index, rows) => (
    official.name &&
    rows.findIndex((row) => String(row.name).trim().toLowerCase() === String(official.name).trim().toLowerCase()) === index
  ));
  const vehicleBreakdown = formatVehicleBreakdown({ ...carrier, trucks, fleetBreakdown });
  const driverBreakdown = formatDriverBreakdown({ ...carrier, drivers });

  return {
    raw: carrier,
    dot,
    mc,
    mcNumber: formatMc(mc),
    name: pick(carrier.carrierName, carrier.legalName, carrier.legal_name, carrier.carrier_name, carrier.name, "Unknown carrier"),
    legalName: pick(carrier.legalName, carrier.legal_name, carrier.carrierName, carrier.carrier_name, carrier.name),
    dbaName: pick(carrier.dbaName, carrier.dba_name),
    address: pick(addressText, carrier.physicalAddress, carrier.mailingAddress),
    physicalAddress: pick(carrier.physicalAddress, addressText),
    mailingAddress,
    city,
    state,
    zip,
    phone: primaryContact?.number || "",
    phoneNumber: primaryContact?.number || "",
    contactNumbers,
    email,
    entityType,
    entityTypeDisplay: normalizeEntityType(entityType),
    operations,
    operationsDisplay: normalizeOperations(operations),
    operationClassification: carrier.operationClassification || [],
    dotStatus,
    dotStatusDisplay: normalizeDotStatus(dotStatus),
    operatingStatus,
    operatingStatusDisplay: normalizeAuthorityStatus(operatingStatus),
    outOfServiceStatus,
    outOfServiceStatusDisplay: normalizeOutOfService(outOfServiceStatus),
    outOfServiceDate: pick(carrier.outOfServiceDate, carrier.out_of_service_date, carrier.outOfServiceDate, carrier.oosDate),
    safetyRating,
    safetyRatingDisplay: normalizeSafetyRatingDisplay(safetyRating),
    safetyRatingDate: pick(carrier.safetyRatingDate, carrier.safety_rating_date, safety.safetyRatingDate),
    mcs150Date: pick(carrier.mcs150Date, carrier.mcs_150_date, carrier.mcs150_date),
    mcs150Mileage: pick(carrier.mcs150Mileage, carrier.mcs150_mileage, carrier.raw?.census?.mcs150_mileage),
    mcs150MileageYear: pick(carrier.mcs150MileageYear, carrier.mcs150_mileage_year, carrier.raw?.census?.mcs150_mileage_year),
    lastUpdated: pick(carrier.lastUpdated, carrier.last_updated, carrier.updatedAt, carrier.updated_at),
    addDate: pick(carrier.addDate, carrier.add_date, carrier.dateCreated),
    trucks,
    drivers,
    cdlDrivers: pick(carrier.cdlDrivers, carrier.cdl_drivers),
    intrastateDrivers: pick(carrier.intrastateDrivers, carrier.intrastate_drivers),
    vehicleBreakdown,
    driverBreakdown,
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
    leadType: lead.leadType,
    confidence: lead.confidence,
    verificationStatus: lead.verificationStatus,
    sourceName: lead.sourceName,
    lastVerifiedAt: lead.lastVerifiedAt,
    insuranceIntelligenceNote: lead.insuranceIntelligenceNote,
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
    companyOfficer2: pick(carrier.companyOfficer2),
    companyOfficerTitle: carrier.companyOfficerTitle,
    companyOfficials,
    authoritySince: pick(carrier.authoritySince, carrier.authority_since),
    authorityAge: pick(carrier.authorityAge, carrier.authority_age),
    docketNumbers: Array.isArray(carrier.docketNumbers) ? carrier.docketNumbers : [],
    newEntrantProgram: firstObject(carrier.newEntrantProgram, carrier.new_entrant_program, carrier.raw?.census?.newEntrantProgram),
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

function DetailItem({ label, value, fallback = FMCSA_UNAVAILABLE }) {
  return (
    <div>
      <p className="profile-label">{label}</p>
      <p className="profile-value">{valueOrUnavailable(value, fallback)}</p>
    </div>
  );
}

function statusVariant(status) {
  const value = String(status || "").toUpperCase();
  if (value.includes("NOT AUTH") || value.includes("REVOKED") || value.includes("INACTIVE")) return "danger";
  if (value.includes("AUTHORIZED") || value.includes("ACTIVE") || value.includes("SATISFACTORY")) return "success";
  if (value.includes("CONDITIONAL") || value.includes("PENDING")) return "warning";
  if (value.includes("UNSAT")) return "danger";
  return "outline";
}

function SafetyRatingCard({ carrier }) {
  const rating = carrier.safetyRatingDisplay;
  return (
    <ProfileCard title="Safety Rating">
      {rating ? (
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
            <p className="text-base font-bold text-white">{rating}</p>
            {carrier.safetyRatingDate && <p className="text-sm text-navy-400">Rated {carrier.safetyRatingDate}</p>}
          </div>
        </div>
      ) : (
        <p className="text-sm font-semibold text-navy-300">{displayUnavailable()}</p>
      )}
    </ProfileCard>
  );
}

function CrashHistoryCard({ crashes }) {
  const safeCrashes = crashes && typeof crashes === "object" ? crashes : {};
  const hasCrashData = [safeCrashes.total, safeCrashes.fatal, safeCrashes.injury, safeCrashes.tow].some(hasValue);
  const tiles = [
    ["Total Crashes", safeCrashes.total],
    ["Fatal Crashes", safeCrashes.fatal],
    ["Injury Crashes", safeCrashes.injury],
    ["Towaway Crashes", safeCrashes.tow],
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
    ["Vehicle OOS", safeCarrier.vehicleOos],
    ["Driver OOS", safeCarrier.driverOos],
    ["Vehicle OOS Rate", formatRate(safeCarrier.vehicleOosRate)],
    ["Driver OOS Rate", formatRate(safeCarrier.driverOosRate)],
  ].filter(([, value]) => hasValue(value));
  const additionalTiles = [
    ["Hazmat Inspections", safeCarrier.hazmatInspections],
    ["Hazmat OOS", safeCarrier.hazmatOos],
    ["Hazmat OOS Rate", formatRate(safeCarrier.hazmatOosRate)],
    ["Total Violations", safeCarrier.totalViolations],
    ["OOS Violations", safeCarrier.oosViolations],
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
      {additionalTiles.length > 0 && (
        <div className="mt-5 border-t border-white/[0.06] pt-4">
          <p className="profile-label mb-3">Additional Inspection Data</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {additionalTiles.map(([label, value]) => (
              <DetailItem key={label} label={label} value={value} />
            ))}
          </div>
        </div>
      )}
    </ProfileCard>
  );
}

function InsuranceFilingCard({ carrier }) {
  const filings = carrier.insuranceFilings || [];
  const multipleFilings = filings.length > 1;

  return (
    <ProfileCard title={multipleFilings ? "Insurance Filings" : "Insurance Filing"}>
      <div className="mb-4 profile-card-muted">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-sky-100/45">Insurance Intelligence</p>
        <div className="grid grid-cols-1 gap-3">
          <DetailItem label="Lead Type" value={carrier.leadType || "Historical Insurance Record"} fallback={FMCSA_UNAVAILABLE} />
          <DetailItem label="Confidence" value={carrier.confidence || "Historical"} fallback={FMCSA_UNAVAILABLE} />
          <DetailItem label="Verification" value={carrier.verificationStatus || "Verification Pending"} fallback={FMCSA_UNAVAILABLE} />
          <DetailItem label="Source" value={carrier.sourceName} fallback={FMCSA_UNAVAILABLE} />
          <DetailItem label="Last Verified" value={formatFilingDate(carrier.lastVerifiedAt)} fallback={FMCSA_UNAVAILABLE} />
        </div>
        <p className="mt-3 text-xs text-amber-200">
          {carrier.leadType === "Verified Cancellation"
            ? "Cancellation date found in public filing data."
            : carrier.confidence === "Estimated"
              ? "Estimated renewal window based on filing effective date. Not a verified cancellation."
              : carrier.insuranceIntelligenceNote || "No verified cancellation date found in current public FMCSA data."}
        </p>
      </div>
      {filings.length ? (
        <div className="space-y-3">
          {filings.map((filing, index) => (
          <div key={`${filing.policyNumber || filing.filingType || "filing"}-${index}`} className="profile-card-muted">
            {multipleFilings && <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-sky-100/45">Filing {index + 1}</p>}
            <div className="grid grid-cols-1 gap-3">
              <DetailItem label="Carrier" value={filing.carrierName} fallback={FMCSA_UNAVAILABLE} />
              <DetailItem label="Filing Type" value={filing.filingType} fallback={FMCSA_UNAVAILABLE} />
              <DetailItem label="Policy/Filing Number" value={filing.policyNumber} fallback={FMCSA_UNAVAILABLE} />
              <DetailItem label="Max Coverage" value={formatCoverageAmount(filing.maxCoverage, filing)} fallback={FMCSA_UNAVAILABLE} />
              <DetailItem label="Filing Status" value={filing.status} fallback={FMCSA_UNAVAILABLE} />
              <DetailItem label="Filing Effective Date" value={formatFilingDate(filing.effectiveDate)} fallback={FMCSA_UNAVAILABLE} />
              <DetailItem label="Filing Cancellation Date" value={formatFilingDate(filing.cancellationDate)} fallback={FMCSA_UNAVAILABLE} />
              <DetailItem label="Expiration Date" value={formatFilingDate(filing.expirationDate)} fallback={FMCSA_UNAVAILABLE} />
            </div>
          </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-navy-400">{FMCSA_UNAVAILABLE}</p>
      )}
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
    <div>
      <p className="profile-label">Contact Numbers</p>
      {numbers.length ? (
        <div className="mt-2 space-y-2">
          {numbers.map((entry) => (
            <div key={`${entry.type}-${entry.digits}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2.5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-navy-400">{entry.label}</p>
                <p className="text-[15px] font-semibold text-white">{entry.number}</p>
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

function TagList({ items = [], emptyText = FMCSA_UNAVAILABLE }) {
  return (
    items.length ? (
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-full border border-sky-300/20 bg-sky-300/5 px-3 py-1 text-xs font-semibold text-sky-100/75">
            {item}
          </span>
        ))}
      </div>
    ) : (
      <p className="text-sm text-navy-400">{emptyText}</p>
    )
  );
}

function BusinessInformationCard({ carrier, onStatus }) {
  return (
    <ProfileCard title="Business Information">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
        <ContactNumbersSection numbers={carrier.contactNumbers} onStatus={onStatus} />
        <DetailItem label="Email" value={carrier.email} />
        <DetailItem label="Legal Business Name" value={carrier.legalName || carrier.name} fallback={FMCSA_UNAVAILABLE} />
        <DetailItem label="DBA Name" value={carrier.dbaName} fallback={FMCSA_UNAVAILABLE} />
        <DetailItem label="Physical Address" value={carrier.physicalAddress || carrier.address || [carrier.city, carrier.state, carrier.zip].filter(Boolean).join(", ")} fallback={FMCSA_UNAVAILABLE} />
        <DetailItem label="Mailing Address" value={carrier.mailingAddress} fallback={FMCSA_UNAVAILABLE} />
        <DetailItem label="DOT Number" value={carrier.dot} fallback={FMCSA_UNAVAILABLE} />
        <DetailItem label="DOT Status" value={carrier.dotStatusDisplay} fallback={FMCSA_UNAVAILABLE} />
        <DetailItem label="MC Number" value={formatMcNumber(carrier.mc)} fallback={FMCSA_UNAVAILABLE} />
        <DetailItem label="Carrier Operation" value={carrier.operationsDisplay} />
        <DetailItem label="Out-of-Service Status" value={carrier.outOfServiceStatusDisplay} />
        <DetailItem label="Out-of-Service Date" value={carrier.outOfServiceDate} />
      </div>
    </ProfileCard>
  );
}

function CompanyOfficialsCard({ carrier }) {
  return (
    <ProfileCard title="Company Officials">
      {carrier.companyOfficials.length ? (
        <div className="space-y-3">
          {carrier.companyOfficials.map((official) => (
            <div key={official.name} className="profile-card-muted">
              <p className="profile-value">{official.name}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-navy-400">None Shown</p>
      )}
    </ProfileCard>
  );
}

function BiennialUpdateCard({ carrier }) {
  const mileageYear = [
    carrier.mcs150Mileage,
    carrier.mcs150MileageYear ? `(${carrier.mcs150MileageYear})` : "",
  ].filter(Boolean).join(" ");
  return (
    <ProfileCard title="Biennial Update Information">
      <div className="grid grid-cols-1 gap-3">
        <DetailItem label="MCS-150 Form Date" value={formatDate(carrier.mcs150Date)} fallback={FMCSA_UNAVAILABLE} />
        <DetailItem label="MCS-150 Mileage (Year)" value={mileageYear} fallback={FMCSA_UNAVAILABLE} />
        <DetailItem label="Last Updated Date" value={formatDate(carrier.lastUpdated)} fallback={FMCSA_UNAVAILABLE} />
      </div>
    </ProfileCard>
  );
}

function CargoClassificationCard({ carrier }) {
  return (
    <ProfileCard title="Cargo Classification">
      <TagList items={formatCargoList(carrier.cargo)} />
    </ProfileCard>
  );
}

function VehiclesCard({ carrier }) {
  const { rows, totalPowerUnits } = carrier.vehicleBreakdown || {};
  return (
    <ProfileCard title="Vehicles">
      {rows?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-navy-400">
              <tr className="border-b border-white/[0.06]">
                {["Vehicle Type", "Owned", "Term Leased", "Trip Leased", "Total"].map((heading) => (
                  <th key={heading} className="text-left py-2 pr-3 font-semibold">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.type} className="border-b border-white/[0.04]">
                  <td className="py-2 pr-3 text-white font-semibold">{row.type}</td>
                  <td className="py-2 pr-3 text-navy-300">{valueOrUnavailable(row.owned, "")}</td>
                  <td className="py-2 pr-3 text-navy-300">{valueOrUnavailable(row.termLeased, "")}</td>
                  <td className="py-2 pr-3 text-navy-300">{valueOrUnavailable(row.tripLeased, "")}</td>
                  <td className="py-2 pr-3 text-white font-semibold">{valueOrUnavailable(row.total, "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <DetailItem label="Power Units" value={totalPowerUnits} fallback={FMCSA_UNAVAILABLE} />
      )}
    </ProfileCard>
  );
}

function DriversCard({ carrier }) {
  const { rows, totalDrivers } = carrier.driverBreakdown || {};
  return (
    <ProfileCard title="Drivers">
      {rows?.length > 1 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-navy-400">
              <tr className="border-b border-white/[0.06]">
                {["Driver Type", "Interstate", "Intrastate", "Total"].map((heading) => (
                  <th key={heading} className="text-left py-2 pr-3 font-semibold">{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.type} className="border-b border-white/[0.04]">
                  <td className="py-2 pr-3 text-white font-semibold">{row.type}</td>
                  <td className="py-2 pr-3 text-navy-300">{valueOrUnavailable(row.interstate, "")}</td>
                  <td className="py-2 pr-3 text-navy-300">{valueOrUnavailable(row.intrastate, "")}</td>
                  <td className="py-2 pr-3 text-white font-semibold">{valueOrUnavailable(row.total, "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <DetailItem label="Drivers" value={totalDrivers} fallback={FMCSA_UNAVAILABLE} />
      )}
    </ProfileCard>
  );
}

function OperatingAuthorityStatusCard({ carrier }) {
  const isNotAuthorized = /not authorized/i.test(carrier.operatingStatusDisplay);
  return (
    <ProfileCard title="Operating Authority Status">
      <DetailItem label="Operating Authority Status" value={carrier.operatingStatusDisplay} fallback={FMCSA_UNAVAILABLE} />
      {isNotAuthorized && (
        <p className="mt-3 text-xs leading-relaxed text-warning-100">
          *Please Note: NOT AUTHORIZED does not apply to Private or Intrastate operations.
        </p>
      )}
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
      setSaveStatus("AI draft assistance is available on Producer Pro.");
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
  const locationDisplay = [carrier.city, carrier.state].filter(Boolean).join(", ");
  const headerBadges = [
    ["DOT Status", carrier.dotStatusDisplay],
    ["Operating Authority Status", carrier.operatingStatusDisplay],
  ];

  return (
    <div className="carrier-profile-page min-w-0 space-y-6 animate-fade-in">
      <div className="flex items-center gap-2 text-sm">
        <button type="button" onClick={() => navigate(backTo)} className="text-sky-100/45 hover:text-white transition-colors">{backLabel}</button>
      </div>

      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">{carrier.name}</h1>
          {carrier.dbaName && <p className="mt-2 text-sm text-navy-400">DBA: {carrier.dbaName}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-sky-100/65">
            {carrier.dot && <span className="font-mono">DOT {carrier.dot}</span>}
            {carrier.mc && <><span className="text-sky-100/30">/</span><span className="font-mono">{formatMcNumber(carrier.mc)}</span></>}
          </div>
          {locationDisplay && <p className="mt-2 text-sm font-medium text-navy-300">{locationDisplay}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {headerBadges.map(([label, value]) => (
              <Badge key={label} variant={statusVariant(value)} className="normal-case">
                {label}: {value || displayUnavailable(true)}
              </Badge>
            ))}
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
          <BusinessInformationCard carrier={carrier} onStatus={setSaveStatus} />
          <CompanyOfficialsCard carrier={carrier} />
          <CargoClassificationCard carrier={carrier} />
          <VehiclesCard carrier={carrier} />
          <DriversCard carrier={carrier} />
          <InspectionHistoryCard carrier={carrier} />
        </div>

        <aside className="min-w-0 space-y-6">
          <InsuranceFilingCard carrier={carrier} />
          <OperatingAuthorityStatusCard carrier={carrier} />
          <BiennialUpdateCard carrier={carrier} />
          <SafetyRatingCard carrier={carrier} />
          <CrashHistoryCard crashes={carrier.crashSummary} />
        </aside>
      </div>

    </div>
  );
}
