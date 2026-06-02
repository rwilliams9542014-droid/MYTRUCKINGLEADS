import Carrier from "../models/Carrier.js";
import { isMongoConnected } from "../config/mongo.js";
import { query as dbQuery } from "../config/db.js";
import {
  FMCSA_TRANSITION_NOTICE,
  MOTUS_PORTAL_URL,
  fetchCarrierByDotOrMc,
  searchCarrierCandidatesByName
} from "../services/fmcsaService.js";
import {
  enrichCarrierByDot,
  hasCargoData as hasEnrichedCargoData,
  mapLiveCarrierToMongoSet
} from "../services/carrierFullEnrichmentService.js";
import {
  TRIAL_LIMIT_MESSAGE,
  getTrialUsage,
  incrementTrialUsage,
  maskTrialCarrierContacts
} from "../utils/trialAccess.js";

const PUBLIC_CONTACT_LOCK_MESSAGE = "Create an account to reveal carrier phone and email.";
const LIVE_FMCSA_FALLBACK_MESSAGE = "Live FMCSA request failed. Showing saved carrier data where available.";
const SAVED_PROFILE_REFRESH_MESSAGE = "Saved carrier profile loaded. Live FMCSA request failed.";

function clean(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const stringValue = String(value).trim();
  return stringValue || fallback;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? "";
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? clean(value) : date.toISOString().slice(0, 10);
}

function formatCompactDate(value) {
  const text = clean(value);
  const match = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return formatDate(text);
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function formatUsDate(value) {
  const text = clean(value);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return formatDate(text);
  const [, month, day, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function normalizeDot(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const normalized = String(Number(digits));
  return normalized === "0" ? "" : normalized;
}

function normalizeMc(value) {
  return clean(value).toUpperCase().replace(/^(MC|MX|FF)\s*-?\s*/, "");
}

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCarrierSearchInput(query = {}) {
  const explicitDot = normalizeDot(query.dot);
  const explicitMc = normalizeMc(query.mc);
  const explicitName = clean(query.name);
  const freeText = clean(query.query || query.q);
  const requestedLimit = Number(query.limit);
  const dotMatch = freeText.match(/^(?:DOT|USDOT)?\s*-?\s*(\d{1,8})$/i);
  const mcMatch = freeText.match(/^(?:MC|MX|FF)\s*-?\s*([A-Z0-9-]{1,20})$/i);
  const parsedDot = normalizeDot(dotMatch?.[1]);
  const parsedMc = normalizeMc(mcMatch?.[1]);
  const freeTextNameLookup = Boolean(freeText && !parsedDot && !parsedMc);

  const dot = explicitDot || parsedDot;
  const mc = explicitMc || parsedMc;
  const name = explicitName || (!dot && !mc ? freeText : "");
  const queryText = clean(
    explicitDot ? `DOT ${explicitDot}` :
      explicitMc ? `MC ${explicitMc}` :
        explicitName || freeText
  );

  return {
    dot,
    mc,
    name,
    queryText,
    preferLiveLookup: Boolean(explicitDot || explicitMc || explicitName || parsedDot || parsedMc || freeTextNameLookup || (!Number.isNaN(requestedLimit) && requestedLimit === 1 && name))
  };
}

function hasContactFields(profile = {}) {
  const contact = profile.contactInfo || {};
  return Boolean(
    clean(profile.phoneNumber) ||
    clean(profile.cellPhone) ||
    clean(profile.email) ||
    clean(contact.phone) ||
    clean(contact.cellPhone) ||
    clean(contact.email)
  );
}

function authorityAge(value) {
  const formatted = formatCompactDate(value);
  if (!formatted) return "";
  const date = new Date(`${formatted}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  let months = (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth();
  if (now.getDate() < date.getDate()) months -= 1;
  if (months < 0) return "";
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years <= 0) return `${remainingMonths || 1} month${remainingMonths === 1 ? "" : "s"}`;
  return `${years} year${years === 1 ? "" : "s"}${remainingMonths ? `, ${remainingMonths} month${remainingMonths === 1 ? "" : "s"}` : ""}`;
}

function yesNo(value) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = clean(value).toUpperCase();
  if (!text) return "";
  if (["Y", "YES", "TRUE", "1"].includes(text)) return "Yes";
  if (["N", "NO", "FALSE", "0"].includes(text)) return "No";
  return clean(value);
}

function sourceStatusFromCarrier(carrier = {}, qcmobileDetails = {}, insuranceSnapshot = null) {
  const status = carrier.dataSourceStatus || carrier.raw?.liveCarrier?.dataSourceStatus || {};
  return {
    carrierSnapshot: status.carrierSnapshot || {
      attempted: true,
      success: Boolean(carrier.dotNumber || carrier.dot || carrier.legalName || carrier.carrierName),
      recordCount: carrier.dotNumber || carrier.dot || carrier.legalName || carrier.carrierName ? 1 : 0
    },
    basics: status.basics || qcmobileDetails?.dataSources?.basics || {
      attempted: Boolean(qcmobileDetails),
      success: Boolean(qcmobileDetails?.basics?.categories?.length),
      recordCount: qcmobileDetails?.basics?.categories?.length || 0,
      rawKeysFound: qcmobileDetails?.basics?.rawKeysFound || []
    },
    oos: status.oos || qcmobileDetails?.dataSources?.oos || {
      attempted: Boolean(qcmobileDetails),
      success: Boolean(qcmobileDetails?.oos && Object.values(qcmobileDetails.oos).some(Boolean)),
      rawKeysFound: qcmobileDetails?.oos?.rawKeysFound || []
    },
    authority: status.authority || qcmobileDetails?.dataSources?.authority || {
      attempted: Boolean(qcmobileDetails),
      success: Boolean(qcmobileDetails?.authority && Object.values(qcmobileDetails.authority).some(Boolean))
    },
    cargoCarried: status.cargoCarried || qcmobileDetails?.dataSources?.cargoCarried || {
      attempted: Boolean(qcmobileDetails),
      success: Boolean(qcmobileDetails?.cargo?.cargoTypes?.length),
      recordCount: qcmobileDetails?.cargo?.cargoTypes?.length || 0
    },
    operationClassification: status.operationClassification || qcmobileDetails?.dataSources?.operationClassification || {
      attempted: Boolean(qcmobileDetails),
      success: Boolean(qcmobileDetails?.operationClassification?.operationClassification?.length),
      recordCount: qcmobileDetails?.operationClassification?.operationClassification?.length || 0
    },
    docketNumbers: status.docketNumbers || qcmobileDetails?.dataSources?.docketNumbers || {
      attempted: Boolean(qcmobileDetails),
      success: Boolean(qcmobileDetails?.docketNumbers?.docketNumbers?.length),
      recordCount: qcmobileDetails?.docketNumbers?.docketNumbers?.length || 0
    },
    insurance: {
      attempted: true,
      success: Boolean(insuranceSnapshot || carrier.licensingInsurance || carrier.insuranceCompany || carrier.bmcFilings?.length),
      recordCount: Array.isArray(insuranceSnapshot?.bmcFilings)
        ? insuranceSnapshot.bmcFilings.length
        : Array.isArray(carrier.bmcFilings)
          ? carrier.bmcFilings.length
          : insuranceSnapshot || carrier.insuranceCompany ? 1 : 0
    }
  };
}

function liveFmcsaStatusFromCarrier(carrier = {}, dataSourceStatus = {}, fallback = {}) {
  const existing = carrier.liveFmcsaStatus || carrier.raw?.liveCarrier?.liveFmcsaStatus || fallback.liveFmcsaStatus;
  if (existing) return existing;

  const endpointFailures = Object.entries(dataSourceStatus || {})
    .filter(([, status]) => status?.reason || status?.error || status?.errorType)
    .map(([endpoint, status]) => ({
      endpoint,
      urlPath: status.urlPath || "",
      status: status.status ?? null,
      reason: status.reason || status.error || "FMCSA endpoint failed",
      errorType: status.errorType || "request_failed",
      responseBodySnippet: status.responseBodySnippet
    }));

  const attempted = Object.values(dataSourceStatus || {}).some(status => status?.attempted);
  return {
    attempted,
    success: attempted && endpointFailures.length === 0,
    reason: endpointFailures[0]?.reason || clean(fallback.reason),
    endpointFailures
  };
}

function liveFmcsaFailureFromError(err) {
  if (err?.fmcsaStatus) {
    return {
      attempted: err.fmcsaStatus.attempted !== false,
      success: false,
      reason: err.fmcsaStatus.reason || err.message,
      endpointFailures: [{
        endpoint: "carrierSnapshot",
        urlPath: err.fmcsaStatus.urlPath || "",
        status: err.fmcsaStatus.status ?? null,
        reason: err.fmcsaStatus.reason || err.message,
        errorType: err.fmcsaStatus.errorType || "request_failed",
        responseBodySnippet: err.fmcsaStatus.responseBodySnippet
      }]
    };
  }

  return {
    attempted: true,
    success: false,
    reason: clean(err?.message, "Live FMCSA request failed"),
    endpointFailures: [{
      endpoint: "carrierProfile",
      urlPath: "",
      status: err?.response?.status ?? null,
      reason: clean(err?.message, "Live FMCSA request failed"),
      errorType: "request_failed"
    }]
  };
}

function normalizeBasicScores(qcmobileBasicCategories = [], smsSafety = {}, dataSource = {}) {
  const returned = Array.isArray(qcmobileBasicCategories) ? qcmobileBasicCategories : [];
  const byId = new Map();
  returned.forEach((item = {}) => {
    const id = clean(item.id || item.shortName);
    if (!id) return;
    byId.set(id, {
      category: clean(item.category || item.label),
      shortName: id,
      percentile: numberOrNull(firstValue(item.percentile, item.value, item.score)),
      measure: numberOrNull(item.measure),
      snapshotDate: formatDate(firstValue(item.snapshotDate, item.snapShotDate, item.smsSnapshotDate, item.csmsDate)),
      totalInspectionsWithViolations: numberOrNull(firstValue(item.totalInspectionsWithViolations, item.totalInspectionWithViolation, item.inspections)),
      totalViolations: numberOrNull(firstValue(item.totalViolations, item.totalViolation, item.violations)),
      deficientFlags: {
        rdDeficient: firstValue(item.deficientFlags?.rdDeficient, item.rdDeficient),
        rdsvDeficient: firstValue(item.deficientFlags?.rdsvDeficient, item.rdsvDeficient),
        svDeficient: firstValue(item.deficientFlags?.svDeficient, item.svDeficient)
      },
      publicStatus: clean(item.publicStatus, "available")
    });
  });

  const labels = {
    unsafeDriving: "Unsafe Driving",
    hoursOfService: "Hours-of-Service Compliance",
    driverFitness: "Driver Fitness",
    controlledSubstances: "Controlled Substances / Alcohol",
    vehicleMaintenance: "Vehicle Maintenance",
    hazmat: "Hazardous Materials Compliance",
    crashIndicator: "Crash Indicator"
  };

  const basicsAttempted = dataSource?.attempted !== false;
  const basicsSucceeded = Boolean(returned.length || dataSource?.success);
  return Object.entries(labels).map(([id, label]) => {
    if (byId.has(id)) return byId.get(id);
    const fallbackValue = smsSafety?.basics?.[id];
    if (fallbackValue !== undefined && fallbackValue !== null && fallbackValue !== "") {
      return {
        category: label,
        shortName: id,
        percentile: numberOrNull(fallbackValue),
        measure: null,
        snapshotDate: formatDate(smsSafety?.smsSnapshotDate),
        totalInspectionsWithViolations: null,
        totalViolations: null,
        deficientFlags: {},
        publicStatus: "available"
      };
    }
    return {
      category: label,
      shortName: id,
      percentile: null,
      measure: null,
      snapshotDate: "",
      totalInspectionsWithViolations: null,
      totalViolations: null,
      deficientFlags: {},
      publicStatus: !basicsAttempted || !basicsSucceeded
        ? "unavailable"
        : ["hazmat", "crashIndicator"].includes(id)
          ? "not_public"
          : "unavailable"
    };
  });
}

function rateOrCalculated(rate, count, denominator) {
  const explicit = numberOrNull(rate);
  if (explicit !== null) return explicit;
  const countNumber = numberOrNull(count);
  const denominatorNumber = numberOrNull(denominator);
  if (countNumber === null || denominatorNumber === null || denominatorNumber <= 0) return null;
  return Math.round((countNumber / denominatorNumber) * 1000) / 10;
}

function normalizeInspectionSummary({ qcmobileOos = {}, smsSafety = {}, saferData = {}, carrier = {} }) {
  qcmobileOos = qcmobileOos && typeof qcmobileOos === "object" ? qcmobileOos : {};
  smsSafety = smsSafety && typeof smsSafety === "object" ? smsSafety : {};
  saferData = saferData && typeof saferData === "object" ? saferData : {};
  carrier = carrier && typeof carrier === "object" ? carrier : {};

  const totalInspections = numberOrNull(firstValue(qcmobileOos.totalInspections, saferData.totalInspections, smsSafety.inspections, carrier.totalInspections));
  const vehicleInspections = numberOrNull(firstValue(qcmobileOos.vehicleInspections, saferData.vehicleInspections, smsSafety.vehicleInspections, carrier.vehicleInspections));
  const driverInspections = numberOrNull(firstValue(qcmobileOos.driverInspections, saferData.driverInspections, smsSafety.driverInspections, carrier.driverInspections));
  const hazmatInspections = numberOrNull(firstValue(qcmobileOos.hazmatInspections, saferData.hazmatInspections, smsSafety.hazmatInspections, carrier.hazmatInspections));
  const vehicleOosCount = numberOrNull(firstValue(qcmobileOos.vehicleOos, saferData.vehicleOos, smsSafety.vehicleOos, carrier.vehicleOos));
  const driverOosCount = numberOrNull(firstValue(qcmobileOos.driverOos, saferData.driverOos, smsSafety.driverOos, carrier.driverOos));
  const hazmatOosCount = numberOrNull(firstValue(qcmobileOos.hazmatOos, saferData.hazmatOos, smsSafety.hazmatOos, carrier.hazmatOos));

  return {
    totalInspections,
    vehicleInspections,
    driverInspections,
    hazmatInspections,
    vehicleOosCount,
    driverOosCount,
    hazmatOosCount,
    vehicleOosRate: rateOrCalculated(firstValue(qcmobileOos.vehicleOosRate, saferData.vehicleOosRate, smsSafety.oosRates?.vehicle?.carrier, smsSafety.oosRates?.vehicle), vehicleOosCount, vehicleInspections),
    driverOosRate: rateOrCalculated(firstValue(qcmobileOos.driverOosRate, saferData.driverOosRate, smsSafety.oosRates?.driver?.carrier, smsSafety.oosRates?.driver), driverOosCount, driverInspections),
    hazmatOosRate: rateOrCalculated(firstValue(qcmobileOos.hazmatOosRate, saferData.hazmatOosRate, smsSafety.oosRates?.hazmat?.carrier, smsSafety.oosRates?.hazmat), hazmatOosCount, hazmatInspections),
    totalViolations: numberOrNull(firstValue(qcmobileOos.totalViolations, smsSafety.totalViolations, carrier.totalViolations)),
    oosViolations: numberOrNull(firstValue(qcmobileOos.oosViolations, smsSafety.oosViolations, carrier.oosViolations)),
    nationalAverageVehicleOosRate: numberOrNull(firstValue(qcmobileOos.nationalAverageVehicleOosRate, saferData.nationalAverageVehicleOosRate, smsSafety.oosRates?.vehicle?.nationalAverage)),
    nationalAverageDriverOosRate: numberOrNull(firstValue(qcmobileOos.nationalAverageDriverOosRate, saferData.nationalAverageDriverOosRate, smsSafety.oosRates?.driver?.nationalAverage)),
    nationalAverageHazmatOosRate: numberOrNull(firstValue(qcmobileOos.nationalAverageHazmatOosRate, saferData.nationalAverageHazmatOosRate, smsSafety.oosRates?.hazmat?.nationalAverage)),
    source: qcmobileOos.source || smsSafety.source || saferData.source || "FMCSA public safety data"
  };
}

function officialLinks(dotNumber, { includeSms = false } = {}) {
  const dot = encodeURIComponent(dotNumber);
  if (!dotNumber) return {};
  const links = {
    safer: `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${dot}`,
    licensingInsurance: `https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_carrlist?n_dotno=${dot}`,
    motus: MOTUS_PORTAL_URL,
    notice: FMCSA_TRANSITION_NOTICE
  };
  if (includeSms) links.sms = `https://ai.fmcsa.dot.gov/SMS/Carrier/${dot}/Overview.aspx?FirstView=True`;
  return links;
}

function overviewText({ legalName, authorityStatus, entityType, physicalAddress, fleetSize, drivers, cargoList, authorityAgeText }) {
  const cargoText = cargoList.length ? cargoList.join(", ") : "not listed cargo";
  const fleetText = fleetSize ? `${fleetSize} power unit${fleetSize === 1 ? "" : "s"}` : "an unlisted fleet size";
  const driverText = drivers ? `${drivers} driver${drivers === 1 ? "" : "s"}` : "driver count not listed";
  return `${legalName} is listed as ${authorityStatus || "a carrier"} in the FMCSA carrier data. The record shows ${entityType || "carrier operations"}, ${fleetText}, ${driverText}, and ${cargoText}. ${physicalAddress ? `The physical address is ${physicalAddress}.` : ""} ${authorityAgeText ? `Authority age is approximately ${authorityAgeText}.` : ""}`.replace(/\s+/g, " ").trim();
}

function addressText(address = {}) {
  return clean(address.raw) || [address.street, address.city, address.state, address.zip].filter(Boolean).join(", ");
}

function splitAddress(value = "") {
  const parts = String(value || "").split(",").map(part => part.trim()).filter(Boolean);
  return {
    street: parts[0] || "",
    city: parts[1] || "",
    state: parts[2] || "",
    zip: parts[3] || "",
    raw: clean(value)
  };
}

function carrierName(carrier = {}) {
  return clean(carrier.legalName || carrier.carrierName || carrier.name || carrier.dbaName, "Unknown Carrier");
}

function sourceLabels(carrier = {}, sourceType = "cached") {
  const smsSafety = carrier.smsSafety || carrier.raw?.smsSafety || carrier.raw?.liveCarrier?.smsSafety;
  const saferData = carrier.saferData || carrier.raw?.saferData || carrier.raw?.liveCarrier?.saferData;
  const qcmobileDetails = carrier.qcmobileDetails || carrier.raw?.qcmobileDetails || carrier.raw?.liveCarrier?.qcmobileDetails;
  const sources = new Set(["MyTruckingLeads carrier database"]);
  if (sourceType === "live") sources.add("Live FMCSA lookup");
  if (carrier.source) sources.add(carrier.source);
  if (smsSafety) sources.add("FMCSA SMS public profile");
  if (saferData) sources.add("FMCSA SAFER snapshot");
  if (qcmobileDetails) sources.add("FMCSA QCMobile public profile endpoints");
  if (carrier.insuranceCompany || carrier.insuranceType || carrier.insurancePolicyNumber) {
    sources.add("FMCSA licensing and insurance filing data");
  }
  return [...sources];
}

function hasSafetyData(safety = {}) {
  const categories = safety.categories || {};
  const hasCategory = Object.values(categories).some(value => {
    const text = clean(value).toLowerCase();
    return text && text !== "not available" && text !== "not publicly available";
  });
  const hasOos = safety.oosRates && Object.values(safety.oosRates).some(Boolean);
  const rating = clean(safety.safetyRating);

  return Boolean(
    (rating && rating !== "Unknown" && rating !== "Not available") ||
    clean(safety.safetyRatingDate) ||
    clean(safety.totalInspections) ||
    clean(safety.crashTotal) ||
    safety.crashes ||
    (Array.isArray(safety.basicScores) && safety.basicScores.length > 0) ||
    hasCategory ||
    hasOos
  );
}

function hasDirectSmsData(smsSafety = {}) {
  if (!smsSafety) return false;
  const basics = smsSafety.basics || {};
  const hasBasic = Object.values(basics).some(value => clean(value) && clean(value) !== "Not available");
  const hasBasicCategories = Array.isArray(smsSafety.basicCategories) && smsSafety.basicCategories.length > 0;
  const hasOos = smsSafety.oosRates && Object.values(smsSafety.oosRates).some(Boolean);
  const rating = clean(smsSafety.safetyRating);
  return Boolean(
    (rating && rating !== "Unknown" && rating !== "Not available") ||
    clean(smsSafety.safetyRatingDate) ||
    clean(smsSafety.smsSnapshotDate) ||
    clean(smsSafety.inspections) ||
    hasBasicCategories ||
    hasBasic ||
    hasOos
  );
}

function hasQcmobileSafetyDetail(carrier = {}) {
  const qcmobileDetails = carrier.qcmobileDetails || carrier.raw?.qcmobileDetails || carrier.raw?.liveCarrier?.qcmobileDetails || {};
  return Boolean(
    qcmobileDetails.basics?.categories?.length ||
    (qcmobileDetails.oos && Object.values(qcmobileDetails.oos).some(Boolean))
  );
}

function insuranceLimitText(row = {}) {
  const max = clean(row.max_cov_amount);
  const underlying = clean(row.underl_lim_amount);
  const parts = [];
  if (max) parts.push(`Max coverage ${max}`);
  if (underlying && underlying !== "0") parts.push(`Underlying limit ${underlying}`);
  return parts.join(" / ");
}

function mapInsuranceFiling(row = {}) {
  if (!row) return null;
  return {
    insuranceCompany: clean(row.name_company),
    insuranceFilingStatus: clean(row.ins_form_code),
    policyNumber: clean(row.policy_no),
    coverageInfo: [clean(row.mod_col_1), insuranceLimitText(row)].filter(Boolean).join(" - "),
    insuranceEffectiveDate: formatUsDate(row.effective_date),
    insuranceExpirationDate: formatUsDate(row.cancl_effective_date),
    transactionDate: formatUsDate(row.trans_date),
    docketNumber: clean(row.docket_number),
    formCode: clean(row.ins_form_code),
    insuranceType: clean(row.mod_col_1),
    statusLabel: clean(row.cancl_effective_date) ? "Cancellation/expiration on file" : "Current filing on file",
    source: "FMCSA Licensing & Insurance public filing"
  };
}

function chooseCurrentInsuranceFiling(rows = []) {
  const mappedRows = rows.map(mapInsuranceFiling).filter(Boolean);
  if (!mappedRows.length) return null;

  const activeRows = mappedRows.filter((row) => !row.insuranceExpirationDate);
  const pool = activeRows.length ? activeRows : mappedRows;
  return pool.sort((a, b) => {
    const left = new Date(b.insuranceEffectiveDate || b.transactionDate || b.insuranceExpirationDate || 0).getTime();
    const right = new Date(a.insuranceEffectiveDate || a.transactionDate || a.insuranceExpirationDate || 0).getTime();
    return left - right;
  })[0];
}

async function fetchFmcsaInsuranceFilings(dotNumber) {
  const dot = normalizeDot(dotNumber);
  if (!dot) return [];

  const dotPadded = dot.padStart(8, "0");
  const params = new URLSearchParams({
    $select: [
      "docket_number",
      "dot_number",
      "cancl_effective_date",
      "effective_date",
      "name_company",
      "policy_no",
      "ins_form_code",
      "mod_col_1",
      "max_cov_amount",
      "underl_lim_amount",
      "trans_date"
    ].join(","),
    $where: `dot_number='${dotPadded}' OR dot_number='${dot}'`,
    $order: "effective_date DESC, trans_date DESC",
    $limit: "25"
  });

  const response = await fetch(`https://data.transportation.gov/resource/qh9u-swkp.json?${params.toString()}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`FMCSA insurance filings returned ${response.status}`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows : [];
}

async function findPostgresInsurance(dotNumber) {
  const dot = normalizeDot(dotNumber);
  if (!dot) return null;
  try {
    const result = await dbQuery(
      `SELECT dot_number, mc_number, insurance_expiration, insurance_company,
              insurance_policy_number, insurance_filing_status
       FROM carriers
       WHERE dot_number = $1
       LIMIT 1`,
      [dot]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      insuranceCompany: clean(row.insurance_company),
      insuranceFilingStatus: clean(row.insurance_filing_status),
      policyNumber: clean(row.insurance_policy_number),
      coverageInfo: clean(row.insurance_filing_status),
      insuranceEffectiveDate: "",
      insuranceExpirationDate: formatDate(row.insurance_expiration),
      docketNumber: clean(row.mc_number),
      statusLabel: row.insurance_expiration ? "Cancellation/expiration on file" : "",
      source: "Carrier database insurance filing"
    };
  } catch (err) {
    console.warn("Postgres insurance lookup skipped:", err.message);
    return null;
  }
}

function mapPostgresCarrierRecord(row = {}) {
  const cargoTypes = Array.isArray(row.cargo_types)
    ? row.cargo_types.map(item => clean(item)).filter(Boolean)
    : [];

  return {
    dotNumber: clean(row.dot_number),
    legalName: clean(row.legal_name || row.carrier_name, "Unknown Carrier"),
    carrierName: clean(row.carrier_name || row.legal_name, "Unknown Carrier"),
    dbaName: clean(row.dba_name),
    address: {
      raw: clean(row.hq_address),
      city: clean(row.hq_city),
      state: clean(row.hq_state),
      zip: clean(row.hq_zip)
    },
    mailingAddress: clean(row.mailing_address) || [
      clean(row.mailing_city),
      clean(row.mailing_state),
      clean(row.mailing_zip)
    ].filter(Boolean).join(", "),
    phoneNumber: clean(row.phone),
    email: clean(row.email),
    website: clean(row.website),
    docketNumber: clean(row.mc_number),
    safetyRating: clean(row.safety_rating, "Unknown"),
    safetyRatingDate: formatDate(row.safety_rating_date),
    authorityStatus: clean(row.authority_status),
    operatingStatus: clean(row.operating_status),
    insuranceExpirationDate: row.insurance_expiration || null,
    insuranceCompany: clean(row.insurance_company),
    insurancePolicyNumber: clean(row.insurance_policy_number),
    insuranceFilingStatus: clean(row.insurance_filing_status),
    insuranceType: clean(row.cargo_insurance),
    fleetSize: numberOrNull(row.vehicle_count),
    driverCount: numberOrNull(row.driver_count),
    mcs150Date: row.mcs150_date || null,
    mcs150Mileage: numberOrNull(row.mcs150_mileage),
    cargoTypes,
    cargo: cargoTypes.join(", "),
    lastUpdated: row.last_updated || row.created_at || null,
    dateCreated: row.created_at || null,
    source: "Postgres carrier database"
  };
}

async function findPostgresCarrier(dotNumber) {
  const dot = normalizeDot(dotNumber);
  if (!dot) return null;

  try {
    const result = await dbQuery(
      `SELECT dot_number, mc_number, carrier_name, legal_name, dba_name,
              safety_rating, safety_rating_date, insurance_expiration,
              insurance_company, insurance_filing_status, insurance_policy_number,
              cargo_insurance, vehicle_count, driver_count, mcs150_date,
              mcs150_mileage, hq_address, hq_city, hq_state, hq_zip,
              mailing_address, mailing_city, mailing_state, mailing_zip,
              phone, email, website, cargo_types, operating_status,
              authority_status, last_updated, created_at
       FROM carriers
       WHERE dot_number = $1
       LIMIT 1`,
      [dot]
    );

    return result.rows[0] ? mapPostgresCarrierRecord(result.rows[0]) : null;
  } catch (err) {
    console.warn("Postgres carrier lookup skipped:", err.message);
    return null;
  }
}

async function loadInsuranceSnapshot(dotNumber) {
  try {
    const filings = await fetchFmcsaInsuranceFilings(dotNumber);
    const current = chooseCurrentInsuranceFiling(filings);
    if (current) {
      return {
        ...current,
        bmcFilings: filings.map(mapInsuranceFiling).filter(Boolean)
      };
    }
  } catch (err) {
    console.warn("FMCSA insurance filing lookup skipped:", err.message);
  }

  const postgresInsurance = await findPostgresInsurance(dotNumber);
  return postgresInsurance ? { ...postgresInsurance, bmcFilings: [] } : null;
}

function mergeInsurance(profile, insuranceSnapshot) {
  if (!profile || !insuranceSnapshot) return profile;
  profile.licensingInsurance = {
    ...(profile.licensingInsurance || {}),
    ...Object.fromEntries(
      Object.entries(insuranceSnapshot).filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        return value !== undefined && value !== null && value !== "";
      })
    ),
    authorityStatus: profile.licensingInsurance?.authorityStatus || profile.authorityStatus
  };
  profile.dataSources = {
    ...(profile.dataSources || {}),
    insurance: {
      attempted: true,
      success: true,
      recordCount: Array.isArray(insuranceSnapshot.bmcFilings)
        ? insuranceSnapshot.bmcFilings.length
        : 1
    }
  };
  if (insuranceSnapshot.docketNumber && !profile.docketNumber) profile.docketNumber = insuranceSnapshot.docketNumber;
  return profile;
}

function rawCensus(carrier = {}) {
  return carrier.raw?.census || {};
}

function mapProfile(carrier = {}, { sourceType = "cached", liveUnavailable = false, message = "" } = {}) {
  const census = rawCensus(carrier);
  const smsSafety = carrier.smsSafety || carrier.raw?.smsSafety || carrier.raw?.liveCarrier?.smsSafety || null;
  const saferData = carrier.saferData || carrier.raw?.saferData || carrier.raw?.liveCarrier?.saferData || null;
  const qcmobileDetails = carrier.qcmobileDetails || carrier.raw?.liveCarrier?.qcmobileDetails || null;
  const qcmobileOos = qcmobileDetails?.oos || {};
  const qcmobileAuthority = qcmobileDetails?.authority || {};
  const qcmobileOperation = qcmobileDetails?.operationClassification?.operationClassification || carrier.operationClassification || [];
  const qcmobileDockets = qcmobileDetails?.docketNumbers?.docketNumbers || carrier.docketNumbers || [];
  const qcmobileBasicCategories = qcmobileDetails?.basics?.categories || smsSafety?.basicCategories || [];
  const dataSourceStatus = sourceStatusFromCarrier(carrier, qcmobileDetails);
  const liveFmcsaStatus = liveFmcsaStatusFromCarrier(carrier, dataSourceStatus, { reason: message });
  const physicalAddress = addressText(carrier.address) || clean(carrier.address);
  const mailingAddress =
    clean(carrier.mailingAddress) ||
    [
      census.carrier_mailing_street,
      census.carrier_mailing_city,
      census.carrier_mailing_state,
      census.carrier_mailing_zip
    ].filter(Boolean).join(", ");

  const dotNumber = clean(carrier.dotNumber || carrier.dot || census.dot_number);
  const legalName = clean(carrier.legalName || carrier.carrierName || census.legal_name, "Unknown Carrier");
  const dbaName = clean(carrier.dbaName || census.dba_name);
  const fleetSize = numberOrNull(carrier.fleetSize ?? carrier.vehicleCount ?? carrier.vehicles ?? census.power_units);
  const drivers = numberOrNull(carrier.driverCount ?? carrier.drivers ?? census.total_drivers);
  const authoritySinceRaw = carrier.authoritySince || carrier.dateCreated || carrier.newLeadSince || census.add_date;
  const authoritySince = formatCompactDate(authoritySinceRaw);
  const authorityAgeText = authorityAge(authoritySinceRaw);
  const qcmobileCargoTypes = qcmobileDetails?.cargo?.cargoTypes || [];
  const cargoList = Array.isArray(qcmobileCargoTypes) && qcmobileCargoTypes.length
    ? qcmobileCargoTypes
    : Array.isArray(carrier.cargoTypes) && carrier.cargoTypes.length
    ? carrier.cargoTypes
    : (
      Array.isArray(saferData?.cargoTypes) && saferData.cargoTypes.length
        ? saferData.cargoTypes
        : clean(carrier.cargo || saferData?.cargo).split(",").map(item => item.trim()).filter(Boolean)
    );
  const basicScores = normalizeBasicScores(qcmobileBasicCategories, smsSafety, dataSourceStatus.basics);
  const safetyCategories = basicScores.reduce((acc, category) => {
    acc[category.shortName] = category.percentile ?? category.measure ?? "";
    return acc;
  }, {});
  const driverOosRate = clean(qcmobileOos.driverOosRate || smsSafety?.oosRates?.driver?.carrier || smsSafety?.oosRates?.driver);
  const vehicleOosRate = clean(qcmobileOos.vehicleOosRate || smsSafety?.oosRates?.vehicle?.carrier || smsSafety?.oosRates?.vehicle);
  const hazmatOosRate = clean(qcmobileOos.hazmatOosRate || smsSafety?.oosRates?.hazmat?.carrier || smsSafety?.oosRates?.hazmat);
  const inspectionSummary = normalizeInspectionSummary({ qcmobileOos, smsSafety, saferData, carrier });
  const snapshotDates = basicScores.map(score => score.snapshotDate).filter(Boolean).sort();
  const smsSnapshotDate = snapshotDates[snapshotDates.length - 1] || formatDate(firstValue(smsSafety?.smsSnapshotDate, qcmobileDetails?.basics?.snapShotDate));

  return {
    dotNumber,
    legalName,
    dbaName,
    companyOverview: overviewText({
      legalName,
      authorityStatus: clean(carrier.authorityStatus || saferData?.authorityStatus || census.status_code),
      entityType: clean(carrier.entityType || census.business_org_desc || census.carrier_operation || carrier.carrierOperation),
      physicalAddress,
      fleetSize,
      drivers,
      cargoList,
      authorityAgeText
    }),
    physicalAddress,
    mailingAddress,
    phoneNumber: clean(carrier.phoneNumber || carrier.phone || census.phone || census.cell_phone),
    cellPhone: clean(carrier.cellPhone || census.cell_phone),
    email: clean(carrier.email || census.email_address),
    companyOfficer1: clean(carrier.companyOfficer1 || carrier.companyOfficer || census.company_officer_1),
    companyOfficer2: clean(carrier.companyOfficer2 || census.company_officer_2),
    companyOfficerTitle: clean(carrier.companyOfficerTitle),
    docketNumber: clean(carrier.docketNumber || carrier.mc || qcmobileDockets[0] || census.docket1 || census.docket_number),
    docketNumbers: qcmobileDockets,
    operatingStatus: clean(qcmobileAuthority.operatingStatus || carrier.operatingStatus || carrier.operatingAuthority || census.status_code, "Not available"),
    authorityStatus: clean(qcmobileAuthority.authorityStatus || carrier.authorityStatus || saferData?.authorityStatus || census.status_code, "Not available"),
    outOfServiceStatus: clean(qcmobileAuthority.outOfServiceStatus || carrier.outOfServiceStatus),
    outOfServiceDate: clean(qcmobileAuthority.outOfServiceDate || carrier.outOfServiceDate),
    entityType: clean(firstValue(carrier.entityType, carrier.entity_type, carrier.carrierEntityType, carrier.carrierType, carrier.carrier?.entityType, census.business_org_desc, census.carrier_operation, carrier.carrierOperation), "Not available"),
    carrierOperation: clean(qcmobileOperation.join(", ") || carrier.carrierOperation || census.carrier_operation),
    operationsScope: clean(qcmobileOperation.join(", ") || carrier.operationsScope || carrier.operatingAuthority || census.carrier_operation || census.classdef),
    authoritySince,
    authorityAge: authorityAgeText,
    fleetSize,
    powerUnits: fleetSize,
    drivers,
    cdlDrivers: numberOrNull(carrier.cdlDrivers || census.cdl_drivers) || drivers,
    intrastateDrivers: numberOrNull(carrier.intrastateDrivers || census.intrastate_drivers),
    mcs150Mileage: clean(carrier.mcs150Mileage || census.mcs150_mileage || census.mileage),
    mcs150Date: formatCompactDate(carrier.mcs150Date || census.mcs150_date),
    hazmat: yesNo(carrier.hazmatAuthorized ?? carrier.hazmat ?? census.hm_ind),
    passengerCarrier: yesNo(carrier.passengerCarrier || census.pc_flag || census.passenger_flag),
    county: clean(carrier.county || census.phy_county || census.county),
    cargoCarried: cargoList,
    fleetBreakdown: {
      ownedTrucks: fleetSize,
      tractors: numberOrNull(carrier.tractorCount),
      trailers: numberOrNull(carrier.trailerCount),
      straightTrucks: numberOrNull(carrier.straightTruckCount),
      termLeased: clean(census.term_leased_power_units || carrier.termLeased),
      tripLeased: clean(census.trip_leased_power_units || carrier.tripLeased),
      totalPowerUnits: fleetSize,
      classification: fleetSize ? `${fleetSize} truck${fleetSize === 1 ? "" : "s"}` : "Not available"
    },
    officialLinks: officialLinks(dotNumber, { includeSms: hasDirectSmsData(smsSafety) }),
    safety: {
      safetyRating: clean(smsSafety?.safetyRating || saferData?.safetyRating || carrier.safetyRating, "Unknown"),
      safetyRatingDate: clean(smsSafety?.safetyRatingDate || saferData?.safetyRatingDate || carrier.safetyRatingDate),
      smsSnapshotDate,
      totalInspections: inspectionSummary.totalInspections,
      vehicleInspections: inspectionSummary.vehicleInspections,
      driverInspections: inspectionSummary.driverInspections,
      hazmatInspections: inspectionSummary.hazmatInspections,
      vehicleOos: inspectionSummary.vehicleOosCount,
      driverOos: inspectionSummary.driverOosCount,
      hazmatOos: inspectionSummary.hazmatOosCount,
      driverOosRate: inspectionSummary.driverOosRate ?? driverOosRate,
      vehicleOosRate: inspectionSummary.vehicleOosRate ?? vehicleOosRate,
      hazmatOosRate: inspectionSummary.hazmatOosRate ?? hazmatOosRate,
      crashTotal: clean(saferData?.crashTotal || carrier.crashTotal),
      crashes: carrier.crashes || saferData?.crashes || null,
      basicScores,
      basicCategories: basicScores.map(score => ({
        id: score.shortName,
        label: score.category,
        percentile: score.percentile,
        measure: score.measure,
        inspections: score.totalInspectionsWithViolations,
        violations: score.totalViolations,
        snapshotDate: score.snapshotDate,
        publicStatus: score.publicStatus,
        deficientFlags: score.deficientFlags
      })),
      categories: safetyCategories,
      inspectionSummary,
      oosRates: {
        vehicle: {
          carrier: inspectionSummary.vehicleOosRate,
          nationalAverage: inspectionSummary.nationalAverageVehicleOosRate
        },
        driver: {
          carrier: inspectionSummary.driverOosRate,
          nationalAverage: inspectionSummary.nationalAverageDriverOosRate
        },
        hazmat: {
          carrier: inspectionSummary.hazmatOosRate,
          nationalAverage: inspectionSummary.nationalAverageHazmatOosRate
        }
      },
      smsProfileAvailable: hasDirectSmsData(smsSafety),
      source: smsSafety?.source || qcmobileDetails?.source || saferData?.source || "Most recent cached safety record"
    },
    inspectionSummary,
    crashSummary: {
      total: numberOrNull(firstValue(saferData?.crashes?.total, carrier.crashes?.total, saferData?.crashTotal, carrier.crashTotal)),
      fatal: numberOrNull(firstValue(saferData?.crashes?.fatal, carrier.crashes?.fatal)),
      injury: numberOrNull(firstValue(saferData?.crashes?.injury, carrier.crashes?.injury)),
      tow: numberOrNull(firstValue(saferData?.crashes?.tow, carrier.crashes?.tow)),
      source: saferData?.source || "FMCSA SAFER Company Snapshot"
    },
    licensingInsurance: {
      insuranceCompany: clean(carrier.insuranceCompany),
      insuranceFilingStatus: clean(carrier.insuranceFilingStatus || carrier.insuranceFormCode || carrier.authorityStatus, "Not available"),
      policyNumber: clean(carrier.insurancePolicyNumber),
      coverageInfo: clean(carrier.insuranceType || carrier.cargoInsurance),
      insuranceEffectiveDate: formatDate(carrier.insuranceEffectiveDate),
      insuranceExpirationDate: formatDate(carrier.insuranceExpirationDate || carrier.insuranceExpiration),
      authorityStatus: clean(carrier.authorityStatus || saferData?.authorityStatus, "Not available"),
      bmcFilings: carrier.bmcFilings || []
    },
    lastUpdated: formatDate(carrier.lastUpdated || carrier.updatedAt || carrier.sourceLastSeenAt || new Date()),
    sourceLabels: sourceLabels(carrier, sourceType),
    dataSources: dataSourceStatus,
    liveFmcsaStatus,
    sourceType,
    liveUnavailable,
    message: message || (liveUnavailable ? (liveFmcsaStatus.reason || LIVE_FMCSA_FALLBACK_MESSAGE) : "")
  };
}

function mapSearchResult(carrier = {}) {
  const profile = mapProfile(carrier, {
    sourceType: clean(carrier.sourceType, carrier.raw?.liveCarrier ? "live" : "cached"),
    liveUnavailable: Boolean(carrier.liveUnavailable),
    message: clean(carrier.message)
  });
  return {
    dotNumber: profile.dotNumber,
    dot: profile.dotNumber,
    legalName: profile.legalName,
    carrierName: profile.legalName,
    dbaName: profile.dbaName,
    docketNumber: profile.docketNumber,
    mc: profile.docketNumber,
    state: clean(carrier.address?.state || rawCensus(carrier).phy_state),
    city: clean(carrier.address?.city || rawCensus(carrier).phy_city),
    authorityStatus: profile.authorityStatus,
    operatingStatus: profile.operatingStatus,
    fleetSize: profile.fleetSize,
    drivers: profile.drivers,
    cargoHauled: profile.cargoCarried?.length ? profile.cargoCarried.join(", ") : "Not listed",
    cargo_hauled: profile.cargoCarried?.length ? profile.cargoCarried.join(", ") : "Not listed",
    mcs150Date: profile.mcs150Date || "",
    mcs150_date: profile.mcs150Date || "",
    mcs150Mileage: profile.mcs150Mileage || "",
    mcs150_mileage: profile.mcs150Mileage || "",
    phoneNumber: profile.phoneNumber,
    officialLinks: profile.officialLinks,
    sourceType: profile.sourceType,
    source: profile.sourceType === "live" ? "live_fmcsa" : profile.sourceType === "postgres-fallback" ? "fallback" : "database",
    liveFmcsaAttempted: Boolean(profile.liveFmcsaStatus?.attempted),
    liveFmcsaSuccess: Boolean(profile.liveFmcsaStatus?.success),
    fallbackReason: profile.liveFmcsaStatus?.success === false ? clean(profile.liveFmcsaStatus.reason) : "",
    liveFmcsaStatus: profile.liveFmcsaStatus,
    liveUnavailable: profile.liveUnavailable,
    message: profile.message,
    lastUpdated: profile.lastUpdated
  };
}

function maskSearchResultContact(
  result = {},
  { reason = TRIAL_LIMIT_MESSAGE, label = "Upgrade to reveal" } = {}
) {
  return {
    ...result,
    phoneNumber: "",
    contactMasked: true,
    contactLockedReason: reason,
    contactRevealLabel: label
  };
}

function trialAccessForRequest(req, res) {
  return res.locals.trialAccess || getTrialUsage(req.user);
}

async function finalizeTrialProfileResponse(req, res, carrier) {
  const trialAccess = trialAccessForRequest(req, res);
  if (!req.user) {
    if (!hasContactFields(carrier)) {
      return { carrier, trialAccess };
    }

    const maskedCarrier = maskTrialCarrierContacts(carrier, {
      hiddenLabel: "Create an account to reveal"
    });
    maskedCarrier.contactLockedReason = PUBLIC_CONTACT_LOCK_MESSAGE;
    maskedCarrier.message = [carrier.message, PUBLIC_CONTACT_LOCK_MESSAGE].filter(Boolean).join(" ");

    return {
      carrier: maskedCarrier,
      trialAccess
    };
  }

  if (!trialAccess.active) {
    return { carrier, trialAccess };
  }

  let updatedUser = await incrementTrialUsage(req.user.id, "profile");
  let maskedCarrier = carrier;

  if (trialAccess.remaining.contactViews > 0 && hasContactFields(carrier)) {
    updatedUser = await incrementTrialUsage(req.user.id, "contact") || updatedUser;
  } else {
    maskedCarrier = maskTrialCarrierContacts(carrier);
    maskedCarrier.message = [carrier.message, TRIAL_LIMIT_MESSAGE].filter(Boolean).join(" ");
  }

  if (updatedUser) {
    req.user.daily_profile_views = updatedUser.daily_profile_views;
    req.user.daily_contact_views = updatedUser.daily_contact_views;
    req.user.daily_saved_prospects = updatedUser.daily_saved_prospects;
  }

  return {
    carrier: maskedCarrier,
    trialAccess: getTrialUsage(updatedUser || req.user)
  };
}

function liveCarrierToMongo(liveCarrier = {}, dotNumber = "") {
  return {
    dotNumber: clean(liveCarrier.dot || dotNumber),
    legalName: carrierName(liveCarrier),
    dbaName: clean(liveCarrier.dbaName),
    address: splitAddress(liveCarrier.address),
    phoneNumber: clean(liveCarrier.phone),
    email: clean(liveCarrier.email),
    companyOfficer1: clean(liveCarrier.companyOfficer1 || liveCarrier.companyOfficer),
    companyOfficer2: clean(liveCarrier.companyOfficer2),
    docketNumber: clean(liveCarrier.mc),
    safetyRating: clean(liveCarrier.safetyRating, "Unknown"),
    authorityStatus: clean(liveCarrier.authorityStatus),
    operatingStatus: clean(liveCarrier.operatingStatus),
    insuranceExpirationDate: liveCarrier.insuranceExpiration ? new Date(liveCarrier.insuranceExpiration) : null,
    insuranceCompany: clean(liveCarrier.insuranceCompany),
    insurancePolicyNumber: clean(liveCarrier.insurancePolicyNumber),
    insuranceType: clean(liveCarrier.insuranceType || liveCarrier.cargoInsurance),
    fleetSize: numberOrNull(liveCarrier.vehicleCount ?? liveCarrier.vehicles),
    driverCount: numberOrNull(liveCarrier.driverCount ?? liveCarrier.drivers),
    cargoTypes: clean(liveCarrier.cargo).split(",").map(item => item.trim()).filter(Boolean),
    lastUpdated: new Date(),
    source: clean(liveCarrier.source, "FMCSA public data"),
    sourceLastSeenAt: new Date(),
    raw: {
      liveCarrier,
      smsSafety: liveCarrier.smsSafety || null,
      saferData: liveCarrier.saferData || null,
      qcmobileDetails: liveCarrier.qcmobileDetails || null
    }
  };
}

async function findCachedCarrier(dotNumber) {
  if (!isMongoConnected() || !dotNumber) return null;
  return Carrier.findOne({ dotNumber: String(dotNumber).trim() }).lean();
}

function hasCargoData(carrier = {}) {
  if (hasEnrichedCargoData(carrier)) return true;
  if (Array.isArray(carrier.cargoTypes) && carrier.cargoTypes.length) return true;
  if (clean(carrier.cargo)) return true;
  if (Array.isArray(carrier.saferData?.cargoTypes) && carrier.saferData.cargoTypes.length) return true;
  if (clean(carrier.saferData?.cargo)) return true;
  if (Array.isArray(carrier.raw?.liveCarrier?.cargoTypes) && carrier.raw.liveCarrier.cargoTypes.length) return true;
  if (clean(carrier.raw?.liveCarrier?.cargo)) return true;
  return false;
}

function stateFilter(state) {
  const value = clean(state).toUpperCase();
  if (!value || value === "ALL") return null;
  return {
    $or: [
      { "address.state": value },
      { "raw.census.phy_state": value },
      { "raw.census.carrier_mailing_state": value }
    ]
  };
}

async function searchCachedCarriers(criteria = {}, limit, state) {
  if (!isMongoConnected()) return [];
  const dot = normalizeDot(criteria.dot);
  const mc = normalizeMc(criteria.mc);
  const name = clean(criteria.name);
  const value = clean(criteria.queryText || name || mc || dot);
  const stateClause = stateFilter(state);
  if (!value) {
    const filter = stateClause
      ? { $and: [{ dotNumber: { $exists: true, $ne: "" } }, stateClause] }
      : { dotNumber: { $exists: true, $ne: "" } };
    return Carrier.find(filter)
      .sort({ lastUpdated: -1, fleetSize: -1 })
      .limit(limit)
      .lean();
  }

  let queryClause = null;

  if (dot) {
    queryClause = {
      $or: [
        { dotNumber: dot },
        { "raw.census.dot_number": dot }
      ]
    };
  } else if (mc) {
    const mcRegex = new RegExp(escapeRegex(mc), "i");
    queryClause = {
      $or: [
        { docketNumber: mcRegex },
        { "raw.census.docket1": mcRegex },
        { "raw.census.docket2": mcRegex },
        { "raw.census.docket3": mcRegex }
      ]
    };
  } else {
    const regex = new RegExp(escapeRegex(name || value), "i");
    queryClause = {
      $or: [
        { dotNumber: value },
        { docketNumber: regex },
        { legalName: regex },
        { dbaName: regex },
        { "address.city": regex },
        { "address.state": value.toUpperCase() },
        { "raw.census.legal_name": regex },
        { "raw.census.dba_name": regex },
        { "raw.census.phy_state": value.toUpperCase() }
      ]
    };
  }

  const filter = stateClause ? { $and: [queryClause, stateClause] } : queryClause;
  return Carrier.find(filter)
    .sort({ lastUpdated: -1, fleetSize: -1, legalName: 1 })
    .limit(limit)
    .lean();
}

async function enrichCarrierForSearch(carrier = {}) {
  const dotNumber = normalizeDot(carrier.dotNumber || carrier.dot);
  if (!dotNumber || hasCargoData(carrier)) return carrier;

  try {
    const enrichedCarrier = await enrichCarrierByDot(dotNumber, { delayMs: 0 });
    return {
      ...carrier,
      ...enrichedCarrier,
      dotNumber,
      legalName: clean(
        carrier.legalName || carrier.carrierName || enrichedCarrier?.legalName || enrichedCarrier?.carrierName,
        "Unknown Carrier"
      ),
      dbaName: clean(carrier.dbaName || enrichedCarrier?.dbaName),
      address: carrier.address || enrichedCarrier?.address,
      raw: carrier.raw || enrichedCarrier?.raw
    };
  } catch (err) {
    console.warn(`Carrier intelligence search enrichment skipped for DOT ${dotNumber}:`, err.message);
    return carrier;
  }
}

async function enrichSearchResults(carriers = [], limit = 3) {
  if (!Array.isArray(carriers) || carriers.length === 0) return carriers;

  let remaining = Math.max(Number(limit) || 0, 0);
  const hydrated = [];

  for (const carrier of carriers) {
    const shouldEnrich =
      remaining > 0 &&
      Boolean(normalizeDot(carrier?.dotNumber || carrier?.dot)) &&
      !hasCargoData(carrier);

    if (!shouldEnrich) {
      hydrated.push(carrier);
      continue;
    }

    const enrichedCarrier = await enrichCarrierForSearch(carrier);
    if (hasCargoData(enrichedCarrier)) remaining -= 1;
    hydrated.push(enrichedCarrier);
  }

  return hydrated;
}

function normalizeLiveLookup(criteriaOrValue) {
  if (criteriaOrValue && typeof criteriaOrValue === "object") {
    const dot = normalizeDot(criteriaOrValue.dot);
    const mc = normalizeMc(criteriaOrValue.mc);
    const name = clean(criteriaOrValue.name || criteriaOrValue.query || criteriaOrValue.value);
    return {
      dot,
      mc,
      name: !dot && !mc ? name : ""
    };
  }

  const value = clean(criteriaOrValue);
  const dot = /^\d+$/.test(value) ? normalizeDot(value) : "";
  return {
    dot,
    mc: "",
    name: dot ? "" : value
  };
}

async function fetchAndCacheLiveCarrier(criteriaOrValue) {
  const { dot, mc, name } = normalizeLiveLookup(criteriaOrValue);
  if (!dot && !mc && !name) {
    throw new Error("DOT, MC, or carrier name required");
  }

  if (dot) {
    return enrichCarrierByDot(dot);
  }

  const liveCarrier = await fetchCarrierByDotOrMc({ dot, mc, name });
  const resolvedDot = clean(liveCarrier.dot || dot);
  const searchCarrier = {
    ...liveCarrier,
    dotNumber: resolvedDot,
    legalName: carrierName(liveCarrier),
    sourceType: "live",
    lastUpdated: new Date()
  };

  if (resolvedDot && !hasCargoData(searchCarrier)) {
    const enrichedCarrier = await enrichCarrierForSearch(searchCarrier);
    if (hasCargoData(enrichedCarrier)) return enrichedCarrier;
  }

  if (isMongoConnected() && resolvedDot) {
    const { set, rawSet } = mapLiveCarrierToMongoSet(liveCarrier, resolvedDot);
    await Carrier.findOneAndUpdate(
      { dotNumber: resolvedDot },
      {
        $set: {
          ...set,
          ...rawSet
        },
        $setOnInsert: { newLeadSince: new Date(), isNewLead: true }
      },
      { upsert: true, new: true, lean: true }
    ).catch(err => {
      console.warn("Carrier intelligence cache write skipped:", err.message);
    });
  }

  return searchCarrier;
}

function candidateState(carrier = {}) {
  return clean(carrier.address?.state || rawCensus(carrier).phy_state).toUpperCase();
}

function candidateCity(carrier = {}) {
  return clean(carrier.address?.city || rawCensus(carrier).phy_city).toUpperCase();
}

function insuranceStatusBoost(carrier = {}) {
  const filingStatus = clean(carrier.insuranceFilingStatus || carrier.licensingInsurance?.insuranceFilingStatus).toUpperCase();
  if (!filingStatus) return 0;
  if (/ACTIVE|CURRENT|ON FILE|AUTHORIZED|COMMON|CONTRACT/.test(filingStatus)) return 220;
  if (/PENDING/.test(filingStatus)) return 80;
  if (/CANCEL|EXPIRE|INACTIVE|REVOK|DENIED/.test(filingStatus)) return -80;
  return 20;
}

function scoreNameSearchCandidate(carrier = {}) {
  const matchMeta = carrier.matchMeta || {};
  let score = Number(matchMeta.score) || 0;
  score += insuranceStatusBoost(carrier);

  const authorityStatus = clean(carrier.authorityStatus).toUpperCase();
  if (authorityStatus === "ACTIVE") score += 180;
  else if (authorityStatus === "PENDING") score += 90;
  else if (authorityStatus === "INACTIVE") score -= 120;

  const operatingStatus = clean(carrier.operatingStatus).toUpperCase();
  if (operatingStatus === "ACTIVE") score += 120;
  else if (operatingStatus === "INACTIVE") score -= 60;

  return score;
}

async function hydrateNameSearchCandidate(candidate = {}) {
  const dot = normalizeDot(candidate.dotNumber || candidate.dot);
  if (!dot) return candidate;

  const [cachedCarrier, postgresCarrier] = await Promise.all([
    findCachedCarrier(dot),
    findPostgresCarrier(dot)
  ]);
  const overlay = postgresCarrier || cachedCarrier;
  if (!overlay) return candidate;

  const overlayAddress = typeof overlay.address === "object" && overlay.address ? overlay.address : {};
  const candidateAddress = typeof candidate.address === "object" && candidate.address ? candidate.address : {};

  return {
    ...overlay,
    ...candidate,
    dotNumber: clean(candidate.dotNumber || candidate.dot || overlay.dotNumber || overlay.dot),
    dot: clean(candidate.dot || candidate.dotNumber || overlay.dot || overlay.dotNumber),
    legalName: clean(candidate.legalName || candidate.carrierName || overlay.legalName || overlay.carrierName, "Unknown Carrier"),
    carrierName: clean(candidate.carrierName || candidate.legalName || overlay.carrierName || overlay.legalName, "Unknown Carrier"),
    dbaName: clean(candidate.dbaName || overlay.dbaName),
    address: {
      ...overlayAddress,
      ...candidateAddress,
      raw: clean(candidateAddress.raw || overlayAddress.raw)
    },
    authorityStatus: clean(candidate.authorityStatus || overlay.authorityStatus),
    operatingStatus: clean(candidate.operatingStatus || overlay.operatingStatus || candidate.authorityStatus || overlay.authorityStatus),
    insuranceCompany: clean(candidate.insuranceCompany || overlay.insuranceCompany),
    insurancePolicyNumber: clean(candidate.insurancePolicyNumber || overlay.insurancePolicyNumber),
    insuranceFilingStatus: clean(candidate.insuranceFilingStatus || overlay.insuranceFilingStatus),
    insuranceExpirationDate: candidate.insuranceExpirationDate || overlay.insuranceExpirationDate || overlay.insuranceExpiration,
    lastUpdated: candidate.lastUpdated || overlay.lastUpdated || overlay.sourceLastSeenAt,
    raw: candidate.raw || overlay.raw,
    matchMeta: candidate.matchMeta
  };
}

function resolveNameSearchCandidates(candidates = [], { state = "", city = "" } = {}) {
  const ranked = [...candidates]
    .map((candidate) => ({
      ...candidate,
      nameSearchScore: scoreNameSearchCandidate(candidate)
    }))
    .sort((left, right) => right.nameSearchScore - left.nameSearchScore);

  if (!ranked.length) {
    return { multipleMatches: false, selected: null, candidates: [] };
  }

  const preferredState = clean(state).toUpperCase();
  const preferredCity = clean(city).toUpperCase();
  const narrowByLocation = (pool = []) => {
    let narrowed = pool;
    if (preferredState) {
      const stateMatches = narrowed.filter((candidate) => candidateState(candidate) === preferredState);
      if (stateMatches.length > 0) narrowed = stateMatches;
    }
    if (preferredCity) {
      const cityMatches = narrowed.filter((candidate) => candidateCity(candidate) === preferredCity);
      if (cityMatches.length > 0) narrowed = cityMatches;
    }
    return narrowed;
  };

  const exactMatches = ranked.filter((candidate) => {
    const matchMeta = candidate.matchMeta || {};
    return Boolean(matchMeta.exactLegalMatch || matchMeta.exactDbaMatch);
  });
  const narrowedExactMatches = narrowByLocation(exactMatches);

  if (narrowedExactMatches.length > 1) {
    return {
      multipleMatches: true,
      selected: null,
      candidates: narrowedExactMatches.slice(0, 5)
    };
  }

  if (narrowedExactMatches.length === 1) {
    return {
      multipleMatches: false,
      selected: narrowedExactMatches[0],
      candidates: narrowedExactMatches
    };
  }

  const strongMatches = ranked.filter((candidate) => {
    const matchMeta = candidate.matchMeta || {};
    return Boolean(
      matchMeta.fullTokenCoverage ||
      matchMeta.legalStartsWith ||
      matchMeta.dbaStartsWith ||
      matchMeta.legalContains ||
      matchMeta.dbaContains
    );
  });
  const narrowedStrongMatches = narrowByLocation(strongMatches.length ? strongMatches : ranked);
  const [topCandidate, secondCandidate] = narrowedStrongMatches;

  if (!topCandidate) {
    return { multipleMatches: false, selected: null, candidates: [] };
  }

  if (secondCandidate) {
    const scoreGap = Number(topCandidate.nameSearchScore || 0) - Number(secondCandidate.nameSearchScore || 0);
    if (scoreGap < 3500) {
      return {
        multipleMatches: true,
        selected: null,
        candidates: narrowedStrongMatches.slice(0, 5)
      };
    }
  }

  return {
    multipleMatches: false,
    selected: topCandidate,
    candidates: [topCandidate]
  };
}

async function resolveLiveNameSearch({ name, state = "", city = "", limit = 5 } = {}) {
  const liveCandidates = await searchCarrierCandidatesByName({
    name,
    state,
    city,
    limit: Math.max(Number(limit) || 5, 5)
  });

  if (!liveCandidates.length) {
    throw new Error("Carrier not found in FMCSA data sources");
  }

  const hydratedCandidates = await Promise.all(
    liveCandidates.slice(0, Math.max(Number(limit) || 5, 5)).map((candidate) => hydrateNameSearchCandidate(candidate))
  );

  return resolveNameSearchCandidates(hydratedCandidates, { state, city });
}

export async function searchCarrierIntelligence(req, res) {
  const searchInput = parseCarrierSearchInput(req.query);
  const { dot, mc, name, queryText, preferLiveLookup } = searchInput;
  const query = queryText;
  const state = clean(req.query.state);
  const city = clean(req.query.city);
  const leadType = clean(req.query.leadType);
  const trialAccess = trialAccessForRequest(req, res);
  const defaultLimit = trialAccess.active ? 25 : 6;
  const hardLimit = trialAccess.active ? 25 : 12;
  const limit = Math.min(Math.max(Number(req.query.limit) || defaultLimit, 1), hardLimit);
  const shouldMaskContacts = !req.user || trialAccess.active;
  const maskReason = !req.user ? PUBLIC_CONTACT_LOCK_MESSAGE : TRIAL_LIMIT_MESSAGE;
  const maskLabel = !req.user ? "Create an account to reveal" : "Upgrade to reveal";

  function responseMessage(baseMessage = "") {
    if (!trialAccess.active) return baseMessage || undefined;
    const trialMessage = `Trial access shows up to ${trialAccess.limits.searchResults} carrier matches per search.`;
    return [baseMessage, trialMessage].filter(Boolean).join(" ");
  }

  function finalizeResults(items = []) {
    return items.map((result) => shouldMaskContacts
      ? maskSearchResultContact(result, { reason: maskReason, label: maskLabel })
      : result);
  }

  try {
    if (preferLiveLookup && (dot || mc || name)) {
      try {
        if (!dot && !mc && name) {
          const nameResolution = await resolveLiveNameSearch({ name, state, city, limit });
          if (nameResolution.multipleMatches) {
            const results = finalizeResults(nameResolution.candidates.map(mapSearchResult));
            return res.json({
              total: results.length,
              query,
              state,
              city,
              leadType,
              source: "live",
              multipleMatches: true,
              selectionRequired: true,
              results,
              trialAccess,
              message: responseMessage("Multiple FMCSA carriers matched that name. Select the correct carrier to continue.")
            });
          }

          const selectedDot = normalizeDot(nameResolution.selected?.dotNumber || nameResolution.selected?.dot);
          const liveCarrier = selectedDot
            ? await fetchAndCacheLiveCarrier({ dot: selectedDot })
            : nameResolution.selected;
          const results = finalizeResults([mapSearchResult(liveCarrier)]);
          return res.json({
            total: results.length,
            query,
            state,
            city,
            leadType,
            source: "live",
            results,
            trialAccess,
            message: responseMessage()
          });
        }

        const liveCarrier = await fetchAndCacheLiveCarrier({ dot, mc, name });
        const results = finalizeResults([mapSearchResult(liveCarrier)]);
        return res.json({
          total: results.length,
          query,
          state,
          city,
          leadType,
          source: "live",
          results,
          trialAccess,
          message: responseMessage()
        });
      } catch (liveErr) {
        const liveFmcsaStatus = liveFmcsaFailureFromError(liveErr);
        const cachedFallback = await searchCachedCarriers(searchInput, limit, state);
        if (cachedFallback.length > 0) {
          const hydratedCached = await enrichSearchResults(cachedFallback, Math.min(limit, 3));
          const results = finalizeResults(hydratedCached.map(carrier => mapSearchResult({
            ...carrier,
            liveUnavailable: true,
            liveFmcsaStatus
          })));
          return res.json({
            total: results.length,
            query,
            state,
            city,
            leadType,
            source: "cached-fallback",
            results,
            trialAccess,
            liveFmcsaStatus,
            message: responseMessage(liveFmcsaStatus.reason || LIVE_FMCSA_FALLBACK_MESSAGE)
          });
        }

        if (dot) {
          const postgresCarrier = await findPostgresCarrier(dot);
          if (postgresCarrier) {
            const results = finalizeResults([mapSearchResult({
              ...postgresCarrier,
              liveUnavailable: true,
              liveFmcsaStatus
            })]);
            return res.json({
              total: results.length,
              query,
              state,
              city,
              leadType,
              source: "postgres-fallback",
              results,
              trialAccess,
              liveFmcsaStatus,
              message: responseMessage(liveFmcsaStatus.reason || LIVE_FMCSA_FALLBACK_MESSAGE)
            });
          }
        }

        throw liveErr;
      }
    }

    const cached = await searchCachedCarriers(searchInput, limit, state);
    if (cached.length > 0) {
      const hydratedCached = await enrichSearchResults(cached, /^\d+$/.test(query) ? 1 : Math.min(limit, 3));
      const results = finalizeResults(hydratedCached.map(mapSearchResult));

      return res.json({
        total: results.length,
        query,
        state,
        city,
        leadType,
        source: "cached",
        results,
        trialAccess,
        message: responseMessage()
      });
    }

    if (!query) {
      return res.json({
        total: 0,
        query,
        state,
        city,
        leadType,
        source: "cached",
        results: [],
        trialAccess
      });
    }

    try {
      const liveCarrier = await fetchAndCacheLiveCarrier({ dot, mc, name: name || query });
      const results = finalizeResults([mapSearchResult(liveCarrier)]);
      return res.json({
        total: 1,
        query,
        state,
        city,
        leadType,
        source: "live",
        results,
        trialAccess,
        message: responseMessage()
      });
    } catch (liveErr) {
      const liveFmcsaStatus = liveFmcsaFailureFromError(liveErr);
      if (dot) {
        const postgresCarrier = await findPostgresCarrier(dot);
        if (postgresCarrier) {
          const results = finalizeResults([mapSearchResult({
            ...postgresCarrier,
            liveUnavailable: true,
            liveFmcsaStatus
          })]);
          return res.json({
            total: 1,
            query,
            state,
            city,
            leadType,
            source: "postgres-fallback",
            results,
            trialAccess,
            liveFmcsaStatus,
            message: responseMessage(liveFmcsaStatus.reason || LIVE_FMCSA_FALLBACK_MESSAGE)
          });
        }
      }

      throw liveErr;
    }
  } catch (err) {
    console.error("Carrier intelligence search error:", err.message);
    const liveFmcsaStatus = liveFmcsaFailureFromError(err);
    res.status(503).json({
      error: liveFmcsaStatus.reason || LIVE_FMCSA_FALLBACK_MESSAGE,
      liveFmcsaStatus,
      query,
      state,
      city,
      leadType,
      results: [],
      trialAccess
    });
  }
}

export async function getCarrierIntelligenceProfile(req, res) {
  const dotNumber = clean(req.params.dotNumber || req.params.dot);
  if (!dotNumber) return res.status(400).json({ error: "DOT number is required" });

  try {
    let profile = null;
    const cached = await findCachedCarrier(dotNumber);
    if (cached && hasCargoData(cached) && hasQcmobileSafetyDetail(cached)) {
      profile = mapProfile(cached, { sourceType: "cached" });
      mergeInsurance(profile, await loadInsuranceSnapshot(dotNumber));
    } else {
      try {
        const liveCarrier = await fetchAndCacheLiveCarrier(dotNumber);
        profile = mapProfile(liveCarrier, { sourceType: "live" });
        mergeInsurance(profile, await loadInsuranceSnapshot(dotNumber));
      } catch (err) {
        const liveFmcsaStatus = liveFmcsaFailureFromError(err);
        if (cached) {
          profile = mapProfile({
            ...cached,
            liveFmcsaStatus
          }, {
            sourceType: "cached",
            liveUnavailable: true,
            message: liveFmcsaStatus.reason || LIVE_FMCSA_FALLBACK_MESSAGE
          });
          mergeInsurance(profile, await loadInsuranceSnapshot(dotNumber));
        } else {
          const postgresCarrier = await findPostgresCarrier(dotNumber);
          if (postgresCarrier) {
            profile = mapProfile({
              ...postgresCarrier,
              liveFmcsaStatus
            }, {
              sourceType: "postgres-fallback",
              liveUnavailable: true,
              message: liveFmcsaStatus.reason || SAVED_PROFILE_REFRESH_MESSAGE
            });
            mergeInsurance(profile, await loadInsuranceSnapshot(dotNumber));
          } else {
            throw err;
          }
        }
      }
    }

    const finalized = await finalizeTrialProfileResponse(req, res, profile);
    return res.json(finalized);
  } catch (err) {
    console.error("Carrier intelligence profile error:", err.message);
    const liveFmcsaStatus = liveFmcsaFailureFromError(err);
    const cached = await findCachedCarrier(dotNumber);
    if (cached) {
      const profile = mapProfile({
        ...cached,
        liveFmcsaStatus
      }, {
        sourceType: "cached",
        liveUnavailable: true,
        message: liveFmcsaStatus.reason || LIVE_FMCSA_FALLBACK_MESSAGE
      });
      mergeInsurance(profile, await loadInsuranceSnapshot(dotNumber));
      return res.json(await finalizeTrialProfileResponse(req, res, profile));
    }

    const postgresCarrier = await findPostgresCarrier(dotNumber);
    if (postgresCarrier) {
      const profile = mapProfile({
        ...postgresCarrier,
        liveFmcsaStatus
      }, {
        sourceType: "postgres-fallback",
        liveUnavailable: true,
        message: liveFmcsaStatus.reason || SAVED_PROFILE_REFRESH_MESSAGE
      });
      mergeInsurance(profile, await loadInsuranceSnapshot(dotNumber));
      return res.json(await finalizeTrialProfileResponse(req, res, profile));
    }

    res.status(404).json({
      error: "Carrier profile is not available right now.",
      message: "No saved carrier record was found and the live FMCSA lookup did not return a profile."
    });
  }
}

export async function getCarrierIntelligenceSafety(req, res) {
  const dotNumber = clean(req.params.dotNumber);
  try {
    const cached = await findCachedCarrier(dotNumber);
    let profile = cached ? mapProfile(cached, { sourceType: "cached" }) : null;
    let liveRefreshMessage = "";

    if (!profile || !hasSafetyData(profile.safety)) {
      try {
        const liveCarrier = await fetchAndCacheLiveCarrier(dotNumber);
        profile = mapProfile(liveCarrier, { sourceType: "live" });
      } catch (liveErr) {
        const liveFmcsaStatus = liveFmcsaFailureFromError(liveErr);
        liveRefreshMessage = liveFmcsaStatus.reason || LIVE_FMCSA_FALLBACK_MESSAGE;
        if (!profile) {
          const postgresCarrier = await findPostgresCarrier(dotNumber);
          if (postgresCarrier) {
            profile = mapProfile({
              ...postgresCarrier,
              liveFmcsaStatus
            }, {
              sourceType: "postgres-fallback",
              liveUnavailable: true,
              message: liveRefreshMessage
            });
          } else {
            throw liveErr;
          }
        }
      }
    }

    if (!hasSafetyData(profile.safety)) {
      liveRefreshMessage = liveRefreshMessage || "SMS safety data is not currently available for this carrier.";
    }

    res.json({
      dotNumber: profile.dotNumber,
      safety: profile.safety,
      lastUpdated: profile.lastUpdated,
      message: liveRefreshMessage || profile.message,
      liveFmcsaStatus: profile.liveFmcsaStatus,
      sourceType: profile.sourceType
    });
  } catch (err) {
    console.error("Carrier intelligence safety error:", err.message);
    const liveFmcsaStatus = liveFmcsaFailureFromError(err);
    res.status(503).json({ error: liveFmcsaStatus.reason || LIVE_FMCSA_FALLBACK_MESSAGE, liveFmcsaStatus });
  }
}

export async function getCarrierIntelligenceLicensingInsurance(req, res) {
  const dotNumber = clean(req.params.dotNumber);
  try {
    const cached = await findCachedCarrier(dotNumber);
    let sourceType = cached ? "cached" : "live";
    let liveFmcsaStatus = null;
    const carrier = cached || await fetchAndCacheLiveCarrier(dotNumber).catch(async (err) => {
      sourceType = "postgres-fallback";
      liveFmcsaStatus = liveFmcsaFailureFromError(err);
      return findPostgresCarrier(dotNumber);
    });
    if (!carrier) throw new Error("Carrier record unavailable");
    const profile = mapProfile({
      ...carrier,
      ...(liveFmcsaStatus ? { liveFmcsaStatus } : {})
    }, {
      sourceType,
      liveUnavailable: sourceType !== "live",
      message: sourceType === "postgres-fallback" ? (liveFmcsaStatus?.reason || LIVE_FMCSA_FALLBACK_MESSAGE) : ""
    });
    mergeInsurance(profile, await loadInsuranceSnapshot(dotNumber));
    res.json({
      dotNumber: profile.dotNumber,
      licensingInsurance: profile.licensingInsurance,
      lastUpdated: profile.lastUpdated,
      message: profile.message,
      liveFmcsaStatus: profile.liveFmcsaStatus
    });
  } catch (err) {
    console.error("Carrier intelligence L&I error:", err.message);
    const liveFmcsaStatus = liveFmcsaFailureFromError(err);
    res.status(503).json({ error: liveFmcsaStatus.reason || LIVE_FMCSA_FALLBACK_MESSAGE, liveFmcsaStatus });
  }
}
