import Carrier from "../models/Carrier.js";
import CarrierChange from "../models/CarrierChange.js";
import { isMongoConnected } from "../config/mongo.js";
import { query as dbQuery } from "../config/db.js";
import { fetchCarrierByDotOrMc } from "../services/fmcsaService.js";
import { enrichLeadRowsForResponse, enrichSelectedCarriers } from "../services/carrierFullEnrichmentService.js";
import { normalizeCanonicalCarrier } from "../services/carrierNormalizationService.js";
import { getPlanAccessSummary, requirePaidPlan } from "../utils/planAccess.js";
import { getTrialUsage, maskTrialCarrierContacts, maskTrialLeadContacts } from "../utils/trialAccess.js";
import { normalizeUSStateCode } from "../utils/usStates.js";
import {
  collectContactNumbersFromAllSources,
  getBestPrimaryPhone
} from "../utils/contactNumbers.js";

const PUBLIC_CONTACT_LOCK_MESSAGE = "Create an account to reveal carrier phone and email.";

function parseInteger(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(days) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

function dateString(value) {
  return value.toISOString().slice(0, 10);
}

function queryState(value) {
  const state = String(value || "").trim().toUpperCase();
  return state === "ANY" || state === "ALL" ? "" : state;
}

function clampDate(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function applyLeadDateWindowForPlan(req, leadType) {
  const access = getPlanAccessSummary(req.user);
  const query = { ...req.query };
  const today = addDays(0);

  if (leadType === "renewal" && access.renewalWindowDays) {
    const maxDate = addDays(access.renewalWindowDays);
    const requestedFrom = dateOrNull(query.from || query.renewalFrom || query.insuranceFrom) || today;
    const requestedTo = dateOrNull(query.to || query.renewalTo || query.insuranceTo) || maxDate;
    const from = clampDate(requestedFrom, today, maxDate);
    const to = clampDate(requestedTo, from, maxDate);

    query.from = dateString(from);
    query.renewalFrom = query.from;
    query.insuranceFrom = query.from;
    query.to = dateString(to);
    query.renewalTo = query.to;
    query.insuranceTo = query.to;
    query.days = String(access.renewalWindowDays);
  }

  if (leadType === "new" && access.leadHistoryDays) {
    const minDate = addDays(-access.leadHistoryDays);
    const requestedFrom = dateOrNull(query.from || query.startDate) || minDate;
    const requestedTo = dateOrNull(query.to || query.endDate) || today;
    const from = clampDate(requestedFrom, minDate, today);
    const to = clampDate(requestedTo, from, today);

    query.from = dateString(from);
    query.startDate = query.from;
    query.to = dateString(to);
    query.endDate = query.to;
    query.days = String(Math.max(Math.ceil((to.getTime() - from.getTime()) / 86400000), 1));
    query.daysBack = query.days;
  }

  req.query = query;
  return query;
}

function trialAccessForRequest(req, res) {
  return res.locals.trialAccess || getTrialUsage(req.user);
}

function shouldMaskPublicCarrierContacts(req) {
  return req.baseUrl?.includes("/public/carriers") && !req.user;
}

function maskPublicCarrierContacts(carrier) {
  const masked = maskTrialCarrierContacts(carrier, {
    hiddenLabel: "Create an account to reveal"
  });
  masked.contactLockedReason = PUBLIC_CONTACT_LOCK_MESSAGE;
  return masked;
}

function maskTrialResults(items, trialAccess) {
  if (!trialAccess.active) return items;
  return items.map((item) => maskTrialLeadContacts(item));
}

function buildTrialLeadMessage(baseMessage, trialAccess) {
  if (!trialAccess.active) return baseMessage;
  const notice = `Trial access shows up to ${trialAccess.limits.searchResults} results per search. Profile views left today: ${trialAccess.remaining.profileViews}. Contact views left today: ${trialAccess.remaining.contactViews}. CRM saves left today: ${trialAccess.remaining.savedProspects}.`;
  return [baseMessage, notice].filter(Boolean).join(" ");
}

function sortDirection(value, fallback = -1) {
  if (String(value || "").toLowerCase() === "asc") return 1;
  if (String(value || "").toLowerCase() === "desc") return -1;
  return fallback;
}

function compactDate(value) {
  const date = dateOrNull(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function formatCensusDate(value) {
  if (!value) return "";
  const compact = String(value).trim();
  if (/^\d{8}/.test(compact)) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }
  const date = dateOrNull(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function carrierToApi(carrier, { includeRaw = false } = {}) {
  if (!carrier) return null;
  const plain = typeof carrier.toObject === "function" ? carrier.toObject() : carrier;
  const address = plain.address || {};
  const census = plain.raw?.census || {};
  const addressText = address.raw || [address.street, address.city, address.state, address.zip].filter(Boolean).join(", ");
  const docketNumber = plain.docketNumber
    || plain.raw?.motusRegister?.authorities?.[0]?.docketNumber
    || [census.docket1prefix, census.docket1].filter(Boolean).join("");
  const companyOfficer1 = plain.companyOfficer1 || census.company_officer_1 || "";
  const companyOfficer2 = plain.companyOfficer2 || census.company_officer_2 || "";
  const cellPhone = plain.cellPhone || census.cell_phone || "";
  const fax = plain.fax || plain.faxNumber || census.fax || census.fax_number || "";
  const smsSafety = plain.smsSafety || plain.raw?.smsSafety || {};
  const saferData = plain.raw?.saferData || {};
  const canonical = normalizeCanonicalCarrier(plain);
  const contactNumbers = collectContactNumbersFromAllSources({
    carrierProfile: plain,
    motusRecord: plain.raw?.motusProfile || plain.raw?.motusRegister,
    fmcsaRecord: plain.raw?.liveCarrier || plain.raw?.qcmobileDetails || plain,
    saferRecord: plain.raw?.saferData,
    dataTransportRecord: census,
    cachedDatabaseRecord: plain,
    enrichmentRecord: canonical
  });
  const primaryContact = getBestPrimaryPhone(contactNumbers);
  const primaryPhone = primaryContact?.type === "fax" ? canonical.phone || plain.phoneNumber : primaryContact?.number || canonical.phone || plain.phoneNumber;

  return {
    id: String(plain._id),
    dotNumber: plain.dotNumber,
    dot: plain.dotNumber,
    legalName: canonical.legalName || plain.legalName,
    dbaName: canonical.dbaName || plain.dbaName,
    carrierName: canonical.carrierName || plain.legalName || plain.dbaName || "Unknown Carrier",
    address: canonical.physicalAddress || addressText,
    addressParts: address,
    state: canonical.physicalState || address.state || "",
    phoneNumber: primaryPhone,
    phone: primaryPhone,
    cellPhone,
    fax,
    faxNumber: fax,
    contactNumbers,
    email: canonical.email || plain.email,
    companyOfficer1,
    companyOfficer2,
    companyOfficerTitle: plain.companyOfficerTitle || "",
    companyRep: companyOfficer1,
    docketNumber,
    safetyRating: plain.safetyRating,
    authorityStatus: plain.authorityStatus,
    operatingStatus: plain.operatingStatus,
    insuranceExpirationDate: plain.insuranceExpirationDate,
    insuranceExpiration: plain.insuranceExpirationDate
      ? new Date(plain.insuranceExpirationDate).toISOString().slice(0, 10)
      : "",
    insuranceEffectiveDate: plain.insuranceEffectiveDate
      ? new Date(plain.insuranceEffectiveDate).toISOString().slice(0, 10)
      : "",
    insuranceCancelDate: plain.insuranceCancellationDate || plain.insuranceExpirationDate
      ? new Date(plain.insuranceCancellationDate || plain.insuranceExpirationDate).toISOString().slice(0, 10)
      : "",
    fmcsaInsuranceCancellationDate: plain.insuranceExpirationDate
      ? new Date(plain.insuranceExpirationDate).toISOString().slice(0, 10)
      : "",
    insuranceCompany: plain.insuranceCompany || "",
    insurancePolicyNumber: plain.insurancePolicyNumber || "",
    insuranceFormCode: plain.insuranceFormCode || "",
    insuranceType: plain.insuranceType || "",
    fleetSize: plain.fleetSize,
    vehicleCount: plain.fleetSize,
    driverCount: plain.driverCount,
    cdlDrivers: plain.cdlDrivers,
    tractorCount: plain.tractorCount,
    trailerCount: plain.trailerCount,
    straightTruckCount: plain.straightTruckCount,
    entityType: plain.entityType || "",
    carrierOperation: plain.carrierOperation || "",
    mcs150Date: formatCensusDate(plain.mcs150Date || census.mcs150_date),
    mcs150_date: formatCensusDate(plain.mcs150Date || census.mcs150_date),
    mcs150Mileage: plain.mcs150Mileage || census.mcs150_mileage || census.mileage || "",
    mcs150_mileage: plain.mcs150Mileage || census.mcs150_mileage || census.mileage || "",
    cargoTypes: plain.cargoTypes || [],
    cargo: (plain.cargoTypes || []).join(", "),
    totalInspections: saferData.totalInspections || smsSafety.inspections || plain.totalInspections || "",
    crashTotal: saferData.crashTotal || plain.crashTotal || "",
    driverOosRate: smsSafety.oosRates?.driver || null,
    vehicleOosRate: smsSafety.oosRates?.vehicle || null,
    hazmatOosRate: smsSafety.oosRates?.hazmat || null,
    smsSafety,
    safety: {
      totalInspections: saferData.totalInspections || smsSafety.inspections || plain.totalInspections || "",
      crashTotal: saferData.crashTotal || plain.crashTotal || "",
      oosRates: smsSafety.oosRates || null,
      smsProfileAvailable: Boolean(smsSafety && Object.keys(smsSafety).length),
      source: smsSafety.source || saferData.source || ""
    },
    dateCreated: plain.dateCreated,
    firstSeenAt: plain.firstSeenAt,
    firstImportedAt: plain.firstImportedAt,
    isNewLead: plain.isNewLead,
    newLeadSince: plain.newLeadSince,
    lastUpdated: plain.lastUpdated,
    source: plain.source || "database",
    dataSourceLabel: "Saved Database",
    liveFmcsaAttempted: false,
    liveFmcsaSuccess: false,
    fallbackReason: "Database search result",
    ...(includeRaw ? { raw: plain.raw } : {})
  };
}

function carrierToProspectLead(carrier) {
  const plain = typeof carrier.toObject === "function" ? carrier.toObject() : carrier;
  const apiCarrier = carrierToApi(plain);
  const address = plain.address || {};

  return {
    id: apiCarrier.id,
    carrier_name: apiCarrier.carrierName,
    dot_number: apiCarrier.dotNumber,
    mc_number: apiCarrier.docketNumber || "",
    dot: apiCarrier.dotNumber,
    mc: apiCarrier.docketNumber || "",
    hq_city: address.city || "",
    hq_state: address.state || "",
    hq_zip: address.zip || "",
    physicalAddress: apiCarrier.address,
    company_rep: apiCarrier.companyOfficer1 || "",
    company_rep2: apiCarrier.companyOfficer2 || "",
    safety_rating: apiCarrier.safetyRating,
    insurance_expiration: apiCarrier.insuranceExpiration,
    insurance_company: apiCarrier.insuranceCompany,
    insurance_policy_number: apiCarrier.insurancePolicyNumber,
    insurance_type: apiCarrier.insuranceType,
    vehicle_count: apiCarrier.vehicleCount,
    driver_count: apiCarrier.driverCount,
    mcs150_date: apiCarrier.mcs150Date || "",
    mcs150Date: apiCarrier.mcs150Date || "",
    mcs150_mileage: apiCarrier.mcs150Mileage || "",
    mcs150Mileage: apiCarrier.mcs150Mileage || "",
    email: apiCarrier.email,
    phone: apiCarrier.phone,
    cell_phone: apiCarrier.cellPhone || "",
    website: "",
    email_source: apiCarrier.email ? apiCarrier.source : "",
    email_verified: false,
    data_completeness_percent: [apiCarrier.email, apiCarrier.phone, apiCarrier.address].filter(Boolean).length * 25,
    last_updated: apiCarrier.lastUpdated,
    cargo_hauled: apiCarrier.cargo || "Not listed",
    cargoHauled: apiCarrier.cargo || "Not listed",
    source: "database",
    dataSourceLabel: "Saved Database",
    liveFmcsaAttempted: false,
    liveFmcsaSuccess: false,
    fallbackReason: "Database search result"
  };
}

function carrierToNewVentureLead(carrier) {
  const plain = typeof carrier.toObject === "function" ? carrier.toObject() : carrier;
  const apiCarrier = carrierToApi(plain);
  const census = plain.raw?.census || {};
  const address = plain.address || {};
  const isApprovedMotus = plain.raw?.motusRegister?.approved === true;
  const newLeadDate = isApprovedMotus
    ? (plain.newLeadSince || plain.dateCreated || plain.firstSeenAt || plain.firstImportedAt)
    : (plain.dateCreated || plain.firstSeenAt || plain.firstImportedAt || plain.newLeadSince);

  return {
    id: apiCarrier.id,
    dotNumber: apiCarrier.dotNumber,
    mcNumber: apiCarrier.docketNumber || "",
    carrierName: apiCarrier.carrierName,
    addDate: formatCensusDate(newLeadDate),
    newDotDate: formatCensusDate(newLeadDate),
    registrationDate: formatCensusDate(plain.dateCreated),
    firstSeenAt: formatCensusDate(plain.firstSeenAt || plain.firstImportedAt || plain.newLeadSince),
    firstImportedAt: formatCensusDate(plain.firstImportedAt || plain.firstSeenAt || plain.newLeadSince),
    mcs150Date: apiCarrier.mcs150Date || formatCensusDate(census.mcs150_date),
    mcs150_date: apiCarrier.mcs150Date || formatCensusDate(census.mcs150_date),
    mcs150Mileage: apiCarrier.mcs150Mileage || census.mcs150_mileage || census.mileage || "",
    mcs150_mileage: apiCarrier.mcs150Mileage || census.mcs150_mileage || census.mileage || "",
    state: address.state || census.phy_state || "",
    city: address.city || census.phy_city || "",
    companyRep: apiCarrier.companyOfficer1 || "",
    companyRep2: apiCarrier.companyOfficer2 || "",
    physicalAddress: apiCarrier.address,
    mailingAddress: [
      census.carrier_mailing_street,
      census.carrier_mailing_city,
      census.carrier_mailing_state,
      census.carrier_mailing_zip
    ].filter(Boolean).join(", "),
    carrierOperation: apiCarrier.carrierOperation || census.carrier_operation || "",
    businessType: apiCarrier.entityType || census.business_org_desc || "",
    fleetSize: apiCarrier.fleetSize,
    powerUnits: apiCarrier.vehicleCount,
    truckUnits: apiCarrier.tractorCount ?? parseInteger(census.truck_units, null),
    tractorCount: apiCarrier.tractorCount,
    trailerCount: apiCarrier.trailerCount,
    straightTruckCount: apiCarrier.straightTruckCount,
    busUnits: parseInteger(census.bus_units, null),
    drivers: apiCarrier.driverCount,
    cdlDrivers: apiCarrier.cdlDrivers ?? parseInteger(census.total_cdl, null),
    hazmat: census.hm_ind === "Y",
    email: apiCarrier.email,
    emailSource: apiCarrier.email ? "FMCSA Company Census File / MCS-150 self-reported" : "",
    emailVerified: false,
    verificationProvider: "",
    phone: apiCarrier.phone,
    cellPhone: apiCarrier.cellPhone || "",
    cargoHauled: apiCarrier.cargo || "Not listed",
    cargo_hauled: apiCarrier.cargo || "Not listed",
    source: "database",
    dataSourceLabel: "Saved Database",
    liveFmcsaAttempted: false,
    liveFmcsaSuccess: false,
    fallbackReason: "Database search result"
  };
}

function buildCarrierQuery(query, options = {}) {
  const { includeInsuranceDates = true } = options;
  const filter = {};
  const q = String(query.q || query.search || query.name || "").trim();
  const dot = String(query.dot || query.dotNumber || "").trim();
  const state = queryState(query.state);
  const authorityStatus = String(query.authorityStatus || query.status || "").trim();
  const safetyRating = String(query.safetyRating || "").trim();
  const insuranceFrom = includeInsuranceDates
    ? dateOrNull(query.insuranceFrom || query.renewalFrom || query.from)
    : null;
  const insuranceTo = includeInsuranceDates
    ? dateOrNull(query.insuranceTo || query.renewalTo || query.to)
    : null;
  const minFleetSize = parseInteger(query.minFleetSize, null);
  const maxFleetSize = parseInteger(query.maxFleetSize, null);
  const hasEmail = String(query.hasEmail || "").toLowerCase();
  const cargoType = String(query.cargoType || query.cargo || "").trim();

  if (dot) filter.dotNumber = dot;
  if (state) filter["address.state"] = state;
  if (authorityStatus) filter.authorityStatus = new RegExp(authorityStatus, "i");
  if (safetyRating) filter.safetyRating = new RegExp(safetyRating, "i");
  if (hasEmail === "true" || hasEmail === "1" || hasEmail === "yes") filter.email = { $nin: ["", null] };
  if (hasEmail === "false" || hasEmail === "0" || hasEmail === "no") filter.$or = [{ email: "" }, { email: null }];
  if (cargoType) filter.cargoTypes = new RegExp(cargoType, "i");

  if (minFleetSize !== null || maxFleetSize !== null) {
    filter.fleetSize = {};
    if (minFleetSize !== null) filter.fleetSize.$gte = minFleetSize;
    if (maxFleetSize !== null) filter.fleetSize.$lte = maxFleetSize;
  }

  if (insuranceFrom || insuranceTo) {
    filter.insuranceExpirationDate = {};
    if (insuranceFrom) filter.insuranceExpirationDate.$gte = insuranceFrom;
    if (insuranceTo) filter.insuranceExpirationDate.$lte = insuranceTo;
  }

  if (q) {
    filter.$or = [
      { legalName: new RegExp(q, "i") },
      { dbaName: new RegExp(q, "i") },
      { dotNumber: q }
    ];
  }

  return filter;
}

function addPgCondition(where, values, sql, value) {
  values.push(value);
  where.push(sql.replaceAll("?", `$${values.length}`));
}

function buildPostgresCarrierQuery(query, options = {}) {
  const { includeInsuranceDates = true } = options;
  const where = [];
  const values = [];
  const q = String(query.q || query.search || query.name || "").trim();
  const dot = String(query.dot || query.dotNumber || "").trim();
  const state = queryState(query.state);
  const authorityStatus = String(query.authorityStatus || query.status || "").trim();
  const safetyRating = String(query.safetyRating || "").trim();
  const insuranceFrom = includeInsuranceDates
    ? dateOrNull(query.insuranceFrom || query.renewalFrom || query.from)
    : null;
  const insuranceTo = includeInsuranceDates
    ? dateOrNull(query.insuranceTo || query.renewalTo || query.to)
    : null;
  const minFleetSize = parseInteger(query.minFleetSize, null);
  const maxFleetSize = parseInteger(query.maxFleetSize, null);
  const hasEmail = String(query.hasEmail || "").toLowerCase();
  const cargoType = String(query.cargoType || query.cargo || "").trim();

  if (dot) addPgCondition(where, values, "c.dot_number = ?", dot);
  if (state) addPgCondition(where, values, "UPPER(c.hq_state) = ?", state);
  if (authorityStatus) addPgCondition(where, values, "c.authority_status ILIKE ?", `%${authorityStatus}%`);
  if (safetyRating) addPgCondition(where, values, "c.safety_rating ILIKE ?", `%${safetyRating}%`);
  if (hasEmail === "true" || hasEmail === "1" || hasEmail === "yes") {
    where.push("COALESCE(c.email, e.email) IS NOT NULL");
  }
  if (hasEmail === "false" || hasEmail === "0" || hasEmail === "no") {
    where.push("COALESCE(c.email, e.email) IS NULL");
  }
  if (minFleetSize !== null) addPgCondition(where, values, "COALESCE(c.vehicle_count, 0) >= ?", minFleetSize);
  if (maxFleetSize !== null) addPgCondition(where, values, "COALESCE(c.vehicle_count, 0) <= ?", maxFleetSize);
  if (cargoType) addPgCondition(where, values, "COALESCE(c.cargo_types::text, c.cargo_insurance::text, '') ILIKE ?", `%${cargoType}%`);
  if (insuranceFrom) addPgCondition(where, values, "c.insurance_expiration >= ?", insuranceFrom);
  if (insuranceTo) addPgCondition(where, values, "c.insurance_expiration <= ?", insuranceTo);

  if (q) {
    values.push(`%${q}%`);
    const likeParam = `$${values.length}`;
    values.push(q);
    const exactParam = `$${values.length}`;
    where.push(`(
      c.carrier_name ILIKE ${likeParam}
      OR c.legal_name ILIKE ${likeParam}
      OR c.dba_name ILIKE ${likeParam}
      OR c.mc_number ILIKE ${likeParam}
      OR c.dot_number = ${exactParam}
    )`);
  }

  return {
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    values
  };
}

function postgresCarrierSelect() {
  return `SELECT
    c.id,
    c.dot_number,
    c.mc_number,
    c.carrier_name,
    c.legal_name,
    c.dba_name,
    c.entity_type,
    c.safety_rating,
    c.safety_rating_date,
    c.insurance_expiration,
    c.insurance_company,
    c.insurance_filing_status,
    c.insurance_policy_number,
    c.cargo_insurance,
    c.vehicle_count,
    c.driver_count,
    c.mcs150_date,
    c.mcs150_mileage,
    c.carrier_operation_type,
    c.hq_address,
    c.hq_city,
    c.hq_state,
    c.hq_zip,
    c.mailing_address,
    c.mailing_city,
    c.mailing_state,
    c.mailing_zip,
    COALESCE(c.phone, e.phone) AS phone,
    COALESCE(c.email, e.email) AS email,
    COALESCE(c.website, e.website) AS website,
    c.cargo_types,
    c.operating_status,
    c.authority_status,
    c.safety_data,
    c.contact_enrichment_data,
    c.created_at,
    c.last_updated
  FROM carriers c
  LEFT JOIN enriched_carrier_data e ON e.carrier_id = c.id`;
}

function pgDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function pgCargo(row) {
  return Array.isArray(row.cargo_types) && row.cargo_types.length
    ? row.cargo_types.join(", ")
    : "Not listed";
}

function compactDateNumber(value) {
  const date = dateOrNull(value);
  return date ? Number(date.toISOString().slice(0, 10).replace(/-/g, "")) : null;
}

function normalizeDotNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const normalized = String(Number(digits));
  return normalized === "0" ? "" : normalized;
}

function dateOnly(value) {
  const date = dateOrNull(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function addYearsUtc(value, years) {
  const date = dateOrNull(value);
  if (!date) return null;
  const next = new Date(date.getTime());
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

function usDateOrNull(value) {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, month, day, year] = match;
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return dateOrNull(text);
}

function monthKeysBetween(from, to) {
  const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  const keys = [];
  for (const cursor = start; cursor <= end && keys.length < 13; cursor.setUTCMonth(cursor.getUTCMonth() + 1)) {
    keys.push({
      month: String(cursor.getUTCMonth() + 1).padStart(2, "0"),
      year: cursor.getUTCFullYear()
    });
  }
  return keys;
}

function mapFmcsaCensusLead(row = {}) {
  const powerUnits = parseInteger(row.power_units, null);
  const fleetSize = parseInteger(row.fleetsize, null) ?? powerUnits ?? parseInteger(row.truck_units, null);
  const contactNumbers = collectContactNumbersFromAllSources({
    dataTransportRecord: row,
    leadSearchResult: row
  });
  const primaryContact = getBestPrimaryPhone(contactNumbers);
  const primaryPhone = primaryContact?.type === "fax" ? row.phone || row.cell_phone || "" : primaryContact?.number || row.phone || row.cell_phone || "";
  return {
    dotNumber: row.dot_number || "",
    mcNumber: "",
    carrierName: row.legal_name || "Unknown Carrier",
    addDate: formatCensusDate(row.add_date),
    mcs150Date: formatCensusDate(row.mcs150_date),
    mcs150_date: formatCensusDate(row.mcs150_date),
    mcs150Mileage: row.mcs150_mileage || row.mileage || "",
    mcs150_mileage: row.mcs150_mileage || row.mileage || "",
    state: row.phy_state || "",
    city: row.phy_city || "",
    physicalAddress: [row.phy_street, row.phy_city, row.phy_state, row.phy_zip].filter(Boolean).join(", "),
    mailingAddress: [
      row.carrier_mailing_street,
      row.carrier_mailing_city,
      row.carrier_mailing_state,
      row.carrier_mailing_zip
    ].filter(Boolean).join(", "),
    carrierOperation: row.carrier_operation || "",
    businessType: row.business_org_desc || "",
    fleetSize,
    powerUnits,
    truckUnits: parseInteger(row.truck_units, null),
    busUnits: parseInteger(row.bus_units, null),
    drivers: parseInteger(row.total_drivers, null),
    cdlDrivers: parseInteger(row.total_cdl, null),
    hazmat: row.hm_ind === "Y",
    email: row.email_address || "",
    emailSource: row.email_address ? "FMCSA Company Census File / MCS-150 self-reported" : "",
    emailVerified: false,
    verificationProvider: "",
    phone: primaryPhone,
    phoneNumber: primaryPhone,
    cellPhone: row.cell_phone || "",
    fax: row.fax || "",
    faxNumber: row.fax || "",
    contactNumbers,
    cargoHauled: "Not listed",
    cargo_hauled: "Not listed"
  };
}

async function fetchFmcsaCensusNewLeads(filters = {}) {
  const params = new URLSearchParams();
  params.set("$select", [
    "dot_number",
    "legal_name",
    "add_date",
    "mcs150_date",
    "mcs150_mileage",
    "phy_street",
    "phy_city",
    "phy_state",
    "phy_zip",
    "carrier_mailing_street",
    "carrier_mailing_city",
    "carrier_mailing_state",
    "carrier_mailing_zip",
    "carrier_operation",
    "business_org_desc",
    "phone",
    "cell_phone",
    "fax",
    "email_address",
    "fleetsize",
    "power_units",
    "truck_units",
    "bus_units",
    "total_drivers",
    "total_cdl",
    "hm_ind"
  ].join(","));
  params.set("$order", "add_date DESC");
  const limit = Math.min(Math.max(parseInteger(filters.limit, 100), 1), 5000);
  const page = Math.max(parseInteger(filters.page, 1), 1);
  params.set("$limit", String(limit));
  params.set("$offset", String((page - 1) * limit));

  const where = [];
  const from = compactDateNumber(filters.from);
  const to = compactDateNumber(filters.to);
  const state = queryState(filters.state);

  if (from) where.push(`add_date >= '${from}'`);
  if (to) where.push(`add_date <= '${to}'`);
  if (state) where.push(`upper(phy_state) = '${state.replace(/'/g, "''")}'`);
  if (where.length) params.set("$where", where.join(" AND "));

  const url = `https://data.transportation.gov/resource/az4n-8mr2.json?${params.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`FMCSA census returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
    }
    const rows = await response.json();
    return Array.isArray(rows) ? rows.map(mapFmcsaCensusLead) : [];
  } finally {
    clearTimeout(timeout);
  }
}

function postgresCarrierToApi(row = {}) {
  const address = [row.hq_address, row.hq_city, row.hq_state, row.hq_zip].filter(Boolean).join(", ");
  const safetyData = row.safety_data || {};
  const contactNumbers = collectContactNumbersFromAllSources({
    cachedDatabaseRecord: row,
    carrierProfile: row
  });
  const primaryContact = getBestPrimaryPhone(contactNumbers);
  const primaryPhone = primaryContact?.type === "fax" ? row.phone || "" : primaryContact?.number || row.phone || "";
  return {
    id: String(row.id),
    dotNumber: row.dot_number,
    dot: row.dot_number,
    legalName: row.legal_name || row.carrier_name,
    dbaName: row.dba_name || "",
    carrierName: row.carrier_name || row.legal_name || "Unknown Carrier",
    address,
    addressParts: {
      street: row.hq_address || "",
      city: row.hq_city || "",
      state: row.hq_state || "",
      zip: row.hq_zip || ""
    },
    state: row.hq_state || "",
    phoneNumber: primaryPhone,
    phone: primaryPhone,
    fax: row.fax || "",
    faxNumber: row.fax || "",
    contactNumbers,
    email: row.email || "",
    website: row.website || "",
    docketNumber: row.mc_number || "",
    safetyRating: row.safety_rating || "",
    authorityStatus: row.authority_status || "",
    operatingStatus: row.operating_status || "",
    insuranceExpirationDate: row.insurance_expiration,
    insuranceExpiration: pgDate(row.insurance_expiration),
    insuranceCancelDate: pgDate(row.insurance_expiration),
    fmcsaInsuranceCancellationDate: pgDate(row.insurance_expiration),
    insuranceEffectiveDate: pgDate(row.insurance_effective_date),
    insuranceCompany: row.insurance_company || "",
    insurancePolicyNumber: row.insurance_policy_number || "",
    insuranceFilingStatus: row.insurance_filing_status || "",
    insuranceType: row.insurance_filing_status || "",
    filingType: row.insurance_filing_status || "",
    fleetSize: row.vehicle_count,
    vehicleCount: row.vehicle_count,
    driverCount: row.driver_count,
    mcs150Date: pgDate(row.mcs150_date),
    mcs150_date: pgDate(row.mcs150_date),
    mcs150Mileage: row.mcs150_mileage || "",
    mcs150_mileage: row.mcs150_mileage || "",
    cargoTypes: row.cargo_types || [],
    cargo: pgCargo(row),
    totalInspections: safetyData.totalInspections || safetyData.inspections || "",
    crashTotal: safetyData.crashTotal || safetyData.crashes?.total || "",
    driverOosRate: safetyData.driverOosRate || safetyData.oosRates?.driver || null,
    vehicleOosRate: safetyData.vehicleOosRate || safetyData.oosRates?.vehicle || null,
    hazmatOosRate: safetyData.hazmatOosRate || safetyData.oosRates?.hazmat || null,
    totalViolations: safetyData.totalViolations || "",
    oosViolations: safetyData.oosViolations || "",
    safety: safetyData,
    firstSeenAt: pgDate(row.created_at),
    firstImportedAt: pgDate(row.created_at),
    newLeadSince: pgDate(row.created_at),
    lastUpdated: pgDate(row.last_updated),
    source: "Postgres carrier database"
  };
}

function postgresCarrierToProspectLead(row = {}) {
  const apiCarrier = postgresCarrierToApi(row);
  return {
    id: apiCarrier.id,
    carrier_name: apiCarrier.carrierName,
    dot_number: apiCarrier.dotNumber,
    mc_number: apiCarrier.docketNumber || "",
    dot: apiCarrier.dotNumber,
    mc: apiCarrier.docketNumber || "",
    hq_city: row.hq_city || "",
    hq_state: row.hq_state || "",
    hq_zip: row.hq_zip || "",
    safety_rating: apiCarrier.safetyRating,
    insurance_expiration: apiCarrier.insuranceExpiration,
    insuranceCancelDate: apiCarrier.insuranceCancelDate,
    fmcsaInsuranceCancellationDate: apiCarrier.fmcsaInsuranceCancellationDate,
    insuranceEffectiveDate: apiCarrier.insuranceEffectiveDate,
    insurance_company: apiCarrier.insuranceCompany,
    insurance_policy_number: apiCarrier.insurancePolicyNumber,
    insurance_filing_status: apiCarrier.insuranceFilingStatus,
    insurance_type: apiCarrier.insuranceType,
    filingType: apiCarrier.filingType,
    vehicle_count: apiCarrier.vehicleCount,
    driver_count: apiCarrier.driverCount,
    mcs150_date: apiCarrier.mcs150Date || "",
    mcs150Date: apiCarrier.mcs150Date || "",
    mcs150_mileage: apiCarrier.mcs150Mileage || "",
    mcs150Mileage: apiCarrier.mcs150Mileage || "",
    email: apiCarrier.email,
    phone: apiCarrier.phone,
    website: apiCarrier.website,
    last_updated: apiCarrier.lastUpdated,
    addDate: apiCarrier.firstSeenAt || apiCarrier.firstImportedAt || apiCarrier.newLeadSince || "",
    firstSeenAt: apiCarrier.firstSeenAt || "",
    firstImportedAt: apiCarrier.firstImportedAt || "",
    cargo_hauled: apiCarrier.cargo || "Not listed",
    cargoHauled: apiCarrier.cargo || "Not listed"
  };
}

async function fetchJsonFromSocrata(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Socrata returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
    }
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchInsuranceRowsForWindow({ from, to, limit }) {
  const months = monthKeysBetween(from, to);
  const selected = [
    "docket_number",
    "dot_number",
    "cancl_effective_date",
    "effective_date",
    "name_company",
    "policy_no",
    "ins_form_code",
    "mod_col_1"
  ].join(",");
  const pageSize = Number(process.env.FMCSA_INSURANCE_SEARCH_PAGE_SIZE || 5000);
  const maxRows = Math.max(limit * 1200, 10000);
  const results = [];

  for (const { month, year } of months) {
    for (let offset = 0; results.length < maxRows; offset += pageSize) {
      const params = new URLSearchParams();
      params.set("$select", selected);
      params.set("$where", `cancl_effective_date like '${month}/%/${year}'`);
      params.set("$order", "cancl_effective_date ASC");
      params.set("$limit", String(pageSize));
      params.set("$offset", String(offset));

      const rows = await fetchJsonFromSocrata(`https://data.transportation.gov/resource/qh9u-swkp.json?${params.toString()}`);
      if (!rows.length) break;

      for (const row of rows) {
        const expirationDate = usDateOrNull(row.cancl_effective_date);
        const dot_number = normalizeDotNumber(row.dot_number);
        if (!dot_number || !expirationDate || expirationDate < from || expirationDate > to) continue;
        results.push({
          ...row,
          dot_number,
          expirationDate,
          effectiveDate: usDateOrNull(row.effective_date)
        });
      }

      if (rows.length < pageSize) break;
    }
  }

  return results;
}

async function fetchEstimatedInsuranceRenewalRows({ from, to, limit }) {
  const priorFrom = addYearsUtc(from, -1);
  const priorTo = addYearsUtc(to, -1);
  if (!priorFrom || !priorTo) return [];

  const months = monthKeysBetween(priorFrom, priorTo);
  const selected = [
    "docket_number",
    "dot_number",
    "cancl_effective_date",
    "effective_date",
    "name_company",
    "policy_no",
    "ins_form_code",
    "mod_col_1"
  ].join(",");
  const pageSize = Number(process.env.FMCSA_INSURANCE_SEARCH_PAGE_SIZE || 5000);
  const maxRows = Math.max(limit * 1200, 10000);
  const results = [];

  for (const { month, year } of months) {
    for (let offset = 0; results.length < maxRows; offset += pageSize) {
      const params = new URLSearchParams();
      params.set("$select", selected);
      params.set("$where", `effective_date like '${month}/%/${year}'`);
      params.set("$order", "effective_date ASC");
      params.set("$limit", String(pageSize));
      params.set("$offset", String(offset));

      const rows = await fetchJsonFromSocrata(`https://data.transportation.gov/resource/qh9u-swkp.json?${params.toString()}`);
      if (!rows.length) break;

      for (const row of rows) {
        const effectiveDate = usDateOrNull(row.effective_date);
        const estimatedRenewalDate = addYearsUtc(effectiveDate, 1);
        const dot_number = normalizeDotNumber(row.dot_number);
        if (!dot_number || !effectiveDate || !estimatedRenewalDate) continue;
        if (estimatedRenewalDate < from || estimatedRenewalDate > to) continue;

        results.push({
          ...row,
          dot_number,
          effectiveDate,
          estimatedRenewal: true,
          estimatedRenewalBasis: "prior-year-effective-date",
          expirationDate: estimatedRenewalDate
        });
      }

      if (rows.length < pageSize) break;
    }
  }

  return results;
}

async function fetchCensusRowsForDots(dotNumbers, state = "") {
  if (!dotNumbers.length) return [];
  const params = new URLSearchParams();
  params.set("$select", [
    "dot_number",
    "legal_name",
    "dba_name",
    "phy_street",
    "phy_city",
    "phy_state",
    "phy_zip",
    "carrier_mailing_street",
    "carrier_mailing_city",
    "carrier_mailing_state",
    "carrier_mailing_zip",
    "phone",
    "cell_phone",
    "fax",
    "email_address",
    "mcs150_date",
    "mcs150_mileage",
    "power_units",
    "truck_units",
    "total_drivers",
    "total_cdl",
    "carrier_operation",
    "business_org_desc",
    "hm_ind"
  ].join(","));
  const where = [`dot_number in(${dotNumbers.map((dot) => `'${dot}'`).join(",")})`];
  if (state) where.push(`upper(phy_state) = '${state.replace(/'/g, "''")}'`);
  params.set("$where", where.join(" AND "));
  params.set("$limit", String(dotNumbers.length));

  return fetchJsonFromSocrata(`https://data.transportation.gov/resource/az4n-8mr2.json?${params.toString()}`);
}

async function upsertPostgresRenewalCarrier({ insurance, census }) {
  const dotNumber = normalizeDotNumber(insurance.dot_number || census.dot_number);
  if (!dotNumber) return null;

  const carrierName = census.legal_name || `DOT ${dotNumber}`;
  const cargoTypes = [];
  const result = await dbQuery(
    `INSERT INTO carriers (
       dot_number, mc_number, carrier_name, legal_name, dba_name,
       business_type, carrier_operation_type,
       hq_address, hq_city, hq_state, hq_zip,
       mailing_address, mailing_city, mailing_state, mailing_zip,
       phone, email, vehicle_count, driver_count, mcs150_date, mcs150_mileage,
       insurance_expiration, insurance_company, insurance_policy_number,
       insurance_filing_status, cargo_types, hazmat_endorsement, last_updated
     )
     VALUES (
       $1, $2, $3, $4, $5,
       $6, $7,
       $8, $9, $10, $11,
       $12, $13, $14, $15,
       $16, $17, $18, $19,
       $20, $21,
       $22, $23, $24,
       $25, $26, $27, NOW()
     )
     ON CONFLICT (dot_number) DO UPDATE
       SET mc_number = COALESCE(EXCLUDED.mc_number, carriers.mc_number),
           carrier_name = COALESCE(EXCLUDED.carrier_name, carriers.carrier_name),
           legal_name = COALESCE(EXCLUDED.legal_name, carriers.legal_name),
           dba_name = COALESCE(EXCLUDED.dba_name, carriers.dba_name),
           business_type = COALESCE(EXCLUDED.business_type, carriers.business_type),
           carrier_operation_type = COALESCE(EXCLUDED.carrier_operation_type, carriers.carrier_operation_type),
           hq_address = COALESCE(EXCLUDED.hq_address, carriers.hq_address),
           hq_city = COALESCE(EXCLUDED.hq_city, carriers.hq_city),
           hq_state = COALESCE(EXCLUDED.hq_state, carriers.hq_state),
           hq_zip = COALESCE(EXCLUDED.hq_zip, carriers.hq_zip),
           mailing_address = COALESCE(EXCLUDED.mailing_address, carriers.mailing_address),
           mailing_city = COALESCE(EXCLUDED.mailing_city, carriers.mailing_city),
           mailing_state = COALESCE(EXCLUDED.mailing_state, carriers.mailing_state),
           mailing_zip = COALESCE(EXCLUDED.mailing_zip, carriers.mailing_zip),
           phone = COALESCE(EXCLUDED.phone, carriers.phone),
           email = COALESCE(EXCLUDED.email, carriers.email),
           vehicle_count = COALESCE(EXCLUDED.vehicle_count, carriers.vehicle_count),
           driver_count = COALESCE(EXCLUDED.driver_count, carriers.driver_count),
           mcs150_date = COALESCE(EXCLUDED.mcs150_date, carriers.mcs150_date),
           mcs150_mileage = COALESCE(EXCLUDED.mcs150_mileage, carriers.mcs150_mileage),
           insurance_expiration = COALESCE(EXCLUDED.insurance_expiration, carriers.insurance_expiration),
           insurance_company = COALESCE(EXCLUDED.insurance_company, carriers.insurance_company),
           insurance_policy_number = COALESCE(EXCLUDED.insurance_policy_number, carriers.insurance_policy_number),
           insurance_filing_status = COALESCE(EXCLUDED.insurance_filing_status, carriers.insurance_filing_status),
           cargo_types = CASE WHEN cardinality(EXCLUDED.cargo_types) > 0 THEN EXCLUDED.cargo_types ELSE carriers.cargo_types END,
           hazmat_endorsement = COALESCE(EXCLUDED.hazmat_endorsement, carriers.hazmat_endorsement),
           last_updated = NOW()
     RETURNING *`,
    [
      dotNumber,
      insurance.docket_number || null,
      carrierName,
      census.legal_name || carrierName,
      census.dba_name || "",
      census.business_org_desc || "",
      census.carrier_operation || "",
      census.phy_street || "",
      census.phy_city || "",
      census.phy_state || "",
      census.phy_zip || "",
      census.carrier_mailing_street || "",
      census.carrier_mailing_city || "",
      census.carrier_mailing_state || "",
      census.carrier_mailing_zip || "",
      census.phone || census.cell_phone || "",
      String(census.email_address || "").toLowerCase(),
      parseInteger(census.power_units || census.truck_units, null),
      parseInteger(census.total_drivers || census.total_cdl, null),
      dateOnly(formatCensusDate(census.mcs150_date)) || null,
      parseInteger(census.mcs150_mileage || census.mileage, null),
      dateOnly(insurance.expirationDate),
      insurance.name_company || "",
      insurance.policy_no || "",
      insurance.estimatedRenewal
        ? "Estimated Renewal (prior year effective filing)"
        : (insurance.mod_col_1 || insurance.ins_form_code || ""),
      cargoTypes,
      census.hm_ind === "Y"
    ]
  );

  return result.rows[0] || null;
}

async function fetchAndStoreLiveRenewals({ from, to, state, limit }) {
  const [cancellationRows, estimatedRenewalRows] = await Promise.all([
    fetchInsuranceRowsForWindow({ from, to, limit }),
    fetchEstimatedInsuranceRenewalRows({ from, to, limit })
  ]);
  const insuranceRows = [...cancellationRows, ...estimatedRenewalRows];
  const bestByDot = new Map();
  for (const row of insuranceRows) {
    const current = bestByDot.get(row.dot_number);
    if (!current || (current.estimatedRenewal && !row.estimatedRenewal)) {
      bestByDot.set(row.dot_number, row);
    }
  }

  const insuranceByDot = [...bestByDot.values()];
  const hydrated = [];
  const chunkSize = 50;
  for (let i = 0; i < insuranceByDot.length && hydrated.length < limit; i += chunkSize) {
    const chunk = insuranceByDot.slice(i, i + chunkSize);
    const censusRows = await fetchCensusRowsForDots(chunk.map((row) => row.dot_number), state);
    const censusByDot = new Map(censusRows.map((row) => [normalizeDotNumber(row.dot_number), row]));
    for (const insurance of chunk) {
      const census = censusByDot.get(insurance.dot_number);
      if (!census) continue;
      const saved = await upsertPostgresRenewalCarrier({ insurance, census });
      if (saved) hydrated.push(saved);
      if (hydrated.length >= limit) break;
    }
  }

  return hydrated;
}

async function listPostgresCarriers(req, res) {
  if (!requirePaidPlan(req, res)) return;

  const page = Math.max(parseInteger(req.query.page, 1), 1);
  const limit = Math.min(Math.max(parseInteger(req.query.limit, 25), 1), 250);
  const skip = (page - 1) * limit;
  const { whereSql, values } = buildPostgresCarrierQuery(req.query);
  const sortMap = {
    dotNumber: "c.dot_number",
    legalName: "c.carrier_name",
    insuranceExpirationDate: "c.insurance_expiration",
    authorityStatus: "c.authority_status",
    fleetSize: "c.vehicle_count",
    dateCreated: "c.created_at",
    lastUpdated: "c.last_updated"
  };
  const sortField = sortMap[String(req.query.sort || "lastUpdated")] || "c.last_updated";
  const sortOrder = String(req.query.order || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  const countResult = await dbQuery(
    `SELECT COUNT(*)::int AS total FROM carriers c LEFT JOIN enriched_carrier_data e ON e.carrier_id = c.id ${whereSql}`,
    values
  );

  const rowValues = [...values, limit, skip];
  const rowsResult = await dbQuery(
    `${postgresCarrierSelect()}
     ${whereSql}
     ORDER BY ${sortField} ${sortOrder} NULLS LAST, c.carrier_name ASC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    rowValues
  );

  res.json({
    total: countResult.rows[0]?.total || 0,
    page,
    limit,
    pages: Math.ceil((countResult.rows[0]?.total || 0) / limit),
    filters: req.query,
    source: "postgres-fallback",
    message: "MongoDB is not connected. Showing carriers from the Postgres carrier database.",
    carriers: rowsResult.rows.map(postgresCarrierToApi),
    results: rowsResult.rows.map(postgresCarrierToApi)
  });
}

async function getPostgresRenewalLeads(req, res) {
  if (!(await enforceLeadPlanState(req, res, "renewal"))) return;

  const days = Math.min(Math.max(parseInteger(req.query.days, 30), 1), 365);
  const page = Math.max(parseInteger(req.query.page, 1), 1);
  const limit = Math.min(Math.max(parseInteger(req.query.limit, 100), 1), 5000);
  const from = dateOrNull(req.query.from || req.query.renewalFrom || req.query.insuranceFrom) || addDays(0);
  const to = dateOrNull(req.query.to || req.query.renewalTo || req.query.insuranceTo) || addDays(days);
  const direction = sortDirection(req.query.order, 1) === 1 ? "ASC" : "DESC";
  const { whereSql, values } = buildPostgresCarrierQuery({
    ...req.query,
    insuranceFrom: from,
    insuranceTo: to
  });
  const rowValues = [...values, limit + 1, (page - 1) * limit];
  const [rowsResult, countResult] = await Promise.all([
    dbQuery(
      `${postgresCarrierSelect()}
       ${whereSql}
       ORDER BY c.insurance_expiration ${direction} NULLS LAST, c.vehicle_count DESC NULLS LAST, c.carrier_name ASC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      rowValues
    ),
    dbQuery(
      `SELECT COUNT(*)::int AS total
       FROM carriers c
       LEFT JOIN enriched_carrier_data e ON e.carrier_id = c.id
       ${whereSql}`,
      values
    ).catch(() => ({ rows: [] }))
  ]);
  let source = "postgres-fallback";
  let message = rowsResult.rows.length === 0
    ? "No matching renewal dates are loaded yet."
    : "Showing renewal leads from the available carrier database.";
  let resultRows = rowsResult.rows;

  if (resultRows.length < limit && page === 1) {
    try {
      const liveRows = await fetchAndStoreLiveRenewals({
        from,
        to,
        state: queryState(req.query.state),
        limit
      });
      if (liveRows.length) {
        const rowsByDot = new Map(resultRows.map((row) => [normalizeDotNumber(row.dot_number), row]));
        for (const row of liveRows) {
          const dot = normalizeDotNumber(row.dot_number);
          if (dot && !rowsByDot.has(dot)) rowsByDot.set(dot, row);
        }
        resultRows = [...rowsByDot.values()].slice(0, limit + 1);
        source = "fmcsa-insurance-refresh";
        message = "Showing renewal leads from FMCSA insurance filings and the carrier database.";
      } else if (resultRows.length === 0) {
        message = "No matching renewal filings were found in the selected date window.";
      }
    } catch (err) {
      console.warn("FMCSA renewal refresh unavailable:", err.message);
      if (resultRows.length === 0) {
        message = "No local renewal rows are loaded for that window, and the FMCSA insurance feed is temporarily unavailable.";
      }
    }
  }

  const total = Math.max(Number(countResult.rows[0]?.total ?? 0), resultRows.length);
  const hasMore = resultRows.length > limit || page * limit < total;
  const rows = hasMore ? resultRows.slice(0, limit) : resultRows;
  const trialAccess = trialAccessForRequest(req, res);
  const rawLeads = await enrichLeadRowsForResponse(rows.map(postgresCarrierToProspectLead), {
    mode: "renewal",
    missingOnly: true
  });
  const leads = maskTrialResults(rawLeads, trialAccess);
  const carriers = maskTrialResults(rows.map(postgresCarrierToApi), trialAccess);

  res.json({
    total,
    page,
    limit,
    hasMore,
    pages: Math.ceil(total / limit),
    days,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    source,
    message: buildTrialLeadMessage(message, trialAccess),
    carriers,
    leads,
    access: getPlanAccessSummary(req.user),
    trialAccess
  });
}

async function getFmcsaNewCarrierLeads(req, res) {
  if (!(await enforceLeadPlanState(req, res, "new"))) return;
  let normalizedLeads = [];
  let message = "Showing new DOT leads from the FMCSA census API.";

  try {
    normalizedLeads = await fetchFmcsaCensusNewLeads(req.query);
  } catch (err) {
    console.warn("FMCSA census fallback unavailable:", err.message);
    message = "The FMCSA census feed is temporarily unavailable. Please try the search again shortly.";
  }

  const trialAccess = trialAccessForRequest(req, res);
  const rawLeads = await enrichLeadRowsForResponse(normalizedLeads, {
    mode: "new",
    missingOnly: true
  });
  const leads = maskTrialResults(rawLeads, trialAccess);

  res.json({
    total: normalizedLeads.length,
    page: Math.max(parseInteger(req.query.page, 1), 1),
    limit: Math.min(Math.max(parseInteger(req.query.limit, 100), 1), 5000),
    hasMore: false,
    filters: req.query,
    source: "fmcsa-census-fallback",
    message: buildTrialLeadMessage(message, trialAccess),
    carriers: [],
    leads,
    access: getPlanAccessSummary(req.user),
    trialAccess
  });
}

async function getPostgresNewCarrierLeads(req, res) {
  if (!(await enforceLeadPlanState(req, res, "new"))) return;

  const days = Math.min(Math.max(parseInteger(req.query.days || req.query.daysBack, 30), 1), 3650);
  const page = Math.max(parseInteger(req.query.page, 1), 1);
  const limit = Math.min(Math.max(parseInteger(req.query.limit, 100), 1), 5000);
  const to = dateOrNull(req.query.to || req.query.endDate) || addDays(0);
  const from = dateOrNull(req.query.from || req.query.startDate) || addDays(-days);
  const { whereSql, values } = buildPostgresCarrierQuery(req.query, { includeInsuranceDates: false });
  const where = whereSql ? [whereSql.replace(/^WHERE\s+/i, "")] : [];
  values.push(from);
  where.push(`c.created_at >= $${values.length}`);
  values.push(to);
  where.push(`c.created_at <= $${values.length}`);
  const countValues = [...values];
  values.push(limit + 1);
  const limitParam = `$${values.length}`;
  values.push((page - 1) * limit);
  const offsetParam = `$${values.length}`;

  const [rowsResult, countResult, importSummary] = await Promise.all([
    dbQuery(
      `${postgresCarrierSelect()}
       WHERE ${where.join(" AND ")}
       ORDER BY c.created_at DESC, c.vehicle_count DESC NULLS LAST
       LIMIT ${limitParam} OFFSET ${offsetParam}`,
      values
    ),
    dbQuery(
      `SELECT COUNT(*)::int AS total
       FROM carriers c
       LEFT JOIN enriched_carrier_data e ON e.carrier_id = c.id
       WHERE ${where.join(" AND ")}`,
      countValues
    ).catch(() => ({ rows: [] })),
    dbQuery(
      `SELECT COUNT(*)::int AS total_imported, MAX(created_at) AS last_import_time
       FROM carriers`
    ).catch(() => ({ rows: [] }))
  ]);

  const rowsPlusOne = rowsResult.rows;
  const total = Number(countResult.rows[0]?.total ?? rowsPlusOne.length);
  const hasMore = rowsPlusOne.length > limit || page * limit < total;
  const rows = hasMore ? rowsPlusOne.slice(0, limit) : rowsPlusOne;
  const trialAccess = trialAccessForRequest(req, res);
  const rawLeads = await enrichLeadRowsForResponse(rows.map(postgresCarrierToProspectLead), {
    mode: "new",
    missingOnly: true
  });
  const leads = maskTrialResults(rawLeads, trialAccess);
  const carriers = maskTrialResults(rows.map(postgresCarrierToApi), trialAccess);
  const totalImported = Number(importSummary.rows[0]?.total_imported || 0);
  const lastImportTime = importSummary.rows[0]?.last_import_time || null;
  const message = rows.length
    ? "Showing New DOT leads from imported FMCSA Open Data in the database."
    : totalImported === 0
      ? "No new DOT import has run yet."
      : "No approved New DOT carriers matched the selected date window and filters.";

  res.json({
    total,
    page,
    limit,
    hasMore,
    pages: Math.ceil(total / limit),
    days,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    source: "database",
    dataSource: "FMCSA Open Data / Database",
    lastImportTime: lastImportTime ? new Date(lastImportTime).toISOString() : null,
    importedCarrierCount: totalImported,
    message: buildTrialLeadMessage(message, trialAccess),
    carriers,
    leads,
    access: getPlanAccessSummary(req.user),
    trialAccess
  });
}

async function enforceLeadPlanState(req, res, leadType) {
  if (!requirePaidPlan(req, res)) return false;

  const access = getPlanAccessSummary(req.user);
  const requestedState = normalizeUSStateCode(req.query.state);
  let accountState = normalizeUSStateCode(req.user?.lead_state || req.user?.leadState);
  const allowedStates = Array.isArray(req.user?.lead_states)
    ? req.user.lead_states.map((state) => normalizeUSStateCode(state)).filter(Boolean)
    : [];

  if (leadType === "renewal" && !access.canUseRenewalLeads) {
    res.status(403).json({
      error: "Choose an active Producer Pro plan to search renewal leads.",
      access
    });
    return false;
  }

  if (access.canSearchAllStates) {
    applyLeadDateWindowForPlan(req, leadType);
    return true;
  }

  if (access.requiresSingleState) {
    if (!accountState && requestedState) {
      await dbQuery(
        "UPDATE users SET lead_state = $1, updated_at = NOW() WHERE id = $2 AND lead_state IS NULL",
        [requestedState, req.user.id]
      );
      accountState = requestedState;
      req.user.lead_state = requestedState;
    }

    if (!accountState) {
      res.status(403).json({
        error: `${access.planName} includes one state. Choose your lead state before searching.`,
        access
      });
      return false;
    }

    if (requestedState && requestedState !== accountState) {
      res.status(403).json({
        error: `${access.planName} is locked to ${accountState}. Add another state from billing to search it.`,
        access: { ...access, leadState: accountState }
      });
      return false;
    }

    req.query = {
      ...req.query,
      state: accountState
    };
  } else {
    const effectiveAllowedStates = allowedStates.length
      ? allowedStates
      : accountState
        ? [accountState]
        : [];

    if (!effectiveAllowedStates.length) {
      if (requestedState) {
        await dbQuery(
          "UPDATE users SET lead_state = $1, lead_states = ARRAY[$1]::text[], updated_at = NOW() WHERE id = $2 AND lead_state IS NULL",
          [requestedState, req.user.id]
        );
        req.user.lead_state = requestedState;
        req.user.lead_states = [requestedState];
        req.query = {
          ...req.query,
          state: requestedState
        };
        applyLeadDateWindowForPlan(req, leadType);
        return true;
      }

      res.status(403).json({
        error: `${access.planName} includes one state. Choose your lead state before searching.`,
        access
      });
      return false;
    }

    const selectedState = requestedState || effectiveAllowedStates[0];
    if (!effectiveAllowedStates.includes(selectedState)) {
      res.status(403).json({
        error: `Lead Desk is limited to your selected states: ${effectiveAllowedStates.join(", ")}. Add another state from billing to search it.`,
        access: { ...access, leadStates: effectiveAllowedStates }
      });
      return false;
    }

    req.query = {
      ...req.query,
      state: selectedState
    };
  }

  applyLeadDateWindowForPlan(req, leadType);

  return true;
}

export async function listLocalCarriers(req, res) {
  try {
    if (!requirePaidPlan(req, res)) return;

    if (!isMongoConnected()) {
      return listPostgresCarriers(req, res);
    }

    const page = Math.max(parseInteger(req.query.page, 1), 1);
    const limit = Math.min(Math.max(parseInteger(req.query.limit, 25), 1), 250);
    const skip = (page - 1) * limit;
    const filter = buildCarrierQuery(req.query);
    const sortField = String(req.query.sort || "lastUpdated");
    const sortDirection = String(req.query.order || "desc").toLowerCase() === "asc" ? 1 : -1;
    const allowedSorts = new Set([
      "dotNumber",
      "legalName",
      "insuranceExpirationDate",
      "authorityStatus",
      "fleetSize",
      "dateCreated",
      "lastUpdated"
    ]);
    const sort = allowedSorts.has(sortField) ? { [sortField]: sortDirection } : { lastUpdated: -1 };

    const [total, carriers] = await Promise.all([
      Carrier.countDocuments(filter),
      Carrier.find(filter).sort(sort).skip(skip).limit(limit).lean()
    ]);

    const shouldMaskContacts = shouldMaskPublicCarrierContacts(req);
    const apiCarriers = carriers.map((carrier) => {
      const mapped = carrierToApi(carrier);
      return shouldMaskContacts ? maskPublicCarrierContacts(mapped) : mapped;
    });

    res.json({
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      filters: req.query,
      carriers: apiCarriers,
      results: apiCarriers
    });
  } catch (err) {
    console.error("Local carrier search error:", err);
    res.status(500).json({ error: "Failed to search local carrier database" });
  }
}

export async function enrichSelectedCarrierDetails(req, res) {
  try {
    const dotNumbers = Array.isArray(req.body?.dotNumbers) ? req.body.dotNumbers : [];
    if (!dotNumbers.length) {
      return res.status(400).json({ error: "dotNumbers must contain at least one DOT number." });
    }
    if (dotNumbers.length > 100) {
      return res.status(400).json({ error: "Select up to 100 carriers at a time." });
    }

    const result = await enrichSelectedCarriers(dotNumbers, {
      mode: String(req.body?.mode || "new")
    });
    return res.json(result);
  } catch (err) {
    console.error("Selected carrier enrichment error:", err);
    return res.status(500).json({ error: "Selected carrier details could not be refreshed." });
  }
}

export async function getLocalCarrierByDot(req, res) {
  try {
    const dotNumber = String(req.params.dot || req.params.dotNumber || "").trim();
    let carrier = null;
    const shouldMaskContacts = shouldMaskPublicCarrierContacts(req);

    if (isMongoConnected()) {
      carrier = await Carrier.findOne({ dotNumber }).lean();
    }

    if (carrier) {
      const changes = await CarrierChange.find({ dotNumber })
        .sort({ changedAt: -1 })
        .limit(100)
        .lean();

      return res.json({
        carrier: {
          ...(shouldMaskContacts
            ? maskPublicCarrierContacts(carrierToApi(carrier, { includeRaw: req.query.includeRaw === "true" }))
            : carrierToApi(carrier, { includeRaw: req.query.includeRaw === "true" })),
          changes
        }
      });
    }

    if (!isMongoConnected()) {
      const pgCarrier = await dbQuery(
        `${postgresCarrierSelect()} WHERE c.dot_number = $1 LIMIT 1`,
        [dotNumber]
      );

      if (pgCarrier.rows.length) {
        const mappedCarrier = postgresCarrierToApi(pgCarrier.rows[0]);
        return res.json({
          carrier: shouldMaskContacts ? maskPublicCarrierContacts(mappedCarrier) : mappedCarrier,
          source: "postgres-fallback",
          message: "MongoDB is not connected. Showing the most recent Postgres carrier record."
        });
      }
    }

    const liveCarrier = await fetchCarrierByDotOrMc({ dot: dotNumber });
    res.json({
      carrier: shouldMaskContacts ? maskPublicCarrierContacts(liveCarrier) : liveCarrier,
      source: "live-fallback",
      message: isMongoConnected()
        ? "Carrier was not found in MongoDB, so live FMCSA lookup was used."
        : "MongoDB is not connected and no Postgres record was found, so live FMCSA lookup was used."
    });
  } catch (err) {
    console.error("Local carrier profile error:", err);
    res.status(404).json({ error: "Carrier not found" });
  }
}

export async function getRenewalLeads(req, res) {
  try {
    if (!isMongoConnected()) {
      return getPostgresRenewalLeads(req, res);
    }
    if (!(await enforceLeadPlanState(req, res, "renewal"))) return;

    const days = Math.min(Math.max(parseInteger(req.query.days, 30), 1), 365);
    const page = Math.max(parseInteger(req.query.page, 1), 1);
    const limit = Math.min(Math.max(parseInteger(req.query.limit, 100), 1), 5000);
    const from = dateOrNull(req.query.from || req.query.renewalFrom || req.query.insuranceFrom) || addDays(0);
    const to = dateOrNull(req.query.to || req.query.renewalTo || req.query.insuranceTo) || addDays(days);
    const requestedSort = String(req.query.sort || "insuranceExpirationDate").trim();
    const direction = sortDirection(req.query.order, 1);
    const sort = requestedSort === "fleetSize"
      ? { fleetSize: -1, insuranceExpirationDate: 1, legalName: 1 }
      : { insuranceExpirationDate: direction, fleetSize: -1, legalName: 1 };
    const filter = {
      ...buildCarrierQuery(req.query, { includeInsuranceDates: false }),
      insuranceExpirationDate: {
        $gte: from,
        $lte: to
      }
    };

    const [total, carriersPlusOne] = await Promise.all([
      Carrier.countDocuments(filter).maxTimeMS(10000),
      Carrier.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit + 1)
        .maxTimeMS(10000)
        .lean()
    ]);
    const hasMore = carriersPlusOne.length > limit;
    const carriers = hasMore ? carriersPlusOne.slice(0, limit) : carriersPlusOne;

    if (carriers.length < limit && page === 1) {
      return getPostgresRenewalLeads(req, res);
    }

    const trialAccess = trialAccessForRequest(req, res);
    const rawLeads = await enrichLeadRowsForResponse(carriers.map(carrier => carrierToProspectLead(carrier)), {
      mode: "renewal",
      missingOnly: true
    });
    const leads = maskTrialResults(rawLeads, trialAccess);
    const maskedCarriers = maskTrialResults(carriers.map(carrier => carrierToApi(carrier)), trialAccess);

    res.json({
      total,
      page,
      limit,
      hasMore,
      pages: Math.ceil(total / limit),
      days,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      carriers: maskedCarriers,
      leads,
      access: getPlanAccessSummary(req.user),
      trialAccess,
      message: buildTrialLeadMessage(
        carriers.length === 0
          ? "No matching renewal dates are loaded yet. Bulk FMCSA census data does not always include insurance expiration dates; run targeted DOT enrichment or connect an insurance filings data source."
          : "",
        trialAccess
      )
    });
  } catch (err) {
    console.error("Renewal leads error:", err);
    res.status(500).json({ error: "Failed to fetch renewal leads" });
  }
}

export async function getNewCarrierLeads(req, res) {
  try {
    if (!isMongoConnected()) {
      return getPostgresNewCarrierLeads(req, res);
    }
    if (!(await enforceLeadPlanState(req, res, "new"))) return;

    const days = Math.min(Math.max(parseInteger(req.query.days || req.query.daysBack, 30), 1), 3650);
    const page = Math.max(parseInteger(req.query.page, 1), 1);
    const limit = Math.min(Math.max(parseInteger(req.query.limit, 100), 1), 5000);
    const to = dateOrNull(req.query.to || req.query.endDate) || addDays(0);
    const from = dateOrNull(req.query.from || req.query.startDate) || addDays(-days);
    const filter = {
      ...buildCarrierQuery(req.query, { includeInsuranceDates: false })
    };
    const motusApprovalFilter = {
      $or: [
        { "raw.motusRegister": { $exists: false } },
        { "raw.motusRegister.approved": true }
      ]
    };
    const operation = String(req.query.operation || "").trim();
    const requestedSort = String(req.query.sort || "dateCreated").trim();
    const direction = sortDirection(req.query.order, -1);
    const sort = requestedSort === "fleetSize"
      ? { fleetSize: -1, leadDeskNewDate: -1, legalName: 1 }
      : { leadDeskNewDate: direction, fleetSize: -1, legalName: 1 };

    if (operation) filter["raw.census.carrier_operation"] = operation;
    const dateRange = { $gte: from, $lte: to };
    const leadDateExpression = {
      $cond: [
        { $eq: ["$raw.motusRegister.approved", true] },
        {
          $ifNull: [
            "$newLeadSince",
            { $ifNull: ["$dateCreated", { $ifNull: ["$firstSeenAt", { $ifNull: ["$firstImportedAt", "$createdAt"] }] }] }
          ]
        },
        {
          $ifNull: [
            "$dateCreated",
            { $ifNull: ["$firstSeenAt", { $ifNull: ["$firstImportedAt", { $ifNull: ["$newLeadSince", "$createdAt"] }] }] }
          ]
        }
      ]
    };
    const andFilters = [motusApprovalFilter];
    if (filter.$or) {
      andFilters.unshift({ $or: filter.$or });
      delete filter.$or;
    }
    filter.$and = [...(filter.$and || []), ...andFilters];

    const pipeline = [
      { $match: filter },
      { $addFields: { leadDeskNewDate: leadDateExpression } },
      { $match: { leadDeskNewDate: dateRange } }
    ];
    const [countResult, carriersPlusOne] = await Promise.all([
      Carrier.aggregate([...pipeline, { $count: "total" }]).option({ maxTimeMS: 10000 }),
      Carrier.aggregate([
        ...pipeline,
        { $sort: sort },
        { $skip: (page - 1) * limit },
        { $limit: limit + 1 },
        { $project: { leadDeskNewDate: 0 } }
      ]).option({ maxTimeMS: 10000 })
    ]);
    const total = Number(countResult[0]?.total || 0);
    const hasMore = carriersPlusOne.length > limit;
    const carriers = hasMore ? carriersPlusOne.slice(0, limit) : carriersPlusOne;

    const trialAccess = trialAccessForRequest(req, res);
    const rawLeads = await enrichLeadRowsForResponse(carriers.map(carrier => carrierToNewVentureLead(carrier)), {
      mode: "new",
      missingOnly: true
    });
    const leads = maskTrialResults(rawLeads, trialAccess);
    const maskedCarriers = maskTrialResults(carriers.map(carrier => carrierToApi(carrier)), trialAccess);

    const importSummary = await Carrier.aggregate([
      {
        $group: {
          _id: null,
          totalImported: { $sum: 1 },
          lastImportTime: {
            $max: {
              $ifNull: ["$sourceLastSeenAt", { $ifNull: ["$firstSeenAt", { $ifNull: ["$firstImportedAt", "$newLeadSince"] }] }]
            }
          }
        }
      }
    ]).catch(() => []);
    const totalImported = importSummary[0]?.totalImported || 0;
    const lastImportTime = importSummary[0]?.lastImportTime || null;
    const message = carriers.length
      ? "Showing New DOT leads from imported FMCSA Open Data and approved Motus registrations."
      : totalImported === 0
        ? "No new DOT import has run yet."
        : "No approved New DOT carriers matched the selected date window and filters.";

    res.json({
      total,
      page,
      limit,
      hasMore,
      pages: Math.ceil(total / limit),
      days,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      carriers: maskedCarriers,
      leads,
      source: "database",
      dataSource: "FMCSA Open Data / Approved Motus Registrations / Database",
      lastImportTime: lastImportTime ? new Date(lastImportTime).toISOString() : null,
      importedCarrierCount: totalImported,
      access: getPlanAccessSummary(req.user),
      trialAccess,
      message: buildTrialLeadMessage(message, trialAccess)
    });
  } catch (err) {
    console.error("New carrier leads error:", err);
    res.status(500).json({ error: "Failed to fetch new carrier leads" });
  }
}
