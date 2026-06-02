import crypto from "crypto";
import Carrier from "../models/Carrier.js";
import CarrierChange from "../models/CarrierChange.js";
import { enrichCarrierData } from "./dataEnrichmentService.js";
import { fetchCarrierByDotOrMc } from "./fmcsaService.js";
import { requestWithRetry, sleep } from "./safeScrapingService.js";

const FMCSA_CENSUS_URL = "https://data.transportation.gov/resource/az4n-8mr2.json";

const TRACKED_FIELDS = [
  "legalName",
  "dbaName",
  "address",
  "phoneNumber",
  "cellPhone",
  "email",
  "companyOfficer1",
  "companyOfficer2",
  "docketNumber",
  "safetyRating",
  "authorityStatus",
  "operatingStatus",
  "insuranceExpirationDate",
  "fleetSize",
  "driverCount",
  "mcs150Date",
  "mcs150Mileage",
  "cargoTypes",
  "dateCreated"
];

function firstValue(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOrNull(value) {
  if (!value) return null;
  const compact = String(value).trim();
  if (/^\d{8}/.test(compact)) {
    const year = compact.slice(0, 4);
    const month = compact.slice(4, 6);
    const day = compact.slice(6, 8);
    const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDate(value) {
  const date = dateOrNull(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function mapStatusCode(value) {
  const status = String(value || "").trim().toUpperCase();
  if (status === "A") return "Active";
  if (status === "I") return "Inactive";
  if (status === "P") return "Pending";
  return String(value || "").trim();
}

function buildAddress(row) {
  const street = firstValue(row, ["phy_street", "physical_street", "street", "carrier_mailing_street"]);
  const city = firstValue(row, ["phy_city", "physical_city", "city", "carrier_mailing_city"]);
  const state = firstValue(row, ["phy_state", "physical_state", "state", "carrier_mailing_state"]).toUpperCase();
  const zip = firstValue(row, ["phy_zip", "physical_zip", "zip", "carrier_mailing_zip"]);
  const raw = [street, city, state, zip].filter(Boolean).join(", ");
  return { street, city, state, zip, raw };
}

function splitCargo(value) {
  if (!value) return [];
  return String(value)
    .split(/[,;|]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function buildDocketNumber(row) {
  const prefix = firstValue(row, ["docket1prefix", "docket_prefix", "mc_prefix"]);
  const number = firstValue(row, ["docket1", "docket_number", "mc_number"]);
  return [prefix, number].filter(Boolean).join("");
}

function normalizeComparisonValue(value) {
  if (value instanceof Date) return normalizeDate(value);
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean).sort();
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nestedValue]) => nestedValue !== undefined)
        .map(([key, nestedValue]) => [key, normalizeComparisonValue(nestedValue)])
    );
  }
  if (value === undefined || value === "") return null;
  return value;
}

function valuesEqual(left, right) {
  return JSON.stringify(normalizeComparisonValue(left)) === JSON.stringify(normalizeComparisonValue(right));
}

function mergeRaw(existingRaw, incomingRaw) {
  const merged = {
    ...existingRaw,
    ...incomingRaw
  };

  if (existingRaw?.motusRegister || incomingRaw?.motusRegister) {
    merged.motusRegister = {
      ...existingRaw?.motusRegister,
      ...incomingRaw?.motusRegister
    };
  }

  return merged;
}

function getImportRunId() {
  return `${new Date().toISOString()}-${crypto.randomBytes(4).toString("hex")}`;
}

export function mapCensusRowToCarrier(row) {
  const dotNumber = firstValue(row, ["dot_number", "usdot_number", "dot"]);
  if (!dotNumber) return null;

  const statusValue = firstValue(row, ["status_code", "authority_status", "operating_status"]);
  const cargoValue = firstValue(row, [
    "cargo_carried",
    "cargo_types",
    "cargo",
    "classdef"
  ]);

  return {
    dotNumber,
    legalName: firstValue(row, ["legal_name", "legalname", "carrier_name", "name"]),
    dbaName: firstValue(row, ["dba_name", "dba"]),
    address: buildAddress(row),
    phoneNumber: firstValue(row, ["phone", "telephone", "cell_phone"]),
    cellPhone: firstValue(row, ["cell_phone", "mobile_phone"]),
    email: firstValue(row, ["email_address", "email"]).toLowerCase(),
    companyOfficer1: firstValue(row, ["company_officer_1", "company_rep1", "company_rep", "owner", "principal"]),
    companyOfficer2: firstValue(row, ["company_officer_2", "company_rep2"]),
    docketNumber: buildDocketNumber(row),
    safetyRating: firstValue(row, ["safety_rating", "rating"]) || "Unknown",
    authorityStatus: mapStatusCode(statusValue),
    operatingStatus: firstValue(row, ["operating_status", "status"]),
    insuranceExpirationDate: dateOrNull(firstValue(row, [
      "insurance_expiration_date",
      "insurance_expiration",
      "policy_expiration_date",
      "bipd_insurance_required"
    ])),
    fleetSize: numberOrNull(firstValue(row, ["power_units", "vehicle_count", "vehicles"])),
    driverCount: numberOrNull(firstValue(row, ["total_drivers", "driver_count", "drivers"])),
    mcs150Date: dateOrNull(firstValue(row, ["mcs150_date"])),
    mcs150Mileage: numberOrNull(firstValue(row, ["mcs150_mileage", "mileage"])),
    cargoTypes: splitCargo(cargoValue),
    dateCreated: dateOrNull(firstValue(row, [
      "add_date",
      "created_date",
      "date_created",
      "mcs150_date"
    ])),
    source: "FMCSA Company Census File",
    sourceLastSeenAt: new Date(),
    raw: { census: row }
  };
}

export function mapLiveCarrierToCarrier(data) {
  const fmcsaData = data?.fmcsaData || data || {};
  const primaryContact = data?.primaryContact || {};
  const dot = data?.dot || fmcsaData.dot;
  if (!dot) return null;

  const addressText = primaryContact.address || data.address || fmcsaData.address || "";
  const cargoTypes = splitCargo(data.cargo || fmcsaData.cargo);

  return {
    dotNumber: String(dot),
    legalName: data.carrierName || fmcsaData.carrierName || data.legalName || "",
    dbaName: data.dbaName || fmcsaData.dbaName || "",
    address: {
      street: "",
      city: "",
      state: "",
      zip: "",
      raw: addressText
    },
    phoneNumber: primaryContact.phone || data.phone || fmcsaData.phone || "",
    cellPhone: data.cellPhone || fmcsaData.cellPhone || "",
    email: String(primaryContact.email || data.email || fmcsaData.email || "").toLowerCase(),
    companyOfficer1: data.companyOfficer1 || fmcsaData.companyOfficer1 || data.companyRep || "",
    companyOfficer2: data.companyOfficer2 || fmcsaData.companyOfficer2 || "",
    docketNumber: data.docketNumber || data.mc || fmcsaData.mc || "",
    safetyRating: data.safetyRating || fmcsaData.safetyRating || "Unknown",
    authorityStatus: data.authorityStatus || fmcsaData.authorityStatus || "",
    operatingStatus: data.operatingStatus || fmcsaData.operatingStatus || "",
    insuranceExpirationDate: dateOrNull(data.insuranceExpiration || fmcsaData.insuranceExpiration),
    fleetSize: numberOrNull(data.vehicleCount ?? data.vehicles ?? fmcsaData.vehicleCount ?? fmcsaData.vehicles),
    driverCount: numberOrNull(data.driverCount ?? data.drivers ?? fmcsaData.driverCount ?? fmcsaData.drivers),
    mcs150Date: dateOrNull(data.mcs150Date || fmcsaData.mcs150Date),
    mcs150Mileage: numberOrNull(data.mcs150Mileage || fmcsaData.mcs150Mileage),
    cargoTypes,
    dateCreated: dateOrNull(data.dateCreated || data.mcs150Date || fmcsaData.mcs150Date),
    source: data.source || "Existing enrichment API / FMCSA live lookup",
    sourceLastSeenAt: new Date(),
    raw: { live: data }
  };
}

export async function fetchCensusCarrierPage({ limit = 1000, offset = 0, where = "", order = "add_date DESC" } = {}) {
  const params = {
    $limit: limit,
    $offset: offset,
    $order: order
  };

  if (where) params.$where = where;
  if (process.env.SOCRATA_APP_TOKEN) params.$$app_token = process.env.SOCRATA_APP_TOKEN;

  const response = await requestWithRetry(
    {
      method: "GET",
      url: FMCSA_CENSUS_URL,
      params,
      headers: { Accept: "application/json" },
      timeout: Number(process.env.FMCSA_REQUEST_TIMEOUT_MS || 30000)
    },
    {
      label: `FMCSA census offset ${offset}`,
      throttleMs: Number(process.env.FMCSA_BULK_REQUEST_DELAY_MS || process.env.FMCSA_REQUEST_DELAY_MS || 500)
    }
  );

  return Array.isArray(response.data) ? response.data : [];
}

export function diffCarrier(existing, incoming) {
  const changes = {};

  for (const field of TRACKED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(incoming, field)) continue;

    const oldValue = existing?.[field];
    const newValue = incoming[field];

    if (!valuesEqual(oldValue, newValue)) {
      changes[field] = newValue;
    }
  }

  return changes;
}

export async function upsertCarrierBatch(incomingCarriers, { importRunId = getImportRunId(), recordHistory = true } = {}) {
  const cleanIncoming = [
    ...new Map(
      incomingCarriers
        .filter(Boolean)
        .map(carrier => [carrier.dotNumber, carrier])
    ).values()
  ];
  if (cleanIncoming.length === 0) {
    return { inserted: 0, updated: 0, unchanged: 0, changes: 0 };
  }

  const dotNumbers = cleanIncoming.map(carrier => carrier.dotNumber);
  const existingCarriers = await Carrier.find({ dotNumber: { $in: dotNumbers } }).lean();
  const existingByDot = new Map(existingCarriers.map(carrier => [carrier.dotNumber, carrier]));
  const operations = [];
  const historyRecords = [];
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const incoming of cleanIncoming) {
    const existing = existingByDot.get(incoming.dotNumber);
    const importedNow = new Date();

    if (!existing) {
      inserted += 1;
      operations.push({
        updateOne: {
          filter: { dotNumber: incoming.dotNumber },
          update: {
            $setOnInsert: {
              ...incoming,
              isNewLead: incoming.isNewLead ?? true,
              firstSeenAt: importedNow,
              firstImportedAt: importedNow,
              newLeadSince: incoming.newLeadSince ?? importedNow,
              lastUpdated: importedNow
            }
          },
          upsert: true
        }
      });
      continue;
    }

    const changes = diffCarrier(existing, incoming);

    if (Object.keys(changes).length === 0) {
      unchanged += 1;
      operations.push({
        updateOne: {
          filter: { dotNumber: incoming.dotNumber },
          update: {
            $set: {
              sourceLastSeenAt: new Date(),
              raw: mergeRaw(existing.raw, incoming.raw)
            }
          }
        }
      });
      continue;
    }

    updated += 1;
    operations.push({
      updateOne: {
        filter: { dotNumber: incoming.dotNumber },
        update: {
          $set: {
            ...changes,
            source: incoming.source,
            sourceLastSeenAt: new Date(),
            lastUpdated: new Date(),
            raw: mergeRaw(existing.raw, incoming.raw)
          }
        }
      }
    });

    if (recordHistory) {
      for (const [field, newValue] of Object.entries(changes)) {
        historyRecords.push({
          dotNumber: incoming.dotNumber,
          carrier: existing._id,
          field,
          oldValue: normalizeComparisonValue(existing[field]),
          newValue: normalizeComparisonValue(newValue),
          source: incoming.source,
          importRunId
        });
      }
    }
  }

  if (operations.length > 0) {
    await Carrier.bulkWrite(operations, { ordered: false });
  }

  if (historyRecords.length > 0) {
    await CarrierChange.insertMany(historyRecords, { ordered: false });
  }

  return { inserted, updated, unchanged, changes: historyRecords.length };
}

export async function importCarriersFromCensus(options = {}) {
  const {
    limit = Number(process.env.FMCSA_IMPORT_LIMIT || 0),
    batchSize = Number(process.env.FMCSA_IMPORT_BATCH_SIZE || 1000),
    startOffset = 0,
    where = "",
    maxPages = 0,
    importRunId = getImportRunId(),
    recordHistory = process.env.CARRIER_HISTORY_ENABLED !== "false"
  } = options;

  const stats = {
    importRunId,
    source: "FMCSA Company Census File",
    startedAt: new Date(),
    pages: 0,
    read: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    changes: 0,
    errors: 0
  };

  let offset = startOffset;
  let keepGoing = true;

  while (keepGoing) {
    const remaining = limit > 0 ? limit - stats.read : batchSize;
    const pageLimit = Math.min(batchSize, remaining);
    if (pageLimit <= 0) break;

    try {
      const rows = await fetchCensusCarrierPage({ limit: pageLimit, offset, where });
      if (rows.length === 0) break;

      const incoming = rows.map(mapCensusRowToCarrier).filter(Boolean);
      const result = await upsertCarrierBatch(incoming, { importRunId, recordHistory });

      stats.pages += 1;
      stats.read += rows.length;
      stats.inserted += result.inserted;
      stats.updated += result.updated;
      stats.unchanged += result.unchanged;
      stats.changes += result.changes;

      console.log(
        `[CarrierImport] page=${stats.pages} offset=${offset} read=${stats.read} inserted=${stats.inserted} updated=${stats.updated}`
      );

      offset += rows.length;
      keepGoing = rows.length === pageLimit && (limit === 0 || stats.read < limit) && (maxPages === 0 || stats.pages < maxPages);
    } catch (err) {
      stats.errors += 1;
      console.error(`[CarrierImport] page failed at offset ${offset}:`, err.message);
      throw err;
    }
  }

  stats.finishedAt = new Date();
  return stats;
}

export async function importLiveCarrierByDot(dotNumber, options = {}) {
  const {
    importRunId = getImportRunId(),
    recordHistory = process.env.CARRIER_HISTORY_ENABLED !== "false",
    delayMs = Number(process.env.FMCSA_SAFER_REQUEST_DELAY_MS || process.env.FMCSA_REQUEST_DELAY_MS || 1000)
  } = options;

  if (delayMs > 0) await sleep(delayMs);

  const liveData = options.useBasicLiveLookup
    ? await fetchCarrierByDotOrMc({ dot: dotNumber })
    : await enrichCarrierData(dotNumber, "", "", "");
  const carrier = mapLiveCarrierToCarrier(liveData);
  const stats = await upsertCarrierBatch([carrier], { importRunId, recordHistory });

  return { importRunId, dotNumber, ...stats };
}

export async function importLiveCarriersByDots(dotNumbers, options = {}) {
  const stats = {
    importRunId: options.importRunId || getImportRunId(),
    requested: dotNumbers.length,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    changes: 0,
    errors: 0
  };

  for (const dotNumber of dotNumbers) {
    try {
      const result = await importLiveCarrierByDot(dotNumber, { ...options, importRunId: stats.importRunId });
      stats.inserted += result.inserted;
      stats.updated += result.updated;
      stats.unchanged += result.unchanged;
      stats.changes += result.changes;
    } catch (err) {
      stats.errors += 1;
      console.error(`[CarrierImport] live DOT ${dotNumber} failed:`, err.message);
    }
  }

  return stats;
}
