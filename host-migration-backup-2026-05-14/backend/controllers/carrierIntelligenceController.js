import Carrier from "../models/Carrier.js";
import { isMongoConnected } from "../config/mongo.js";
import { query as dbQuery } from "../config/db.js";
import { fetchCarrierByDotOrMc } from "../services/fmcsaService.js";
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

function officialLinks(dotNumber, { includeSms = false } = {}) {
  const dot = encodeURIComponent(dotNumber);
  if (!dotNumber) return {};
  const links = {
    safer: `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${dot}`,
    licensingInsurance: `https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_carrlist?n_dotno=${dot}`
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
  const sources = new Set(["MyTruckingLeads carrier database"]);
  if (sourceType === "live") sources.add("Live FMCSA lookup");
  if (carrier.source) sources.add(carrier.source);
  if (smsSafety) sources.add("FMCSA SMS public profile");
  if (saferData) sources.add("FMCSA SAFER snapshot");
  if (carrier.insuranceCompany || carrier.insuranceType || carrier.insurancePolicyNumber) {
    sources.add("FMCSA licensing and insurance filing data");
  }
  return [...sources];
}

function hasSafetyData(safety = {}) {
  const categories = safety.categories || {};
  const hasCategory = Object.values(categories).some(value => clean(value) && clean(value) !== "Not available");
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
  const hasOos = smsSafety.oosRates && Object.values(smsSafety.oosRates).some(Boolean);
  const rating = clean(smsSafety.safetyRating);
  return Boolean(
    (rating && rating !== "Unknown" && rating !== "Not available") ||
    clean(smsSafety.safetyRatingDate) ||
    clean(smsSafety.inspections) ||
    hasBasic ||
    hasOos
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
  const cargoList = Array.isArray(carrier.cargoTypes) && carrier.cargoTypes.length
    ? carrier.cargoTypes
    : (
      Array.isArray(saferData?.cargoTypes) && saferData.cargoTypes.length
        ? saferData.cargoTypes
        : clean(carrier.cargo || saferData?.cargo).split(",").map(item => item.trim()).filter(Boolean)
    );

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
    docketNumber: clean(carrier.docketNumber || carrier.mc || census.docket1 || census.docket_number),
    operatingStatus: clean(carrier.operatingStatus || carrier.operatingAuthority || census.status_code, "Not available"),
    authorityStatus: clean(carrier.authorityStatus || saferData?.authorityStatus || census.status_code, "Not available"),
    entityType: clean(carrier.entityType || census.business_org_desc || census.carrier_operation || carrier.carrierOperation, "Not available"),
    carrierOperation: clean(carrier.carrierOperation || census.carrier_operation),
    operationsScope: clean(carrier.operationsScope || carrier.operatingAuthority || census.carrier_operation || census.classdef),
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
      termLeased: clean(census.term_leased_power_units || carrier.termLeased),
      tripLeased: clean(census.trip_leased_power_units || carrier.tripLeased),
      totalPowerUnits: fleetSize,
      classification: fleetSize ? `${fleetSize} truck${fleetSize === 1 ? "" : "s"}` : "Not available"
    },
    officialLinks: officialLinks(dotNumber, { includeSms: hasDirectSmsData(smsSafety) }),
    safety: {
      safetyRating: clean(smsSafety?.safetyRating || saferData?.safetyRating || carrier.safetyRating, "Unknown"),
      safetyRatingDate: clean(smsSafety?.safetyRatingDate || saferData?.safetyRatingDate || carrier.safetyRatingDate),
      totalInspections: clean(saferData?.totalInspections || smsSafety?.inspections || carrier.totalInspections),
      crashTotal: clean(saferData?.crashTotal || carrier.crashTotal),
      crashes: carrier.crashes || saferData?.crashes || null,
      basicScores: carrier.basicScores || [],
      categories: {
        unsafeDriving: clean(smsSafety?.basics?.unsafeDriving, "Not available"),
        hoursOfService: clean(smsSafety?.basics?.hoursOfService, "Not available"),
        driverFitness: clean(smsSafety?.basics?.driverFitness, "Not available"),
        vehicleMaintenance: clean(smsSafety?.basics?.vehicleMaintenance, "Not available"),
        controlledSubstances: clean(smsSafety?.basics?.controlledSubstances, "Not available"),
        hazmat: clean(smsSafety?.basics?.hazmat, "Not available")
      },
      oosRates: smsSafety?.oosRates || null,
      smsProfileAvailable: hasDirectSmsData(smsSafety),
      source: smsSafety?.source || saferData?.source || "Most recent cached safety record"
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
    dataSources: sourceLabels(carrier, sourceType),
    sourceType,
    liveUnavailable,
    message: message || (liveUnavailable ? "Live data is temporarily unavailable. Showing most recent cached record." : "")
  };
}

function mapSearchResult(carrier = {}) {
  const profile = mapProfile(carrier);
  return {
    dotNumber: profile.dotNumber,
    legalName: profile.legalName,
    dbaName: profile.dbaName,
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
      saferData: liveCarrier.saferData || null
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

async function searchCachedCarriers(query, limit, state) {
  if (!isMongoConnected()) return [];
  const value = clean(query);
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

  const regex = new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const queryClause = {
    $or: [
      { dotNumber: value },
      { legalName: regex },
      { dbaName: regex },
      { "address.city": regex },
      { "address.state": value.toUpperCase() },
      { "raw.census.legal_name": regex },
      { "raw.census.dba_name": regex },
      { "raw.census.phy_state": value.toUpperCase() }
    ]
  };
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

async function fetchAndCacheLiveCarrier(dotNumberOrName) {
  const value = clean(dotNumberOrName);
  const isDot = /^\d+$/.test(value);
  if (isDot) {
    return enrichCarrierByDot(value);
  }

  const liveCarrier = await fetchCarrierByDotOrMc(isDot ? { dot: value } : { name: value });
  const resolvedDot = clean(liveCarrier.dot || value);
  const searchCarrier = {
    ...liveCarrier,
    dotNumber: resolvedDot,
    legalName: carrierName(liveCarrier),
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

export async function searchCarrierIntelligence(req, res) {
  const query = clean(req.query.query || req.query.q || req.query.name);
  const state = clean(req.query.state);
  const leadType = clean(req.query.leadType);
  const trialAccess = trialAccessForRequest(req, res);
  const defaultLimit = trialAccess.active ? 25 : 6;
  const hardLimit = trialAccess.active ? 25 : 12;
  const limit = Math.min(Math.max(Number(req.query.limit) || defaultLimit, 1), hardLimit);
  const shouldMaskContacts = !req.user || trialAccess.active;
  const maskReason = !req.user ? PUBLIC_CONTACT_LOCK_MESSAGE : TRIAL_LIMIT_MESSAGE;
  const maskLabel = !req.user ? "Create an account to reveal" : "Upgrade to reveal";

  try {
    const cached = await searchCachedCarriers(query, limit, state);
    if (cached.length > 0) {
      const hydratedCached = await enrichSearchResults(cached, /^\d+$/.test(query) ? 1 : Math.min(limit, 3));
      const results = hydratedCached
        .map(mapSearchResult)
        .map((result) => shouldMaskContacts
          ? maskSearchResultContact(result, { reason: maskReason, label: maskLabel })
          : result);

      return res.json({
        total: results.length,
        query,
        state,
        leadType,
        source: "cached",
        results,
        trialAccess,
        message: trialAccess.active ? `Trial access shows up to ${trialAccess.limits.searchResults} carrier matches per search.` : undefined
      });
    }

    if (!query) {
      return res.json({
        total: 0,
        query,
        state,
        leadType,
        source: "cached",
        results: [],
        trialAccess
      });
    }

    try {
      const liveCarrier = await fetchAndCacheLiveCarrier(query);
      const results = [mapSearchResult(liveCarrier)].map((result) => shouldMaskContacts
        ? maskSearchResultContact(result, { reason: maskReason, label: maskLabel })
        : result);
      return res.json({
        total: 1,
        query,
        state,
        leadType,
        source: "live",
        results,
        trialAccess,
        message: trialAccess.active ? `Trial access shows up to ${trialAccess.limits.searchResults} carrier matches per search.` : undefined
      });
    } catch (liveErr) {
      if (/^\d+$/.test(query)) {
        const postgresCarrier = await findPostgresCarrier(query);
        if (postgresCarrier) {
          const results = [mapSearchResult(postgresCarrier)].map((result) => shouldMaskContacts
            ? maskSearchResultContact(result, { reason: maskReason, label: maskLabel })
            : result);
          return res.json({
            total: 1,
            query,
            state,
            leadType,
            source: "postgres-fallback",
            results,
            trialAccess,
            message: trialAccess.active ? `Trial access shows up to ${trialAccess.limits.searchResults} carrier matches per search.` : undefined
          });
        }
      }

      throw liveErr;
    }
  } catch (err) {
    console.error("Carrier intelligence search error:", err.message);
    res.status(503).json({
      error: "Live data is temporarily unavailable. Showing most recent cached record.",
      query,
      state,
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
    if (cached && hasCargoData(cached)) {
      profile = mapProfile(cached, { sourceType: "cached" });
      mergeInsurance(profile, await loadInsuranceSnapshot(dotNumber));
    } else {
      try {
        const liveCarrier = await fetchAndCacheLiveCarrier(dotNumber);
        profile = mapProfile(liveCarrier, { sourceType: "live" });
        mergeInsurance(profile, await loadInsuranceSnapshot(dotNumber));
      } catch (err) {
        if (cached) {
          profile = mapProfile(cached, {
            sourceType: "cached",
            liveUnavailable: true,
            message: "Live SAFER cargo data is temporarily unavailable. Showing the cached carrier record."
          });
          mergeInsurance(profile, await loadInsuranceSnapshot(dotNumber));
        } else {
          const postgresCarrier = await findPostgresCarrier(dotNumber);
          if (postgresCarrier) {
            profile = mapProfile(postgresCarrier, {
              sourceType: "postgres-fallback",
              liveUnavailable: true,
              message: "Live FMCSA data is temporarily unavailable. Showing the most recent Postgres carrier record."
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
    const cached = await findCachedCarrier(dotNumber);
    if (cached) {
      const profile = mapProfile(cached, {
        sourceType: "cached",
        liveUnavailable: true,
        message: "Live data is temporarily unavailable. Showing most recent cached record."
      });
      mergeInsurance(profile, await loadInsuranceSnapshot(dotNumber));
      return res.json(await finalizeTrialProfileResponse(req, res, profile));
    }

    const postgresCarrier = await findPostgresCarrier(dotNumber);
    if (postgresCarrier) {
      const profile = mapProfile(postgresCarrier, {
        sourceType: "postgres-fallback",
        liveUnavailable: true,
        message: "Live data is temporarily unavailable. Showing the most recent Postgres carrier record."
      });
      mergeInsurance(profile, await loadInsuranceSnapshot(dotNumber));
      return res.json(await finalizeTrialProfileResponse(req, res, profile));
    }

    res.status(404).json({
      error: "Carrier profile is not available right now.",
      message: "Live data is temporarily unavailable and no cached record was found."
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
        liveRefreshMessage = "Live SMS safety data is temporarily unavailable. Showing most recent cached record.";
        if (!profile) {
          const postgresCarrier = await findPostgresCarrier(dotNumber);
          if (postgresCarrier) {
            liveRefreshMessage = "Live SMS safety data is temporarily unavailable. Showing the most recent Postgres carrier record.";
            profile = mapProfile(postgresCarrier, {
              sourceType: "postgres-fallback",
              liveUnavailable: true,
              message: "Live SMS safety data is temporarily unavailable. Showing the most recent Postgres carrier record."
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
      sourceType: profile.sourceType
    });
  } catch (err) {
    console.error("Carrier intelligence safety error:", err.message);
    res.status(503).json({ error: "Safety/SMS data is temporarily unavailable." });
  }
}

export async function getCarrierIntelligenceLicensingInsurance(req, res) {
  const dotNumber = clean(req.params.dotNumber);
  try {
    const cached = await findCachedCarrier(dotNumber);
    let sourceType = cached ? "cached" : "live";
    const carrier = cached || await fetchAndCacheLiveCarrier(dotNumber).catch(async () => {
      sourceType = "postgres-fallback";
      return findPostgresCarrier(dotNumber);
    });
    if (!carrier) throw new Error("Carrier record unavailable");
    const profile = mapProfile(carrier, {
      sourceType,
      liveUnavailable: sourceType !== "live",
      message: sourceType === "postgres-fallback"
        ? "Live licensing data is temporarily unavailable. Showing the most recent Postgres carrier record."
        : ""
    });
    mergeInsurance(profile, await loadInsuranceSnapshot(dotNumber));
    res.json({
      dotNumber: profile.dotNumber,
      licensingInsurance: profile.licensingInsurance,
      lastUpdated: profile.lastUpdated,
      message: profile.message
    });
  } catch (err) {
    console.error("Carrier intelligence L&I error:", err.message);
    res.status(503).json({ error: "Licensing and insurance data is temporarily unavailable." });
  }
}
