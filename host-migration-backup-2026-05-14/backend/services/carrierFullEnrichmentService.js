import Carrier from "../models/Carrier.js";
import { isMongoConnected } from "../config/mongo.js";
import { query as dbQuery } from "../config/db.js";
import { fetchCarrierByDotOrMc } from "./fmcsaService.js";
import { sleep } from "./safeScrapingService.js";

function clean(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOrNull(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (/^\d{8}/.test(text)) {
    const date = new Date(`${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}T00:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateOnly(value) {
  const date = dateOrNull(value);
  return date ? date.toISOString().slice(0, 10) : "";
}

function splitCargo(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return String(value || "")
    .split(/[,;|]/)
    .map(item => item.trim())
    .filter(Boolean);
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

function normalizeDot(value) {
  return String(value || "").replace(/\D/g, "");
}

function hasCargoData(carrier = {}) {
  if (Array.isArray(carrier.cargoTypes) && carrier.cargoTypes.length) return true;
  if (clean(carrier.cargo)) return true;
  if (Array.isArray(carrier.saferData?.cargoTypes) && carrier.saferData.cargoTypes.length) return true;
  if (clean(carrier.saferData?.cargo)) return true;
  if (Array.isArray(carrier.raw?.liveCarrier?.cargoTypes) && carrier.raw.liveCarrier.cargoTypes.length) return true;
  if (clean(carrier.raw?.liveCarrier?.cargo)) return true;
  return false;
}

function dataCompletenessScore(fields = {}) {
  const checks = [
    fields.legalName,
    fields.address?.raw || fields.address,
    fields.phoneNumber || fields.phone,
    fields.email,
    fields.authorityStatus,
    fields.operatingStatus,
    fields.fleetSize ?? fields.vehicleCount,
    fields.driverCount,
    Array.isArray(fields.cargoTypes) && fields.cargoTypes.length,
    fields.mcs150Date,
    fields.safetyRating,
    fields.insuranceCompany || fields.insuranceType || fields.insuranceExpirationDate
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function mapLiveCarrierToMongoSet(liveCarrier = {}, dotNumber = "") {
  const resolvedDot = normalizeDot(liveCarrier.dot || dotNumber);
  const now = new Date();
  const cargoTypes = splitCargo(liveCarrier.cargo || liveCarrier.cargoTypes || liveCarrier.saferData?.cargoTypes);
  const set = {
    dotNumber: resolvedDot,
    legalName: clean(liveCarrier.legalName || liveCarrier.carrierName || liveCarrier.name, "Unknown Carrier"),
    dbaName: clean(liveCarrier.dbaName),
    address: splitAddress(liveCarrier.address),
    phoneNumber: clean(liveCarrier.phone),
    cellPhone: clean(liveCarrier.cellPhone),
    email: clean(liveCarrier.email).toLowerCase(),
    companyOfficer1: clean(liveCarrier.companyOfficer1 || liveCarrier.companyOfficer),
    companyOfficer2: clean(liveCarrier.companyOfficer2),
    docketNumber: clean(liveCarrier.mc || liveCarrier.docketNumber),
    safetyRating: clean(liveCarrier.safetyRating, "Unknown"),
    authorityStatus: clean(liveCarrier.authorityStatus),
    operatingStatus: clean(liveCarrier.operatingStatus),
    insuranceExpirationDate: dateOrNull(liveCarrier.insuranceExpiration),
    insuranceCompany: clean(liveCarrier.insuranceCompany),
    insurancePolicyNumber: clean(liveCarrier.insurancePolicyNumber),
    insuranceType: clean(liveCarrier.insuranceType || liveCarrier.cargoInsurance),
    fleetSize: numberOrNull(liveCarrier.vehicleCount ?? liveCarrier.vehicles),
    driverCount: numberOrNull(liveCarrier.driverCount ?? liveCarrier.drivers),
    mcs150Date: dateOrNull(liveCarrier.mcs150Date),
    mcs150Mileage: numberOrNull(liveCarrier.mcs150Mileage),
    cargoTypes,
    source: clean(liveCarrier.source, "FMCSA public data"),
    sourceLastSeenAt: now,
    lastFullEnrichedAt: now,
    lastUpdated: now,
    enrichmentStatus: "enriched"
  };

  set.dataCompletenessScore = dataCompletenessScore(set);
  if (liveCarrier.saferData) set.lastSaferEnrichedAt = now;
  if (liveCarrier.smsSafety) set.lastSmsEnrichedAt = now;
  if (liveCarrier.insuranceCompany || liveCarrier.insuranceType || liveCarrier.insuranceExpiration) {
    set.lastInsuranceEnrichedAt = now;
  }

  for (const [key, value] of Object.entries(set)) {
    const keepEmpty = ["dotNumber", "lastFullEnrichedAt", "lastUpdated", "sourceLastSeenAt", "enrichmentStatus", "dataCompletenessScore"].includes(key);
    if (!keepEmpty && (value === "" || value === null || value === undefined)) delete set[key];
    if (key === "cargoTypes" && Array.isArray(value) && value.length === 0) delete set[key];
    if (key === "address" && value && typeof value === "object" && !value.raw) delete set[key];
  }

  return {
    set,
    rawSet: {
      "raw.liveCarrier": liveCarrier,
      "raw.smsSafety": liveCarrier.smsSafety || null,
      "raw.saferData": liveCarrier.saferData || null
    }
  };
}

export async function enrichCarrierByDot(dotNumber, options = {}) {
  const dot = normalizeDot(dotNumber);
  if (!dot) return null;

  const delayMs = Number(options.delayMs ?? process.env.FULL_ENRICHMENT_REQUEST_DELAY_MS ?? 750);
  if (delayMs > 0) await sleep(delayMs);

  const liveCarrier = await fetchCarrierByDotOrMc({ dot });
  const { set, rawSet } = mapLiveCarrierToMongoSet(liveCarrier, dot);

  if (options.save !== false && isMongoConnected()) {
    await Carrier.findOneAndUpdate(
      { dotNumber: dot },
      {
        $set: {
          ...set,
          ...rawSet
        },
        $setOnInsert: {
          isNewLead: true,
          newLeadSince: new Date()
        }
      },
      { upsert: true, new: true, lean: true }
    ).catch(err => {
      console.warn(`[FullEnrichment] Cache write skipped for DOT ${dot}:`, err.message);
    });
  }

  const cargoTypes = Array.isArray(set.cargoTypes) ? set.cargoTypes : [];

  return {
    ...liveCarrier,
    dotNumber: dot,
    cargoTypes,
    cargo: cargoTypes.join(", "),
    dataCompletenessScore: set.dataCompletenessScore,
    lastFullEnrichedAt: set.lastFullEnrichedAt
  };
}

function shouldOverlayLead(row = {}) {
  const cargo = clean(row.cargoHauled || row.cargo_hauled);
  return !cargo || /^not listed$/i.test(cargo);
}

function overlayLeadWithLive(row = {}, liveCarrier = {}, mode = "new") {
  const cargo = clean(liveCarrier.cargo) || splitCargo(liveCarrier.cargoTypes).join(", ") || "Not listed";
  const mcs150Date = dateOnly(liveCarrier.mcs150Date);
  const mcs150Mileage = clean(liveCarrier.mcs150Mileage);
  const powerUnits = numberOrNull(liveCarrier.vehicleCount ?? liveCarrier.vehicles);
  const drivers = numberOrNull(liveCarrier.driverCount ?? liveCarrier.drivers);

  if (mode === "renewal") {
    return {
      ...row,
      carrier_name: row.carrier_name || liveCarrier.carrierName || liveCarrier.legalName,
      phone: row.phone || liveCarrier.phone || "",
      email: row.email || liveCarrier.email || "",
      vehicle_count: row.vehicle_count ?? powerUnits,
      driver_count: row.driver_count ?? drivers,
      mcs150_date: row.mcs150_date || mcs150Date,
      mcs150Date: row.mcs150Date || mcs150Date,
      mcs150_mileage: row.mcs150_mileage || mcs150Mileage,
      mcs150Mileage: row.mcs150Mileage || mcs150Mileage,
      cargo_hauled: cargo,
      cargoHauled: cargo,
      dataCompletenessScore: liveCarrier.dataCompletenessScore,
      enriched: true
    };
  }

  return {
    ...row,
    carrierName: row.carrierName || liveCarrier.carrierName || liveCarrier.legalName,
    phone: row.phone || liveCarrier.phone || "",
    email: row.email || liveCarrier.email || "",
    powerUnits: row.powerUnits ?? powerUnits,
    drivers: row.drivers ?? drivers,
    mcs150Date: row.mcs150Date || mcs150Date,
    mcs150_date: row.mcs150_date || mcs150Date,
    mcs150Mileage: row.mcs150Mileage || mcs150Mileage,
    mcs150_mileage: row.mcs150_mileage || mcs150Mileage,
    cargoHauled: cargo,
    cargo_hauled: cargo,
    dataCompletenessScore: liveCarrier.dataCompletenessScore,
    enriched: true
  };
}

async function findPostgresLeadOverlay(dotNumber) {
  const dot = normalizeDot(dotNumber);
  if (!dot) return null;

  try {
    const result = await dbQuery(
      `SELECT
         dot_number,
         mc_number,
         carrier_name,
         hq_city,
         hq_state,
         hq_zip,
         phone,
         email,
         vehicle_count,
         driver_count,
         mcs150_date,
         mcs150_mileage,
         insurance_expiration,
         insurance_company,
         cargo_types
       FROM carriers
       WHERE dot_number = $1
         AND cargo_types IS NOT NULL
         AND cardinality(cargo_types) > 0
       LIMIT 1`,
      [dot]
    );
    const row = result.rows[0];
    if (!row) return null;

    const cargoTypes = Array.isArray(row.cargo_types)
      ? row.cargo_types.map(item => clean(item)).filter(Boolean)
      : [];
    if (!cargoTypes.length) return null;

    return {
      dotNumber: dot,
      mcNumber: clean(row.mc_number),
      carrierName: clean(row.carrier_name),
      city: clean(row.hq_city),
      state: clean(row.hq_state),
      zip: clean(row.hq_zip),
      phone: clean(row.phone),
      email: clean(row.email),
      powerUnits: numberOrNull(row.vehicle_count),
      drivers: numberOrNull(row.driver_count),
      mcs150Date: dateOnly(row.mcs150_date),
      mcs150Mileage: clean(row.mcs150_mileage),
      insuranceExpiration: dateOnly(row.insurance_expiration),
      insuranceCompany: clean(row.insurance_company),
      cargoTypes,
      cargo: cargoTypes.join(", ")
    };
  } catch (err) {
    console.warn(`[FullEnrichment] Postgres overlay skipped for DOT ${dot}:`, err.message);
    return null;
  }
}

function overlayLeadWithPostgres(row = {}, postgresCarrier = {}, mode = "new") {
  const cargo = clean(postgresCarrier.cargo, "Not listed");

  if (mode === "renewal") {
    return {
      ...row,
      carrier_name: row.carrier_name || postgresCarrier.carrierName || "",
      mc_number: row.mc_number || postgresCarrier.mcNumber || "",
      hq_city: row.hq_city || postgresCarrier.city || "",
      hq_state: row.hq_state || postgresCarrier.state || row.state || "",
      hq_zip: row.hq_zip || postgresCarrier.zip || "",
      phone: row.phone || postgresCarrier.phone || "",
      email: row.email || postgresCarrier.email || "",
      vehicle_count: row.vehicle_count ?? postgresCarrier.powerUnits,
      driver_count: row.driver_count ?? postgresCarrier.drivers,
      mcs150_date: row.mcs150_date || postgresCarrier.mcs150Date,
      mcs150Date: row.mcs150Date || postgresCarrier.mcs150Date,
      mcs150_mileage: row.mcs150_mileage || postgresCarrier.mcs150Mileage,
      mcs150Mileage: row.mcs150Mileage || postgresCarrier.mcs150Mileage,
      insurance_expiration: row.insurance_expiration || postgresCarrier.insuranceExpiration || "",
      insurance_company: row.insurance_company || postgresCarrier.insuranceCompany || "",
      cargo_hauled: cargo,
      cargoHauled: cargo,
      enriched: true,
      enrichmentSource: "postgres"
    };
  }

  return {
    ...row,
    carrierName: row.carrierName || postgresCarrier.carrierName || "",
    mcNumber: row.mcNumber || postgresCarrier.mcNumber || "",
    state: row.state || postgresCarrier.state || "",
    city: row.city || postgresCarrier.city || "",
    phone: row.phone || postgresCarrier.phone || "",
    email: row.email || postgresCarrier.email || "",
    powerUnits: row.powerUnits ?? postgresCarrier.powerUnits,
    drivers: row.drivers ?? postgresCarrier.drivers,
    mcs150Date: row.mcs150Date || postgresCarrier.mcs150Date,
    mcs150_date: row.mcs150_date || postgresCarrier.mcs150Date,
    mcs150Mileage: row.mcs150Mileage || postgresCarrier.mcs150Mileage,
    mcs150_mileage: row.mcs150_mileage || postgresCarrier.mcs150Mileage,
    cargoHauled: cargo,
    cargo_hauled: cargo,
    enriched: true,
    enrichmentSource: "postgres"
  };
}

export async function enrichLeadRowsForResponse(rows = [], options = {}) {
  const mode = options.mode || "new";
  const limit = Math.max(Number(options.limit ?? process.env.LEAD_SEARCH_ENRICH_LIMIT ?? 5), 0);
  if (!limit || !Array.isArray(rows) || rows.length === 0) return rows;

  let enrichedCount = 0;
  const output = [];
  for (const row of rows) {
    const dot = normalizeDot(row.dotNumber || row.dot_number || row.dot);
    if (dot && (!options.missingOnly || shouldOverlayLead(row))) {
      const postgresCarrier = await findPostgresLeadOverlay(dot);
      if (postgresCarrier?.cargo) {
        output.push(overlayLeadWithPostgres(row, postgresCarrier, mode));
        continue;
      }

      if (enrichedCount < limit) {
        try {
          const liveCarrier = await enrichCarrierByDot(dot, { delayMs: options.delayMs });
          output.push(liveCarrier ? overlayLeadWithLive(row, liveCarrier, mode) : row);
          enrichedCount += 1;
          continue;
        } catch (err) {
          console.warn(`[FullEnrichment] Response enrichment skipped for DOT ${dot}:`, err.message);
        }
      }
    }
    output.push(row);
  }

  return output;
}

function staleDate(days = 7) {
  const date = new Date();
  date.setDate(date.getDate() - Number(days || 7));
  return date;
}

export async function enrichCarrierPool(options = {}) {
  if (!isMongoConnected()) {
    return { skipped: true, reason: "mongo-not-connected" };
  }

  const limit = Math.max(Number(options.limit ?? process.env.FULL_ENRICHMENT_BATCH_LIMIT ?? 100), 0);
  if (!limit) return { skipped: true, reason: "zero-limit" };

  const staleBefore = staleDate(options.staleDays ?? process.env.FULL_ENRICHMENT_STALE_DAYS ?? 7);
  const filter = {
    ...(options.filter || {}),
    dotNumber: { $exists: true, $ne: "" },
    $or: [
      { cargoTypes: { $size: 0 } },
      { lastFullEnrichedAt: { $exists: false } },
      { lastFullEnrichedAt: null },
      { lastFullEnrichedAt: { $lt: staleBefore } }
    ]
  };

  const carriers = await Carrier.find(filter)
    .sort({ lastFullEnrichedAt: 1, sourceLastSeenAt: -1, fleetSize: -1 })
    .limit(limit)
    .select({ dotNumber: 1 })
    .lean();

  const stats = { requested: carriers.length, enriched: 0, failed: 0 };
  for (const carrier of carriers) {
    try {
      await enrichCarrierByDot(carrier.dotNumber, { delayMs: options.delayMs });
      stats.enriched += 1;
    } catch (err) {
      stats.failed += 1;
      console.warn(`[FullEnrichment] DOT ${carrier.dotNumber} failed:`, err.message);
    }
  }

  return stats;
}

export async function enrichLeadPools(options = {}) {
  const now = new Date();
  const newLeadDays = Number(options.newLeadDays ?? process.env.FULL_ENRICHMENT_NEW_LEAD_DAYS ?? 90);
  const newLeadStart = new Date(now);
  newLeadStart.setDate(newLeadStart.getDate() - newLeadDays);
  const renewalEnd = new Date(now);
  renewalEnd.setDate(renewalEnd.getDate() + Number(options.renewalDays ?? process.env.FULL_ENRICHMENT_RENEWAL_DAYS ?? 90));

  const perPoolLimit = Math.max(Number(options.limit ?? process.env.FULL_ENRICHMENT_BATCH_LIMIT ?? 100), 0);
  const newLeadStats = newLeadDays > 0
    ? await enrichCarrierPool({
      filter: {
        $or: [
          { isNewLead: true, newLeadSince: { $gte: newLeadStart } },
          { dateCreated: { $gte: newLeadStart } }
        ]
      },
      limit: perPoolLimit,
      delayMs: options.delayMs
    })
    : { skipped: true, reason: "new-lead-enrichment-disabled" };

  const renewalStats = await enrichCarrierPool({
    filter: {
      insuranceExpirationDate: {
        $gte: now,
        $lte: renewalEnd
      }
    },
    limit: perPoolLimit,
    delayMs: options.delayMs
  });

  return { newLeadStats, renewalStats };
}

export { hasCargoData, dataCompletenessScore };
