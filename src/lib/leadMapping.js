import {
  collectContactNumbersFromAllSources,
  getContactNumberByType,
  getPrimaryContactNumber,
} from "@/lib/contactNumbers";

export const UNAVAILABLE = "Not available from public FMCSA data";
export const INSPECTION_UNAVAILABLE = "Inspection history not available from public FMCSA data.";

export function pick(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") || "";
}

export function splitCargo(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value || "")
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export const BASIC_CATEGORY_LABELS = {
  unsafeDriving: "Unsafe Driving",
  hoursOfService: "Hours-of-Service Compliance",
  driverFitness: "Driver Fitness",
  controlledSubstances: "Controlled Substances / Alcohol",
  vehicleMaintenance: "Vehicle Maintenance",
  hazmat: "Hazardous Materials Compliance",
  crashIndicator: "Crash Indicator",
};

export const BASIC_UNAVAILABLE_MESSAGE = "Unavailable from returned FMCSA data";
export const BASIC_TEMPORARILY_UNAVAILABLE = "SMS/BASIC data temporarily unavailable";

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === "object" && !Array.isArray(value)) || {};
}

function valueFrom(raw = {}, keys = []) {
  const source = safeObject(raw);
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") return source[key];
  }
  return null;
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  if (!text || /^(n\/a|na|not available|not public|not publicly available|unavailable)$/i.test(text)) return null;
  const parsed = Number(text.replace(/[%,$\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedRate(value) {
  const num = numberValue(value);
  if (num === null) return null;
  return Math.max(0, Math.min(100, num <= 1 ? num * 100 : num));
}

function percent(numerator, denominator) {
  const num = numberValue(numerator);
  const den = numberValue(denominator);
  if (num === null || den === null) return null;
  if (den === 0) return 0;
  return Math.max(0, Math.min(100, (num / den) * 100));
}

function categoryKey(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (/unsafe/.test(text)) return "unsafeDriving";
  if (/hours|service|hos/.test(text)) return "hoursOfService";
  if (/driver\s*fitness|fitness/.test(text)) return "driverFitness";
  if (/controlled|substance|alcohol/.test(text)) return "controlledSubstances";
  if (/vehicle|maintenance/.test(text)) return "vehicleMaintenance";
  if (/hazard|hazmat|hm/.test(text)) return "hazmat";
  if (/crash/.test(text)) return "crashIndicator";
  return text.replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase()).replace(/[^a-z0-9]/g, "");
}

function categoryLabel(value = "") {
  const key = categoryKey(value);
  return BASIC_CATEGORY_LABELS[key] || String(value || "").trim() || "BASIC";
}

export function normalizeInspectionSummary(raw = {}) {
  const source = safeObject(raw);
  const totalInspections = numberValue(valueFrom(source, ["totalInspections", "total_inspections", "total inspections", "total Inspections", "inspections", "totalInsp"]));
  const vehicleInspections = numberValue(valueFrom(source, ["vehicleInspections", "vehicleInspectionCount", "vehicle_inspections", "vehicle inspections"]));
  const driverInspections = numberValue(valueFrom(source, ["driverInspections", "driverInspectionCount", "driver_inspections", "driver inspections"]));
  const hazmatInspections = numberValue(valueFrom(source, ["hazmatInspections", "hazmatInspectionCount", "hazmat_inspections", "hazmat inspections"]));
  const vehicleOosCount = numberValue(valueFrom(source, ["vehicleOosCount", "vehicleOos", "vehicleOutOfService", "vehicle_oos", "vehicle OOS"]));
  const driverOosCount = numberValue(valueFrom(source, ["driverOosCount", "driverOos", "driverOutOfService", "driver_oos", "driver OOS"]));
  const hazmatOosCount = numberValue(valueFrom(source, ["hazmatOosCount", "hazmatOos", "hazmatOutOfService", "hazmat_oos", "hazmat OOS"]));
  const vehicleOosRate = normalizedRate(valueFrom(source, ["vehicleOosRate", "vehicleOosPercent", "vehicleOOSPercent", "vehicle_oos_rate"])) ?? percent(vehicleOosCount, vehicleInspections);
  const driverOosRate = normalizedRate(valueFrom(source, ["driverOosRate", "driverOosPercent", "driverOOSPercent", "driver_oos_rate"])) ?? percent(driverOosCount, driverInspections);
  const hazmatOosRate = normalizedRate(valueFrom(source, ["hazmatOosRate", "hazmatOosPercent", "hazmatOOSPercent", "hazmat_oos_rate"])) ?? percent(hazmatOosCount, hazmatInspections);
  const availableValues = [totalInspections, vehicleInspections, driverInspections, hazmatInspections, vehicleOosCount, driverOosCount, hazmatOosCount, vehicleOosRate, driverOosRate, hazmatOosRate];

  return {
    totalInspections,
    vehicleInspections,
    driverInspections,
    hazmatInspections,
    vehicleOosCount,
    driverOosCount,
    hazmatOosCount,
    vehicleOosRate,
    driverOosRate,
    hazmatOosRate,
    totalViolations: numberValue(valueFrom(source, ["totalViolations", "totalViolation", "total_violations"])),
    oosViolations: numberValue(valueFrom(source, ["oosViolations", "oosViolation", "oos_violations"])),
    nationalAverageVehicleOosRate: normalizedRate(valueFrom(source, ["nationalAverageVehicleOosRate", "nationalAvgVehicleOos"])),
    nationalAverageDriverOosRate: normalizedRate(valueFrom(source, ["nationalAverageDriverOosRate", "nationalAvgDriverOos"])),
    nationalAverageHazmatOosRate: normalizedRate(valueFrom(source, ["nationalAverageHazmatOosRate", "nationalAvgHazmatOos"])),
    sourceStatus: availableValues.some((value) => value !== null) ? "available" : source.sourceStatus || "unavailable"
  };
}

function normalizeBasicCategories(...sources) {
  const rows = [];
  sources.filter(Boolean).forEach((source) => {
    if (Array.isArray(source)) {
      source.forEach((item) => {
        rows.push({
          id: item.id || item.key || item.category || item.name || item.basicShortDesc || item.basicDesc,
          label: item.label || item.category || item.name || item.basicShortDesc || item.basicDesc,
          percentile: item.percentile ?? item.score ?? item.measure ?? item.value,
          measure: item.measure,
          threshold: item.threshold,
          alert: item.alert,
          inspections: item.inspections ?? item.inspectionCount ?? item.totalInspectionsWithViolations ?? item.totalInspectionWithViolation,
          violations: item.violations ?? item.violationCount ?? item.totalViolations ?? item.totalViolation,
          publicStatus: item.publicStatus,
          snapshotDate: item.snapshotDate ?? item.snapShotDate ?? item.csmsDate,
        });
      });
      return;
    }

    Object.entries(source).forEach(([key, value]) => {
      if (value && typeof value === "object") {
        rows.push({
          id: key,
          label: value.label || BASIC_CATEGORY_LABELS[key] || key,
          percentile: value.percentile ?? value.score ?? value.measure ?? value.value,
          measure: value.measure,
          threshold: value.threshold,
          alert: value.alert,
          inspections: value.inspections ?? value.inspectionCount,
          violations: value.violations ?? value.violationCount,
        });
      } else {
        rows.push({
          id: key,
          label: BASIC_CATEGORY_LABELS[key] || key,
          percentile: value,
        });
      }
    });
  });

  const seen = new Set();
  return rows
    .filter((row) => row.label || row.id)
    .filter((row) => {
      const key = row.id || row.label;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeBasicScores(raw = {}) {
  const source = safeObject(raw);
  const safety = safeObject(source.safety || source.safetyData || source.safety_data);
  const sms = safeObject(source.sms || source.smsSafety || source.raw?.smsSafety);
  const rows = normalizeBasicCategories(
    safety.basicScores,
    source.basicScores,
    source.basics,
    sms.basics,
    safety.basics,
    safety.basicCategories,
    source.basicCategories
  );
  const mappedScores = rows.map((row = {}) => {
    const category = categoryLabel(row.label || row.category || row.basicShortDesc || row.basicDesc || row.id);
    const rawValue = row.percentile ?? row.measure ?? row.score ?? row.value;
    const value = numberValue(rawValue);
    return {
      category,
      label: category,
      id: categoryKey(category),
      value,
      displayValue: value ?? 0,
      hasRealValue: value !== null,
      status: value !== null
        ? "available"
        : row.publicStatus === "not_public"
          ? "not_public"
          : row.publicStatus === "error"
            ? "error"
            : "not_returned",
      totalInspectionsWithViolations: numberValue(row.totalInspectionsWithViolations ?? row.totalInspectionWithViolation ?? row.inspections),
      totalViolations: numberValue(row.totalViolations ?? row.totalViolation ?? row.violations),
      inspections: numberValue(row.totalInspectionsWithViolations ?? row.totalInspectionWithViolation ?? row.inspections),
      violations: numberValue(row.totalViolations ?? row.totalViolation ?? row.violations),
      snapshotDate: row.snapshotDate ?? row.snapShotDate ?? row.csmsDate ?? null,
      publicStatus: row.publicStatus
    };
  });
  const seen = new Map();
  mappedScores.forEach((score) => {
    const key = score.id || score.category;
    const existing = seen.get(key);
    if (!existing || (!existing.hasRealValue && score.hasRealValue)) {
      seen.set(key, score);
    }
  });
  const scores = [...seen.values()];
  const snapshotDate = scores.find((score) => score.snapshotDate)?.snapshotDate || source.smsSnapshotDate || safety.smsSnapshotDate || null;
  const hasAnyRealScore = scores.some((score) => score.hasRealValue);
  const dataSource = source.dataSources?.basics || safety.dataSources?.basics || {};

  return {
    snapshotDate,
    scores,
    hasAnyRealScore,
    sourceStatus: hasAnyRealScore
      ? "available"
      : dataSource.attempted && dataSource.success === false
        ? "error"
        : scores.length
          ? "not_found"
          : "unavailable"
  };
}

export function normalizeLeadRecord(raw = {}, type = "new_dot") {
  raw = safeObject(raw);
  const insurance = raw.insurance || {};
  const publicLiability = raw.insuranceFilings?.publicLiability || raw.licensingInsurance || {};
  const safety = safeObject(raw.safety || raw.safetyData || raw.safety_data);
  const smsSafety = safeObject(raw.smsSafety || raw.raw?.smsSafety);
  const inspectionSummary = normalizeInspectionSummary(firstObject(raw.inspectionSummary, safety.inspectionSummary, raw.inspection_summary));
  const basicSummary = normalizeBasicScores(raw);
  const dotNumber = pick(raw.dotNumber, raw.dot_number, raw.usdot, raw.usdotNumber, raw.dot);
  const carrierName = pick(raw.carrierName, raw.legalName, raw.legal_name, raw.carrier_name, raw.name, "Unknown carrier");
  const contactNumbers = collectContactNumbersFromAllSources({
    leadSearchResult: raw,
    carrierProfile: raw.profile,
    motusRecord: raw.motusProfile || raw.motusRecord || raw.raw?.motusProfile || raw.raw?.motusRegister,
    fmcsaRecord: raw.fmcsaRecord || raw.qcmobileDetails || raw.raw?.liveCarrier || raw.raw?.qcmobileDetails,
    saferRecord: raw.saferData || raw.raw?.saferData,
    dataTransportRecord: raw.census || raw.raw?.census,
    cachedDatabaseRecord: raw.cachedDatabaseRecord || raw.databaseRecord,
    enrichmentRecord: raw.enrichmentRecord || raw,
  });
  const primaryContact = getPrimaryContactNumber(contactNumbers);
  const faxContact = getContactNumberByType(contactNumbers, "fax");
  const insuranceCancelDate = pick(
    raw.insuranceCancelDate,
    raw.insuranceCancellationDate,
    raw.insuranceCancellationEffectiveDate,
    raw.fmcsaInsuranceCancellationDate,
    raw.insurance_expiration,
    raw.insuranceExpiration,
    raw.insuranceExpirationDate,
    insurance.cancelDate,
    insurance.cancellationDate,
    insurance.cancellationEffectiveDate,
    publicLiability.cancelDate,
    publicLiability.cancellationDate,
    publicLiability.insuranceExpirationDate
  );

  return {
    id: pick(raw.id, dotNumber, `${carrierName}-${primaryContact?.digits || raw.phone || raw.phoneNumber || ""}`),
    type,
    dotNumber,
    dot: dotNumber,
    carrierName,
    name: carrierName,
    mcNumber: pick(raw.mcNumber, raw.mc_number, raw.docketNumber, raw.mc),
    state: pick(raw.state, raw.physicalState, raw.hq_state, raw.phy_state),
    city: pick(raw.city, raw.physicalCity, raw.hq_city, raw.phy_city),
    address: pick(raw.physicalAddress, raw.address, raw.hq_address),
    phone: primaryContact?.number || "",
    phoneNumber: primaryContact?.number || "",
    fax: faxContact?.number || "",
    contactNumbers,
    email: pick(raw.email, raw.emailAddress, raw.carrierEmail, raw.contactEmail, raw.businessEmail, raw.raw?.contact?.email, raw.raw?.emailAddress),
    powerUnits: pick(raw.powerUnits, raw.power_units, raw.fleetSize, raw.vehicle_count, raw.vehicleCount),
    drivers: pick(raw.drivers, raw.driverCount, raw.driver_count),
    cargoHauled: splitCargo(pick(raw.cargoHauled, raw.cargo_hauled, raw.cargo, raw.cargoCarried, raw.cargoTypes)),
    mcs150Date: pick(raw.mcs150Date, raw.mcs_150_date, raw.mcs150_date),
    addedDate: pick(raw.addedDate, raw.newDotDate, raw.registrationDate, raw.firstSeenDate, raw.addDate, raw.add_date, raw.dateCreated, raw.newLeadSince),
    authorityStatus: pick(raw.authorityStatus, raw.authority_status, publicLiability.authorityStatus, raw.operatingStatus, raw.operating_status),
    safetyRating: pick(raw.safetyRating, raw.safety_rating, safety.safetyRating, "Not rated"),
    insuranceFilingStatus: pick(raw.insuranceFilingStatus, raw.insurance_filing_status, raw.insuranceType, insurance.status, publicLiability.insuranceFilingStatus, publicLiability.status),
    insuranceEffectiveDate: pick(raw.insuranceEffectiveDate, raw.insurance_effective_date, raw.fmcsaInsuranceEffectiveDate, insurance.effectiveDate, publicLiability.insuranceEffectiveDate, publicLiability.effectiveDate),
    insuranceExpirationDate: pick(raw.insuranceExpirationDate, raw.insuranceExpiration, raw.insurance_expiration),
    insuranceCancelDate,
    insuranceCompany: pick(raw.insuranceCompany, raw.insurance_company, insurance.company, publicLiability.insuranceCompany, publicLiability.company),
    insurancePolicyNumber: pick(raw.insurancePolicyNumber, raw.insurance_policy_number, raw.policyNumber, insurance.policyNumber, publicLiability.policyNumber),
    filingType: pick(raw.filingType, raw.insuranceFormCode, raw.insurance_form_code, raw.insuranceType, insurance.filingType, publicLiability.filingType, publicLiability.coverageInfo),
    leadType: pick(raw.leadType, raw.lead_type),
    confidence: pick(raw.confidence, raw.insuranceConfidence),
    verificationStatus: pick(raw.verificationStatus, raw.insuranceVerificationStatus),
    sourceName: pick(raw.sourceName, raw.insuranceSource, raw.source),
    lastVerifiedAt: pick(raw.lastVerifiedAt, raw.last_verified_at),
    insuranceIntelligenceNote: pick(raw.insuranceIntelligenceNote),
    estimatedRenewalStart: pick(raw.estimatedRenewalStart, raw.estimated_renewal_start),
    estimatedRenewalEnd: pick(raw.estimatedRenewalEnd, raw.estimated_renewal_end),
    estimatedRenewalBasis: pick(raw.estimatedRenewalBasis, raw.estimated_renewal_basis),
    estimatedRenewalConfidence: pick(raw.estimatedRenewalConfidence, raw.estimated_renewal_confidence),
    estimatedRenewalNote: pick(raw.estimatedRenewalNote, raw.estimated_renewal_note),
    agencyXDate: pick(raw.agencyXDate, raw.xDate),
    crmRenewalDate: pick(raw.crmRenewalDate),
    estimatedRenewalDate: pick(raw.estimatedRenewalDate, raw.estimatedRenewalOpportunity),
    renewalDateSource: pick(raw.renewalDateSource, raw.dateSource),
    totalInspections: pick(raw.totalInspections, inspectionSummary.totalInspections, safety.totalInspections, smsSafety.inspections),
    vehicleInspections: pick(raw.vehicleInspections, inspectionSummary.vehicleInspections, safety.vehicleInspections, smsSafety.vehicleInspections),
    driverInspections: pick(raw.driverInspections, inspectionSummary.driverInspections, safety.driverInspections, smsSafety.driverInspections),
    hazmatInspections: pick(raw.hazmatInspections, inspectionSummary.hazmatInspections, safety.hazmatInspections, smsSafety.hazmatInspections),
    inspectionsWithViolations: pick(raw.inspectionsWithViolations, safety.inspectionsWithViolations),
    inspectionsWithoutViolations: pick(raw.inspectionsWithoutViolations, safety.inspectionsWithoutViolations),
    totalViolations: pick(raw.totalViolations, inspectionSummary.totalViolations, safety.totalViolations),
    oosViolations: pick(raw.oosViolations, inspectionSummary.oosViolations, safety.oosViolations),
    vehicleOos: pick(raw.vehicleOos, inspectionSummary.vehicleOosCount, safety.vehicleOos, smsSafety.vehicleOos),
    driverOos: pick(raw.driverOos, inspectionSummary.driverOosCount, safety.driverOos, smsSafety.driverOos),
    hazmatOos: pick(raw.hazmatOos, inspectionSummary.hazmatOosCount, safety.hazmatOos, smsSafety.hazmatOos),
    driverOosRate: pick(raw.driverOosRate, inspectionSummary.driverOosRate, raw.oosRates?.driver?.carrier, raw.oosRates?.driver, safety.driverOosRate, safety.oosRates?.driver?.carrier, safety.oosRates?.driver, smsSafety.oosRates?.driver?.carrier, smsSafety.oosRates?.driver),
    vehicleOosRate: pick(raw.vehicleOosRate, inspectionSummary.vehicleOosRate, raw.oosRates?.vehicle?.carrier, raw.oosRates?.vehicle, safety.vehicleOosRate, safety.oosRates?.vehicle?.carrier, safety.oosRates?.vehicle, smsSafety.oosRates?.vehicle?.carrier, smsSafety.oosRates?.vehicle),
    hazmatOosRate: pick(raw.hazmatOosRate, inspectionSummary.hazmatOosRate, raw.oosRates?.hazmat?.carrier, raw.oosRates?.hazmat, safety.hazmatOosRate, safety.oosRates?.hazmat?.carrier, safety.oosRates?.hazmat, smsSafety.oosRates?.hazmat?.carrier, smsSafety.oosRates?.hazmat),
    nationalAverageVehicleOosRate: pick(raw.nationalAverageVehicleOosRate, inspectionSummary.nationalAverageVehicleOosRate, safety.oosRates?.vehicle?.nationalAverage, smsSafety.oosRates?.vehicle?.nationalAverage),
    nationalAverageDriverOosRate: pick(raw.nationalAverageDriverOosRate, inspectionSummary.nationalAverageDriverOosRate, safety.oosRates?.driver?.nationalAverage, smsSafety.oosRates?.driver?.nationalAverage),
    nationalAverageHazmatOosRate: pick(raw.nationalAverageHazmatOosRate, inspectionSummary.nationalAverageHazmatOosRate, safety.oosRates?.hazmat?.nationalAverage, smsSafety.oosRates?.hazmat?.nationalAverage),
    crashCount: pick(raw.crashCount, raw.crashTotal, safety.crashTotal),
    smsSnapshotDate: pick(basicSummary.snapshotDate, raw.smsSnapshotDate, safety.smsSnapshotDate, smsSafety.smsSnapshotDate),
    basicScores: basicSummary.scores,
    basicCategories: basicSummary.scores,
    basicSummary,
    smsProfileAvailable: Boolean(raw.smsProfileAvailable || safety.smsProfileAvailable || smsSafety.source),
    safetySource: pick(raw.safetySource, safety.source, smsSafety.source),
    inspectionHistory: raw.inspectionHistory || safety.inspectionHistory || raw.inspections || [],
    inspectionSummary,
    raw,
  };
}

export function getRenewalDisplay(lead = {}) {
  if (lead.agencyXDate) return { label: "Agency X-Date", date: lead.agencyXDate };
  if (lead.crmRenewalDate) return { label: "CRM Renewal Date", date: lead.crmRenewalDate };
  if (lead.estimatedRenewalStart || lead.estimatedRenewalEnd) {
    return {
      label: "Estimated Renewal Window",
      date: [lead.estimatedRenewalStart, lead.estimatedRenewalEnd].filter(Boolean).join(" to ")
    };
  }
  if (lead.insuranceCancelDate) return { label: "FMCSA Filing Cancellation Date", date: lead.insuranceCancelDate };
  if (lead.insuranceEffectiveDate) return { label: "FMCSA Filing Effective Date", date: lead.insuranceEffectiveDate };
  if (lead.estimatedRenewalDate) return { label: "Estimated Renewal Opportunity", date: lead.estimatedRenewalDate };
  return { label: UNAVAILABLE, date: null };
}

export function buildInspectionBars(lead = {}) {
  lead = safeObject(lead);
  const inspectionSummary = normalizeInspectionSummary(firstObject(lead.inspectionSummary, lead));
  const totalInspections = inspectionSummary.totalInspections ?? numberValue(lead.totalInspections);
  const totalViolations = inspectionSummary.totalViolations ?? numberValue(lead.totalViolations);
  const bars = [
    {
      label: "Inspections with Violations",
      value: percent(lead.inspectionsWithViolations, totalInspections),
    },
    {
      label: "Inspections without Violations",
      value: percent(lead.inspectionsWithoutViolations, totalInspections),
    },
    {
      label: "OOS Violation",
      value: percent(lead.oosViolations, totalViolations),
    },
    {
      label: "Driver OOS",
      value: inspectionSummary.driverOosRate,
      nationalAverage: inspectionSummary.nationalAverageDriverOosRate,
    },
    {
      label: "Vehicle OOS",
      value: inspectionSummary.vehicleOosRate,
      nationalAverage: inspectionSummary.nationalAverageVehicleOosRate,
    },
    {
      label: "Hazmat OOS",
      value: inspectionSummary.hazmatOosRate,
      nationalAverage: inspectionSummary.nationalAverageHazmatOosRate,
    },
  ].filter((bar) => bar.value !== null);

  return { totalInspections, bars, inspectionSummary };
}
