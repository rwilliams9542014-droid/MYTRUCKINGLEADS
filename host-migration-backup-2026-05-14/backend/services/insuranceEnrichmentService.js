import Carrier from "../models/Carrier.js";
import CarrierChange from "../models/CarrierChange.js";
import {
  mapCensusRowToCarrier
} from "./carrierImportService.js";
import { requestWithRetry } from "./safeScrapingService.js";

const ACT_PEND_INSUR_URL = "https://data.transportation.gov/resource/qh9u-swkp.json";
const FMCSA_CENSUS_URL = "https://data.transportation.gov/resource/az4n-8mr2.json";
const BIPD_FORM_CODES = new Set(["82", "91", "91X"]);

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(date) {
  return date ? date.toISOString().slice(0, 10) : null;
}

function normalizeDotNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const normalized = String(Number(digits));
  return normalized === "0" ? "" : normalized;
}

function isSameDay(left, right) {
  return dateOnly(dateOrNull(left)) === dateOnly(dateOrNull(right));
}

function isPreferredInsuranceRecord(candidate, current) {
  if (!current) return true;

  const candidateIsBipd = BIPD_FORM_CODES.has(String(candidate.ins_form_code || "").toUpperCase());
  const currentIsBipd = BIPD_FORM_CODES.has(String(current.ins_form_code || "").toUpperCase());
  if (candidateIsBipd !== currentIsBipd) return candidateIsBipd;

  const candidateExpiration = dateOrNull(candidate.cancl_effective_date);
  const currentExpiration = dateOrNull(current.cancl_effective_date);
  if (!candidateExpiration) return false;
  if (!currentExpiration) return true;

  return candidateExpiration < currentExpiration;
}

function mapInsuranceRecord(row) {
  const dotNumber = normalizeDotNumber(row.dot_number);
  const expirationDate = dateOrNull(row.cancl_effective_date);
  if (!dotNumber || !expirationDate) return null;

  return {
    dotNumber,
    insuranceExpirationDate: expirationDate,
    insuranceCancellationDate: expirationDate,
    insuranceEffectiveDate: dateOrNull(row.effective_date),
    insuranceCompany: String(row.name_company || "").trim(),
    insurancePolicyNumber: String(row.policy_no || "").trim(),
    insuranceFormCode: String(row.ins_form_code || "").trim(),
    insuranceType: String(row.mod_col_1 || "").trim(),
    rawInsurance: row
  };
}

function buildDateRange({ from, to } = {}) {
  const start = dateOrNull(from) || new Date();
  start.setHours(0, 0, 0, 0);

  const end = dateOrNull(to) || new Date(start);
  if (!to) end.setDate(end.getDate() + Number(process.env.INSURANCE_IMPORT_DAYS || 90));
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function isWithinRange(row, start, end) {
  const expiration = dateOrNull(row.cancl_effective_date);
  return expiration && expiration >= start && expiration <= end;
}

function buildInsuranceWhere() {
  const clauses = ["cancl_effective_date is not null"];

  // FMCSA exposes this field as MM/DD/YYYY text, so ISO date comparisons in
  // Socrata return empty result sets. Pull non-null rows and filter locally.
  return clauses.join(" AND ");
}

export async function fetchInsurancePage({ limit = 1000, offset = 0, start = null, end = null } = {}) {
  const params = {
    $limit: limit,
    $offset: offset,
    $order: "cancl_effective_date ASC",
    $where: buildInsuranceWhere()
  };

  if (process.env.SOCRATA_APP_TOKEN) params.$$app_token = process.env.SOCRATA_APP_TOKEN;

  const response = await requestWithRetry(
    {
      method: "GET",
      url: ACT_PEND_INSUR_URL,
      params,
      headers: { Accept: "application/json" },
      timeout: Number(process.env.FMCSA_REQUEST_TIMEOUT_MS || 30000)
    },
    {
      label: `FMCSA ActPendInsur offset ${offset}`,
      throttleMs: Number(process.env.FMCSA_INSURANCE_REQUEST_DELAY_MS || process.env.FMCSA_REQUEST_DELAY_MS || 500)
    }
  );

  return Array.isArray(response.data) ? response.data : [];
}

export async function upsertInsuranceRecords(rows, { importRunId = "" } = {}) {
  const bestByDot = new Map();

  for (const row of rows) {
    const mapped = mapInsuranceRecord(row);
    if (!mapped) continue;

    const current = bestByDot.get(mapped.dotNumber);
    if (isPreferredInsuranceRecord(row, current?.rawInsurance)) {
      bestByDot.set(mapped.dotNumber, mapped);
    }
  }

  const records = [...bestByDot.values()];
  if (records.length === 0) {
    return { matched: 0, inserted: 0, updated: 0, unchanged: 0, changes: 0 };
  }

  const existing = await Carrier.find({ dotNumber: { $in: records.map(record => record.dotNumber) } }).lean();
  const existingByDot = new Map(existing.map(carrier => [carrier.dotNumber, carrier]));
  const operations = [];
  const history = [];
  let inserted = 0;
  let updated = 0;
  let unchanged = 0;

  for (const record of records) {
    const current = existingByDot.get(record.dotNumber);
    const now = new Date();
    const set = {
      insuranceExpirationDate: record.insuranceExpirationDate,
      insuranceCancellationDate: record.insuranceCancellationDate,
      insuranceEffectiveDate: record.insuranceEffectiveDate,
      insuranceCompany: record.insuranceCompany,
      insurancePolicyNumber: record.insurancePolicyNumber,
      insuranceFormCode: record.insuranceFormCode,
      insuranceType: record.insuranceType,
      sourceLastSeenAt: now,
      lastInsuranceEnrichedAt: now,
      lastUpdated: now
    };

    if (!current) {
      inserted += 1;
      operations.push({
        updateOne: {
          filter: { dotNumber: record.dotNumber },
          update: {
            $setOnInsert: {
              dotNumber: record.dotNumber,
              legalName: "",
              dbaName: "",
              address: {},
              phoneNumber: "",
              email: "",
              safetyRating: "Unknown",
              authorityStatus: "",
              source: "FMCSA ActPendInsur",
              isNewLead: true,
              newLeadSince: now
            },
            $set: {
              ...set,
              raw: { insurance: record.rawInsurance }
            }
          },
          upsert: true
        }
      });
      continue;
    }

    const changedFields = [];
    if (!isSameDay(current.insuranceExpirationDate, record.insuranceExpirationDate)) changedFields.push("insuranceExpirationDate");
    if (!isSameDay(current.insuranceCancellationDate, record.insuranceCancellationDate)) changedFields.push("insuranceCancellationDate");
    if (!isSameDay(current.insuranceEffectiveDate, record.insuranceEffectiveDate)) changedFields.push("insuranceEffectiveDate");
    for (const field of ["insuranceCompany", "insurancePolicyNumber", "insuranceFormCode", "insuranceType"]) {
      if (String(current[field] || "") !== String(record[field] || "")) changedFields.push(field);
    }

    if (changedFields.length === 0) {
      unchanged += 1;
      operations.push({
        updateOne: {
          filter: { dotNumber: record.dotNumber },
          update: {
            $set: {
              sourceLastSeenAt: now,
              lastInsuranceEnrichedAt: now,
              lastUpdated: now
            }
          }
        }
      });
      continue;
    }

    updated += 1;
    operations.push({
      updateOne: {
        filter: { dotNumber: record.dotNumber },
        update: {
          $set: {
            ...set,
            "raw.insurance": record.rawInsurance
          }
        }
      }
    });

    for (const field of changedFields) {
      history.push({
        dotNumber: record.dotNumber,
        carrier: current._id,
        field,
        oldValue: current[field] instanceof Date ? dateOnly(current[field]) : current[field] || null,
        newValue: record[field] instanceof Date ? dateOnly(record[field]) : record[field] || null,
        source: "FMCSA ActPendInsur",
        importRunId
      });
    }
  }

  if (operations.length > 0) {
    await Carrier.bulkWrite(operations, { ordered: false });
  }

  if (history.length > 0 && process.env.CARRIER_HISTORY_ENABLED !== "false") {
    await CarrierChange.insertMany(history, { ordered: false });
  }

  return {
    matched: records.length,
    inserted,
    updated,
    unchanged,
    changes: history.length
  };
}

async function fetchCensusRowsByDots(dotNumbers) {
  if (dotNumbers.length === 0) return [];

  const where = `dot_number in(${dotNumbers.map(dot => `'${dot}'`).join(",")})`;
  const params = {
    $limit: dotNumbers.length,
    $where: where
  };

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
      label: `FMCSA census hydrate ${dotNumbers.length} DOTs`,
      throttleMs: Number(process.env.FMCSA_INSURANCE_REQUEST_DELAY_MS || process.env.FMCSA_REQUEST_DELAY_MS || 500)
    }
  );

  return Array.isArray(response.data) ? response.data : [];
}

async function hydrateCarrierDetailsForInsuranceRows(rows, { importRunId = "" } = {}) {
  const dotNumbers = [
    ...new Set(rows.map(row => normalizeDotNumber(row.dot_number)).filter(Boolean))
  ];
  const chunkSize = Number(process.env.FMCSA_INSURANCE_HYDRATE_BATCH_SIZE || 50);
  const stats = { requested: dotNumbers.length, found: 0, inserted: 0, updated: 0, unchanged: 0, changes: 0 };

  for (let index = 0; index < dotNumbers.length; index += chunkSize) {
    const chunk = dotNumbers.slice(index, index + chunkSize);
    const censusRows = await fetchCensusRowsByDots(chunk);
    const carriers = censusRows.map(mapCensusRowToCarrier).filter(Boolean);
    const operations = carriers.map(carrier => ({
      updateOne: {
        filter: { dotNumber: carrier.dotNumber },
        update: {
          $set: {
            legalName: carrier.legalName,
            dbaName: carrier.dbaName,
            address: carrier.address,
            phoneNumber: carrier.phoneNumber,
            email: carrier.email,
            safetyRating: carrier.safetyRating,
            authorityStatus: carrier.authorityStatus,
            operatingStatus: carrier.operatingStatus,
            fleetSize: carrier.fleetSize,
            driverCount: carrier.driverCount,
            mcs150Date: carrier.mcs150Date,
            mcs150Mileage: carrier.mcs150Mileage,
            cargoTypes: carrier.cargoTypes,
            dateCreated: carrier.dateCreated,
            sourceLastSeenAt: new Date(),
            lastUpdated: new Date(),
            "raw.census": carrier.raw?.census || {}
          }
        }
      }
    }));

    if (operations.length > 0) {
      await Carrier.bulkWrite(operations, { ordered: false });
    }

    stats.found += carriers.length;
    stats.updated += carriers.length;
  }

  return stats;
}

export async function importInsuranceExpirations(options = {}) {
  const {
    batchSize = Number(process.env.FMCSA_INSURANCE_IMPORT_BATCH_SIZE || 1000),
    limit = Number(process.env.FMCSA_INSURANCE_IMPORT_LIMIT || 0),
    startOffset = 0,
    from = process.env.INSURANCE_IMPORT_FROM || "",
    to = process.env.INSURANCE_IMPORT_TO || "",
    hydrateCarrierDetails = process.env.FMCSA_INSURANCE_HYDRATE_CARRIERS !== "false",
    importRunId = `insurance-${new Date().toISOString()}`
  } = options;
  const { start, end } = buildDateRange({ from, to });
  const stats = {
    importRunId,
    source: "FMCSA ActPendInsur - All With History",
    from: dateOnly(start),
    to: dateOnly(end),
    pages: 0,
    read: 0,
    inWindow: 0,
    matched: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    changes: 0,
    hydrated: {
      requested: 0,
      found: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0
    },
    errors: 0
  };

  let offset = startOffset;
  let keepGoing = true;

  while (keepGoing) {
    const remaining = limit > 0 ? limit - stats.read : batchSize;
    const pageLimit = Math.min(batchSize, remaining);
    if (pageLimit <= 0) break;

    try {
      const rows = await fetchInsurancePage({ limit: pageLimit, offset, start, end });
      if (rows.length === 0) break;

      const filteredRows = rows.filter(row => isWithinRange(row, start, end));
      const result = await upsertInsuranceRecords(filteredRows, { importRunId });
      const hydrateStats = hydrateCarrierDetails
        ? await hydrateCarrierDetailsForInsuranceRows(filteredRows, { importRunId })
        : null;

      stats.pages += 1;
      stats.read += rows.length;
      stats.inWindow += filteredRows.length;
      stats.matched += result.matched;
      stats.inserted += result.inserted;
      stats.updated += result.updated;
      stats.unchanged += result.unchanged;
      stats.changes += result.changes;
      if (hydrateStats) {
        stats.hydrated.requested += hydrateStats.requested;
        stats.hydrated.found += hydrateStats.found;
        stats.hydrated.inserted += hydrateStats.inserted;
        stats.hydrated.updated += hydrateStats.updated;
        stats.hydrated.unchanged += hydrateStats.unchanged;
      }

      console.log(
        `[InsuranceImport] page=${stats.pages} offset=${offset} read=${stats.read} inWindow=${stats.inWindow} inserted=${stats.inserted} updated=${stats.updated} hydrated=${stats.hydrated.found}`
      );

      offset += rows.length;
      keepGoing = rows.length === pageLimit && (limit === 0 || stats.read < limit);
    } catch (err) {
      stats.errors += 1;
      console.error(`[InsuranceImport] page failed at offset ${offset}:`, err.message);
      throw err;
    }
  }

  return stats;
}
