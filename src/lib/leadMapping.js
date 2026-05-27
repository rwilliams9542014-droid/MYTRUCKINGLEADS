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

function normalizeBasicCategories(...sources) {
  const rows = [];
  sources.filter(Boolean).forEach((source) => {
    if (Array.isArray(source)) {
      source.forEach((item) => {
        rows.push({
          id: item.id || item.key || item.category || item.name,
          label: item.label || item.category || item.name,
          percentile: item.percentile ?? item.score ?? item.measure ?? item.value,
          measure: item.measure,
          threshold: item.threshold,
          alert: item.alert,
          inspections: item.inspections ?? item.inspectionCount,
          violations: item.violations ?? item.violationCount,
          publicStatus: item.publicStatus,
          snapshotDate: item.snapshotDate ?? item.snapShotDate,
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

export function normalizeLeadRecord(raw = {}, type = "new_dot") {
  const insurance = raw.insurance || {};
  const publicLiability = raw.insuranceFilings?.publicLiability || raw.licensingInsurance || {};
  const safety = raw.safety || raw.safetyData || raw.safety_data || {};
  const smsSafety = raw.smsSafety || raw.raw?.smsSafety || {};
  const inspectionSummary = raw.inspectionSummary || safety.inspectionSummary || {};
  const dotNumber = pick(raw.dotNumber, raw.dot_number, raw.usdot, raw.usdotNumber, raw.dot);
  const carrierName = pick(raw.carrierName, raw.legalName, raw.legal_name, raw.carrier_name, raw.name, "Unknown carrier");
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
    id: pick(raw.id, dotNumber, `${carrierName}-${raw.phone || raw.phoneNumber || ""}`),
    type,
    dotNumber,
    dot: dotNumber,
    carrierName,
    name: carrierName,
    mcNumber: pick(raw.mcNumber, raw.mc_number, raw.docketNumber, raw.mc),
    state: pick(raw.state, raw.hq_state, raw.phy_state),
    city: pick(raw.city, raw.hq_city, raw.phy_city),
    phone: pick(raw.phone, raw.phoneNumber, raw.cell_phone, raw.cellPhone),
    email: pick(raw.email, raw.emailAddress),
    powerUnits: pick(raw.powerUnits, raw.power_units, raw.fleetSize, raw.vehicle_count, raw.vehicleCount),
    drivers: pick(raw.drivers, raw.driverCount, raw.driver_count),
    cargoHauled: splitCargo(pick(raw.cargoHauled, raw.cargo_hauled, raw.cargo, raw.cargoCarried, raw.cargoTypes)),
    mcs150Date: pick(raw.mcs150Date, raw.mcs_150_date, raw.mcs150_date),
    addedDate: pick(raw.addedDate, raw.firstSeenDate, raw.addDate, raw.add_date, raw.dateCreated, raw.newLeadSince),
    authorityStatus: pick(raw.authorityStatus, raw.authority_status, publicLiability.authorityStatus, raw.operatingStatus, raw.operating_status),
    safetyRating: pick(raw.safetyRating, raw.safety_rating, safety.safetyRating, "Not rated"),
    insuranceFilingStatus: pick(raw.insuranceFilingStatus, raw.insurance_filing_status, raw.insuranceType, insurance.status, publicLiability.insuranceFilingStatus, publicLiability.status),
    insuranceEffectiveDate: pick(raw.insuranceEffectiveDate, raw.insurance_effective_date, raw.fmcsaInsuranceEffectiveDate, insurance.effectiveDate, publicLiability.insuranceEffectiveDate, publicLiability.effectiveDate),
    insuranceCancelDate,
    insuranceCompany: pick(raw.insuranceCompany, raw.insurance_company, insurance.company, publicLiability.insuranceCompany, publicLiability.company),
    filingType: pick(raw.filingType, raw.insuranceFormCode, raw.insurance_form_code, raw.insuranceType, insurance.filingType, publicLiability.filingType, publicLiability.coverageInfo),
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
    smsSnapshotDate: pick(raw.smsSnapshotDate, safety.smsSnapshotDate, smsSafety.smsSnapshotDate),
    basicScores: raw.basicScores || safety.basicScores || [],
    basicCategories: normalizeBasicCategories(
      raw.basicCategories,
      raw.basic_scores,
      safety.basicCategories,
      safety.basicScores,
      safety.categories,
      smsSafety.basics
    ),
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
  if (lead.insuranceCancelDate) return { label: "FMCSA Filing Cancellation Date", date: lead.insuranceCancelDate };
  if (lead.insuranceEffectiveDate) return { label: "FMCSA Filing Effective Date", date: lead.insuranceEffectiveDate };
  if (lead.estimatedRenewalDate) return { label: "Estimated Renewal Opportunity", date: lead.estimatedRenewalDate };
  return { label: UNAVAILABLE, date: null };
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function percent(numerator, denominator) {
  const num = numberValue(numerator);
  const den = numberValue(denominator);
  if (num === null || den === null || den <= 0) return null;
  return Math.max(0, Math.min(100, (num / den) * 100));
}

function normalizedRate(value) {
  const num = numberValue(value);
  if (num === null) return null;
  return Math.max(0, Math.min(100, num <= 1 ? num * 100 : num));
}

export function buildInspectionBars(lead = {}) {
  const totalInspections = numberValue(lead.totalInspections);
  const totalViolations = numberValue(lead.totalViolations);
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
      value: normalizedRate(lead.driverOosRate),
      nationalAverage: normalizedRate(lead.nationalAverageDriverOosRate),
    },
    {
      label: "Vehicle OOS",
      value: normalizedRate(lead.vehicleOosRate),
      nationalAverage: normalizedRate(lead.nationalAverageVehicleOosRate),
    },
    {
      label: "Hazmat OOS",
      value: normalizedRate(lead.hazmatOosRate),
      nationalAverage: normalizedRate(lead.nationalAverageHazmatOosRate),
    },
  ].filter((bar) => bar.value !== null);

  return { totalInspections, bars };
}
