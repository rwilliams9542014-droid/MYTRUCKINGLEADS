import { query } from "../config/db.js";

const SOCRATA_BASE_URL = "https://data.transportation.gov/resource";
const MOTUS_TRANSITION_DATE = new Date("2026-05-14T00:00:00.000Z");
const DEFAULT_IMPORT_LIMIT = Number(process.env.INSURANCE_FILING_IMPORT_LIMIT || 2500);
const DEFAULT_HEALTH_SCAN_LIMIT = Number(process.env.INSURANCE_SOURCE_HEALTH_SCAN_LIMIT || 600000);
const HEALTH_PAGE_SIZE = Number(process.env.INSURANCE_SOURCE_HEALTH_PAGE_SIZE || 50000);

export const INSURANCE_SOURCE_DEFINITIONS = [
  {
    name: "ActPendInsur - All With History",
    datasetId: "qh9u-swkp",
    sourceFamily: "legacy",
    type: "act_pend_insur",
    dateFields: ["trans_date", "cancl_effective_date", "effective_date"],
    recordDateField: "trans_date",
    import: true
  },
  {
    name: "Insur - All With History",
    datasetId: "ypjt-5ydn",
    sourceFamily: "legacy",
    type: "insur",
    dateFields: ["effective_date"],
    recordDateField: "effective_date",
    import: true
  },
  {
    name: "InsHist - All With History",
    datasetId: "6sqe-dvqs",
    sourceFamily: "legacy",
    type: "ins_hist",
    dateFields: ["cancl_effective_date", "effective_date"],
    recordDateField: "effective_date",
    import: true
  },
  {
    name: "Carrier - All With History",
    datasetId: "6eyk-hxee",
    sourceFamily: "legacy",
    type: "carrier",
    dateFields: [],
    recordDateField: "",
    import: false
  },
  {
    name: "AuthHist - All With History",
    datasetId: "9mw4-x3tu",
    sourceFamily: "legacy",
    type: "auth_hist",
    dateFields: ["disp_decided_date", "disp_served_date", "orig_served_date"],
    recordDateField: "disp_decided_date",
    import: false
  },
  {
    name: "Revocation - All With History",
    datasetId: "sa6p-acbp",
    sourceFamily: "legacy",
    type: "revocation",
    dateFields: ["order2_effective_date", "order1_serve_date"],
    recordDateField: "order2_effective_date",
    import: false
  },
  {
    name: "Rejected - All With History",
    datasetId: "96tg-4mhf",
    sourceFamily: "legacy",
    type: "rejected",
    dateFields: ["rej_date", "recv_date"],
    recordDateField: "rej_date",
    import: true
  },
  {
    name: "Motus Insur",
    datasetId: "x96h-evps",
    sourceFamily: "motus",
    type: "insur",
    dateFields: ["trans_date", "effective_date"],
    recordDateField: "trans_date",
    import: true
  },
  {
    name: "Motus InsHist",
    datasetId: "xe5s-wca7",
    sourceFamily: "motus",
    type: "ins_hist",
    dateFields: ["cancl_effective_date", "effective_date"],
    recordDateField: "effective_date",
    import: true
  },
  {
    name: "Motus Carrier",
    datasetId: "nakq-58th",
    sourceFamily: "motus",
    type: "carrier",
    dateFields: [],
    recordDateField: "",
    import: false
  },
  {
    name: "Motus AuthHist",
    datasetId: "dm5j-zc6c",
    sourceFamily: "motus",
    type: "auth_hist",
    dateFields: ["status_change_date"],
    recordDateField: "status_change_date",
    import: false
  },
  {
    name: "Motus RevokeSuspend",
    datasetId: "e67p-xyd5",
    sourceFamily: "motus",
    type: "revocation",
    dateFields: ["order1_effective_date", "order1_serve_date"],
    recordDateField: "order1_effective_date",
    import: false
  }
];

function sourceUrl(datasetId) {
  return `${SOCRATA_BASE_URL}/${datasetId}.json`;
}

function clean(value) {
  return String(value || "").trim();
}

function dotNumber(value) {
  const digits = clean(value).replace(/\D/g, "");
  if (!digits) return "";
  const normalized = String(Number(digits));
  return normalized === "0" ? "" : normalized;
}

function docketNumber(value) {
  return clean(value).toUpperCase();
}

function dateOrNull(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = clean(value);
  if (!text) return null;
  const usDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const compactDate = text.match(/^(\d{4})(\d{2})(\d{2})(?:\s+\d{4})?$/);
  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const normalized = usDate
    ? `${usDate[3]}-${usDate[1].padStart(2, "0")}-${usDate[2].padStart(2, "0")}`
    : compactDate
      ? `${compactDate[1]}-${compactDate[2]}-${compactDate[3]}`
      : isoDate?.[0] || text;
  const parsed = new Date(`${normalized.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateOnly(value) {
  const date = dateOrNull(value);
  return date ? date.toISOString().slice(0, 10) : null;
}

function addMonths(value, months) {
  const date = new Date(value.getTime());
  date.setUTCMonth(date.getUTCMonth() + months);
  return date;
}

function addDays(value, days) {
  const date = new Date(value.getTime());
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

function addYears(value, years) {
  const date = new Date(value.getTime());
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date;
}

function monthKeysBetween(startValue, endValue) {
  const start = dateOrNull(startValue);
  const end = dateOrNull(endValue);
  if (!start || !end) return [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const months = [];
  while (cursor <= last) {
    months.push({
      year: cursor.getUTCFullYear(),
      month: String(cursor.getUTCMonth() + 1).padStart(2, "0")
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function renewalEffectiveRange(startValue, endValue) {
  const start = dateOrNull(startValue);
  const end = dateOrNull(endValue);
  if (!start || !end) return null;
  return {
    start: addDays(addYears(start, -1), -15),
    end: addDays(addYears(end, -1), 30)
  };
}

function estimatedRenewalWindowFromEffective(value) {
  const effectiveDate = dateOrNull(value);
  if (!effectiveDate) return null;
  const renewalDate = addYears(effectiveDate, 1);
  return {
    renewalDate,
    start: addDays(renewalDate, -30),
    end: addDays(renewalDate, 15)
  };
}

function eventDateInLeadWindow(value, days = 90) {
  const date = dateOrNull(value);
  if (!date) return false;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + days);
  return date >= today && date <= end;
}

async function fetchJson(datasetId, params = {}) {
  const url = new URL(sourceUrl(datasetId));
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  if (process.env.SOCRATA_APP_TOKEN) url.searchParams.set("$$app_token", process.env.SOCRATA_APP_TOKEN);
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${response.status} from ${datasetId}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

async function fetchCount(datasetId) {
  const rows = await fetchJson(datasetId, { "$select": "count(*)" });
  return Number(rows[0]?.count || 0);
}

async function fetchLatestDate(definition) {
  if (!definition.recordDateField) return null;
  let latest = null;
  for (let offset = 0; offset < DEFAULT_HEALTH_SCAN_LIMIT; offset += HEALTH_PAGE_SIZE) {
    const rows = await fetchJson(definition.datasetId, {
      "$select": definition.recordDateField,
      "$where": `${definition.recordDateField} is not null`,
      "$limit": HEALTH_PAGE_SIZE,
      "$offset": offset
    });
    if (!rows.length) break;
    for (const row of rows) {
      const date = dateOrNull(row?.[definition.recordDateField]);
      if (date && (!latest || date > latest)) latest = date;
    }
    if (rows.length < HEALTH_PAGE_SIZE) break;
  }
  return dateOnly(latest);
}

function sourceStatus(definition, latestRecordDate, recordCount) {
  if (!recordCount) return { status: "stale", safe: false, frozen: false };
  const latest = dateOrNull(latestRecordDate);
  if (definition.sourceFamily === "legacy" && latest && latest <= MOTUS_TRANSITION_DATE) {
    return { status: "frozen", safe: false, frozen: true };
  }
  if (definition.sourceFamily === "motus") {
    return { status: "healthy", safe: true, frozen: false };
  }
  return { status: "healthy", safe: true, frozen: false };
}

export async function ensureInsuranceIntelligenceTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS insurance_filing_snapshots (
      id SERIAL PRIMARY KEY,
      dot_number TEXT,
      docket_number TEXT,
      mc_number TEXT,
      legal_name TEXT,
      insurance_company TEXT,
      policy_number TEXT,
      form_code TEXT,
      filing_type TEXT,
      bipd_required BOOLEAN,
      bipd_on_file BOOLEAN,
      underlying_limit NUMERIC,
      max_coverage NUMERIC,
      posted_date DATE,
      effective_date DATE,
      cancel_effective_date DATE,
      cancellation_method TEXT,
      authority_status TEXT,
      source_name TEXT NOT NULL,
      source_record_id TEXT,
      source_file_date DATE,
      imported_at TIMESTAMPTZ DEFAULT NOW(),
      raw_data_json JSONB DEFAULT '{}'::jsonb
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS insurance_filing_events (
      id SERIAL PRIMARY KEY,
      dot_number TEXT,
      docket_number TEXT,
      mc_number TEXT,
      event_type TEXT NOT NULL,
      event_date DATE,
      event_source TEXT NOT NULL,
      insurance_company TEXT,
      policy_number TEXT,
      effective_date DATE,
      cancel_effective_date DATE,
      estimated_renewal_start DATE,
      estimated_renewal_end DATE,
      estimated_renewal_basis TEXT,
      estimated_renewal_confidence TEXT,
      estimated_renewal_note TEXT,
      old_value TEXT,
      new_value TEXT,
      confidence TEXT NOT NULL,
      lead_priority TEXT NOT NULL DEFAULT 'Normal',
      verification_status TEXT NOT NULL DEFAULT 'Verification Pending',
      last_verified_at TIMESTAMPTZ,
      source_record_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      raw_data_json JSONB DEFAULT '{}'::jsonb
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS insurance_source_health (
      id SERIAL PRIMARY KEY,
      source_name TEXT NOT NULL UNIQUE,
      source_url TEXT NOT NULL,
      dataset_id TEXT,
      last_checked_at TIMESTAMPTZ,
      last_success_at TIMESTAMPTZ,
      latest_record_date DATE,
      record_count INTEGER,
      status TEXT NOT NULL,
      frozen BOOLEAN NOT NULL DEFAULT false,
      safe_for_current_leads BOOLEAN NOT NULL DEFAULT false,
      error_message TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`ALTER TABLE insurance_filing_events ADD COLUMN IF NOT EXISTS estimated_renewal_start DATE`);
  await query(`ALTER TABLE insurance_filing_events ADD COLUMN IF NOT EXISTS estimated_renewal_end DATE`);
  await query(`ALTER TABLE insurance_filing_events ADD COLUMN IF NOT EXISTS estimated_renewal_basis TEXT`);
  await query(`ALTER TABLE insurance_filing_events ADD COLUMN IF NOT EXISTS estimated_renewal_confidence TEXT`);
  await query(`ALTER TABLE insurance_filing_events ADD COLUMN IF NOT EXISTS estimated_renewal_note TEXT`);
  await query(`ALTER TABLE insurance_filing_events ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'Verification Pending'`);
  await query(`ALTER TABLE insurance_filing_events ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ`);
  await query(`ALTER TABLE insurance_filing_events ADD COLUMN IF NOT EXISTS source_record_id TEXT`);
  await query(`ALTER TABLE insurance_source_health ADD COLUMN IF NOT EXISTS dataset_id TEXT`);
  await query(`ALTER TABLE insurance_source_health ADD COLUMN IF NOT EXISTS frozen BOOLEAN NOT NULL DEFAULT false`);
  await query(`ALTER TABLE insurance_source_health ADD COLUMN IF NOT EXISTS safe_for_current_leads BOOLEAN NOT NULL DEFAULT false`);

  await query(`CREATE INDEX IF NOT EXISTS idx_insurance_snapshots_dot ON insurance_filing_snapshots (dot_number, imported_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_insurance_snapshots_cancel ON insurance_filing_snapshots (cancel_effective_date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_insurance_events_dot ON insurance_filing_events (dot_number, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_insurance_events_date_type ON insurance_filing_events (event_type, event_date)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_insurance_events_estimated_window ON insurance_filing_events (estimated_renewal_start, estimated_renewal_end)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_insurance_events_source_record ON insurance_filing_events (source_record_id, event_type)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_insurance_health_status ON insurance_source_health (status)`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_insurance_snapshot_source_record
    ON insurance_filing_snapshots (source_record_id)
    WHERE source_record_id IS NOT NULL`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_insurance_event_source_record_type_dates
    ON insurance_filing_events (
      source_record_id,
      event_type,
      COALESCE(event_date, DATE '0001-01-01'),
      COALESCE(effective_date, DATE '0001-01-01'),
      COALESCE(cancel_effective_date, DATE '0001-01-01')
    )
    WHERE source_record_id IS NOT NULL`);
}

async function upsertSourceHealth(definition, payload) {
  await query(
    `INSERT INTO insurance_source_health (
       source_name, source_url, dataset_id, last_checked_at, last_success_at,
       latest_record_date, record_count, status, frozen, safe_for_current_leads, error_message, updated_at
     )
     VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10, NOW())
     ON CONFLICT (source_name) DO UPDATE SET
       source_url = EXCLUDED.source_url,
       dataset_id = EXCLUDED.dataset_id,
       last_checked_at = EXCLUDED.last_checked_at,
       last_success_at = COALESCE(EXCLUDED.last_success_at, insurance_source_health.last_success_at),
       latest_record_date = EXCLUDED.latest_record_date,
       record_count = EXCLUDED.record_count,
       status = EXCLUDED.status,
       frozen = EXCLUDED.frozen,
       safe_for_current_leads = EXCLUDED.safe_for_current_leads,
       error_message = EXCLUDED.error_message,
       updated_at = NOW()`,
    [
      definition.name,
      sourceUrl(definition.datasetId),
      definition.datasetId,
      payload.lastSuccessAt || null,
      payload.latestRecordDate || null,
      payload.recordCount ?? null,
      payload.status,
      Boolean(payload.frozen),
      Boolean(payload.safeForCurrentLeads),
      payload.errorMessage || null
    ]
  );
}

export async function checkInsuranceSourceHealth() {
  await ensureInsuranceIntelligenceTables();
  const results = [];

  for (const definition of INSURANCE_SOURCE_DEFINITIONS) {
    try {
      const [recordCount, latestRecordDate] = await Promise.all([
        fetchCount(definition.datasetId),
        fetchLatestDate(definition).catch(() => null)
      ]);
      const status = sourceStatus(definition, latestRecordDate, recordCount);
      const payload = {
        sourceName: definition.name,
        sourceUrl: sourceUrl(definition.datasetId),
        datasetId: definition.datasetId,
        latestRecordDate,
        recordCount,
        status: status.status,
        frozen: status.frozen,
        safeForCurrentLeads: status.safe,
        errorMessage: ""
      };
      await upsertSourceHealth(definition, { ...payload, lastSuccessAt: new Date().toISOString() });
      results.push(payload);
    } catch (err) {
      const payload = {
        sourceName: definition.name,
        sourceUrl: sourceUrl(definition.datasetId),
        datasetId: definition.datasetId,
        latestRecordDate: null,
        recordCount: null,
        status: "down",
        frozen: false,
        safeForCurrentLeads: false,
        errorMessage: err.message
      };
      await upsertSourceHealth(definition, payload);
      results.push(payload);
    }
  }

  return results;
}

function getField(row, ...names) {
  for (const name of names) {
    const value = row?.[name];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return "";
}

function numberOrNull(value) {
  const parsed = Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function mapSnapshot(definition, row, sourceHealth) {
  const dot = dotNumber(getField(row, "dot_number", "usdot_number"));
  const docket = docketNumber(getField(row, "docket_number", "prefix_docket_number"));
  const formCode = clean(getField(row, "ins_form_code"));
  const filingType = clean(getField(row, "mod_col_1", "ins_type_desc", "ins_type_code", "filing_status_reason"));
  const effectiveDate = dateOnly(getField(row, "effective_date"));
  const cancelDate = dateOnly(getField(row, "cancl_effective_date"));
  const postedDate = dateOnly(getField(row, "trans_date", "recv_date", "rej_date"));

  return {
    dotNumber: dot,
    docketNumber: docket,
    mcNumber: docket,
    legalName: clean(getField(row, "legal_name")),
    insuranceCompany: clean(getField(row, "name_company", "insurance_company_name")),
    policyNumber: clean(getField(row, "policy_no")),
    formCode,
    filingType,
    bipdRequired: /bipd|91|82/i.test([formCode, filingType].join(" ")),
    bipdOnFile: Boolean(formCode || filingType),
    underlyingLimit: numberOrNull(getField(row, "underl_lim_amount", "min_cov_amount")),
    maxCoverage: numberOrNull(getField(row, "max_cov_amount")),
    postedDate,
    effectiveDate,
    cancelEffectiveDate: cancelDate,
    cancellationMethod: clean(getField(row, "cancl_method", "ins_cancl_form", "filing_status_reason")),
    authorityStatus: clean(getField(row, "op_auth_status", "common_stat", "contract_stat", "broker_stat")),
    sourceName: definition.name,
    sourceRecordId: [definition.datasetId, dot, docket, formCode, clean(getField(row, "policy_no")), effectiveDate, cancelDate].filter(Boolean).join(":"),
    sourceFileDate: sourceHealth.latestRecordDate,
    rawData: row
  };
}

async function insertSnapshot(snapshot) {
  await query(
    `INSERT INTO insurance_filing_snapshots (
       dot_number, docket_number, mc_number, legal_name, insurance_company, policy_number,
       form_code, filing_type, bipd_required, bipd_on_file, underlying_limit, max_coverage,
       posted_date, effective_date, cancel_effective_date, cancellation_method, authority_status,
       source_name, source_record_id, source_file_date, raw_data_json
     )
     VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11, $12,
       $13, $14, $15, $16, $17,
       $18, $19, $20, $21::jsonb
     )`,
    [
      snapshot.dotNumber || null,
      snapshot.docketNumber || null,
      snapshot.mcNumber || null,
      snapshot.legalName || null,
      snapshot.insuranceCompany || null,
      snapshot.policyNumber || null,
      snapshot.formCode || null,
      snapshot.filingType || null,
      snapshot.bipdRequired,
      snapshot.bipdOnFile,
      snapshot.underlyingLimit,
      snapshot.maxCoverage,
      snapshot.postedDate,
      snapshot.effectiveDate,
      snapshot.cancelEffectiveDate,
      snapshot.cancellationMethod || null,
      snapshot.authorityStatus || null,
      snapshot.sourceName,
      snapshot.sourceRecordId || null,
      snapshot.sourceFileDate,
      JSON.stringify(snapshot.rawData || {})
    ]
  );
}

function buildEvents(snapshot, sourceHealth) {
  const events = [];
  const sourceIsCurrent = Boolean(sourceHealth.safe_for_current_leads || sourceHealth.safeForCurrentLeads) && !sourceHealth.frozen;

  if (snapshot.cancelEffectiveDate) {
    events.push({
      eventType: sourceIsCurrent && eventDateInLeadWindow(snapshot.cancelEffectiveDate)
        ? "Verified Cancellation"
        : "Historical Insurance Record",
      eventDate: snapshot.cancelEffectiveDate,
      confidence: sourceIsCurrent ? "High" : "Historical",
      leadPriority: sourceIsCurrent && eventDateInLeadWindow(snapshot.cancelEffectiveDate) ? "High" : "Normal",
      verificationStatus: sourceIsCurrent ? "Verified Current" : "Historical Only"
    });
  }

  if (snapshot.effectiveDate) {
    const estimated = estimatedRenewalWindowFromEffective(snapshot.effectiveDate);
    events.push({
      eventType: "Estimated Renewal Window",
      eventDate: dateOnly(estimated.renewalDate),
      estimatedRenewalStart: dateOnly(estimated.start),
      estimatedRenewalEnd: dateOnly(estimated.end),
      estimatedRenewalBasis: "filing_effective_date",
      estimatedRenewalConfidence: "estimated",
      estimatedRenewalNote: "Estimated from public filing effective date. Not a verified cancellation.",
      confidence: "Estimated",
      leadPriority: "Normal",
      verificationStatus: sourceIsCurrent ? "Estimated" : "Estimated From Historical Baseline"
    });
  }

  if (/reject/i.test(snapshot.sourceName) || /reject/i.test(snapshot.filingType)) {
    events.push({
      eventType: "Insurance Filing Change",
      eventDate: snapshot.postedDate || snapshot.effectiveDate || snapshot.cancelEffectiveDate,
      confidence: sourceIsCurrent ? "High" : "Historical",
      leadPriority: sourceIsCurrent ? "High" : "Normal",
      verificationStatus: sourceIsCurrent ? "Verified Current" : "Historical Only"
    });
  }

  return events;
}

async function insertEvent(snapshot, event) {
  await query(
    `INSERT INTO insurance_filing_events (
       dot_number, docket_number, mc_number, event_type, event_date, event_source,
       insurance_company, policy_number, effective_date, cancel_effective_date,
       estimated_renewal_start, estimated_renewal_end, estimated_renewal_basis,
       estimated_renewal_confidence, estimated_renewal_note, new_value, confidence,
       lead_priority, verification_status, last_verified_at, source_record_id, raw_data_json
     )
     VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10,
       $11, $12, $13,
       $14, $15, $16, $17,
       $18, $19, $20, $21, $22::jsonb
     )`,
    [
      snapshot.dotNumber || null,
      snapshot.docketNumber || null,
      snapshot.mcNumber || null,
      event.eventType,
      event.eventDate || null,
      snapshot.sourceName,
      snapshot.insuranceCompany || null,
      snapshot.policyNumber || null,
      snapshot.effectiveDate || null,
      snapshot.cancelEffectiveDate || null,
      event.estimatedRenewalStart || null,
      event.estimatedRenewalEnd || null,
      event.estimatedRenewalBasis || null,
      event.estimatedRenewalConfidence || null,
      event.estimatedRenewalNote || null,
      event.eventType,
      event.confidence,
      event.leadPriority,
      event.verificationStatus,
      event.verificationStatus === "Verified Current" ? new Date() : null,
      snapshot.sourceRecordId || null,
      JSON.stringify(snapshot.rawData || {})
    ]
  );
}

function chunks(items, size = 100) {
  const result = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function placeholders(rowCount, columnCount, jsonColumns = []) {
  let param = 1;
  const jsonColumnSet = new Set(jsonColumns);
  return Array.from({ length: rowCount }, () => {
    const row = Array.from({ length: columnCount }, (_, columnIndex) => {
      const placeholder = `$${param++}`;
      return jsonColumnSet.has(columnIndex) ? `${placeholder}::jsonb` : placeholder;
    });
    return `(${row.join(", ")})`;
  }).join(", ");
}

async function insertSnapshotsBulk(snapshots) {
  for (const batch of chunks(snapshots)) {
    const values = [];
    for (const snapshot of batch) {
      values.push(
        snapshot.dotNumber || null,
        snapshot.docketNumber || null,
        snapshot.mcNumber || null,
        snapshot.legalName || null,
        snapshot.insuranceCompany || null,
        snapshot.policyNumber || null,
        snapshot.formCode || null,
        snapshot.filingType || null,
        snapshot.bipdRequired,
        snapshot.bipdOnFile,
        snapshot.underlyingLimit,
        snapshot.maxCoverage,
        snapshot.postedDate,
        snapshot.effectiveDate,
        snapshot.cancelEffectiveDate,
        snapshot.cancellationMethod || null,
        snapshot.authorityStatus || null,
        snapshot.sourceName,
        snapshot.sourceRecordId || null,
        snapshot.sourceFileDate,
        JSON.stringify(snapshot.rawData || {})
      );
    }

    await query(
      `INSERT INTO insurance_filing_snapshots (
         dot_number, docket_number, mc_number, legal_name, insurance_company, policy_number,
         form_code, filing_type, bipd_required, bipd_on_file, underlying_limit, max_coverage,
         posted_date, effective_date, cancel_effective_date, cancellation_method, authority_status,
         source_name, source_record_id, source_file_date, raw_data_json
       )
       VALUES ${placeholders(batch.length, 21, [20])}
       ON CONFLICT DO NOTHING`,
      values
    );
  }
}

async function insertEventsBulk(eventRows) {
  for (const batch of chunks(eventRows)) {
    const values = [];
    for (const { snapshot, event } of batch) {
      values.push(
        snapshot.dotNumber || null,
        snapshot.docketNumber || null,
        snapshot.mcNumber || null,
        event.eventType,
        event.eventDate || null,
        snapshot.sourceName,
        snapshot.insuranceCompany || null,
        snapshot.policyNumber || null,
        snapshot.effectiveDate || null,
        snapshot.cancelEffectiveDate || null,
        event.estimatedRenewalStart || null,
        event.estimatedRenewalEnd || null,
        event.estimatedRenewalBasis || null,
        event.estimatedRenewalConfidence || null,
        event.estimatedRenewalNote || null,
        event.eventType,
        event.confidence,
        event.leadPriority,
        event.verificationStatus,
        event.verificationStatus === "Verified Current" ? new Date() : null,
        snapshot.sourceRecordId || null,
        JSON.stringify(snapshot.rawData || {})
      );
    }

    await query(
      `INSERT INTO insurance_filing_events (
         dot_number, docket_number, mc_number, event_type, event_date, event_source,
         insurance_company, policy_number, effective_date, cancel_effective_date,
         estimated_renewal_start, estimated_renewal_end, estimated_renewal_basis,
         estimated_renewal_confidence, estimated_renewal_note, new_value, confidence,
         lead_priority, verification_status, last_verified_at, source_record_id, raw_data_json
       )
       VALUES ${placeholders(batch.length, 22, [21])}
       ON CONFLICT DO NOTHING`,
      values
    );
  }
}

async function latestHealthBySource() {
  const rows = await query(`SELECT * FROM insurance_source_health`).then((result) => result.rows);
  return new Map(rows.map((row) => [row.source_name, row]));
}

async function fetchImportRows(definition, limit) {
  const params = {
    "$limit": limit,
    "$order": definition.recordDateField ? `${definition.recordDateField} DESC` : undefined
  };
  if (definition.recordDateField) params.$where = `${definition.recordDateField} is not null`;
  return fetchJson(definition.datasetId, params);
}

async function fetchRowsForEffectiveRange(definition, effectiveStart, effectiveEnd, limit) {
  const months = monthKeysBetween(effectiveStart, effectiveEnd);
  const rows = [];
  const seen = new Set();
  const pageSize = Math.min(Math.max(Number(limit) || DEFAULT_IMPORT_LIMIT, 100), 5000);

  for (const { year, month } of months) {
    if (rows.length >= limit) break;
    const compactDates = definition.sourceFamily === "motus";
    const likePattern = compactDates ? `${year}${month}%` : `${month}/%/${year}`;
    for (let offset = 0; rows.length < limit; offset += pageSize) {
      const page = await fetchJson(definition.datasetId, {
        "$where": `effective_date like '${likePattern}'`,
        "$limit": pageSize,
        "$offset": offset
      }).catch((err) => {
        console.warn(`[InsuranceFilingImport] ${definition.name} targeted fetch skipped: ${err.message}`);
        return [];
      });
      if (!page.length) break;

      for (const row of page) {
        const effective = dateOrNull(row.effective_date);
        if (!effective || effective < effectiveStart || effective > effectiveEnd) continue;
        const key = JSON.stringify(row);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push(row);
        if (rows.length >= limit) break;
      }

      if (page.length < pageSize) break;
    }
  }

  return rows;
}

async function persistInsuranceRows(definition, rows, sourceHealth, stats) {
  const snapshots = [];
  const eventRows = [];

  for (const row of rows) {
    const snapshot = mapSnapshot(definition, row, sourceHealth);
    if (!snapshot.dotNumber && !snapshot.docketNumber) continue;
    snapshots.push(snapshot);
    stats.snapshotsInserted += 1;

    for (const event of buildEvents(snapshot, sourceHealth)) {
      eventRows.push({ snapshot, event });
      stats.eventsInserted += 1;
      if (event.eventType === "Verified Cancellation") stats.verifiedCancellationEvents += 1;
      if (event.eventType === "Estimated Renewal Window") stats.estimatedRenewalEvents += 1;
      if (event.eventType === "Historical Insurance Record") stats.historicalEvents += 1;
    }
  }

  await insertSnapshotsBulk(snapshots);
  await insertEventsBulk(eventRows);
}

export async function importInsuranceFilingIntelligence(options = {}) {
  await ensureInsuranceIntelligenceTables();
  const skipHealth = Boolean(options.skipHealth);
  const health = skipHealth ? [] : await checkInsuranceSourceHealth();
  const healthBySource = await latestHealthBySource();
  const limit = Number(options.limit || DEFAULT_IMPORT_LIMIT);
  const stats = {
    sourcesChecked: health.length,
    snapshotsInserted: 0,
    eventsInserted: 0,
    verifiedCancellationEvents: 0,
    estimatedRenewalEvents: 0,
    historicalEvents: 0,
    sources: health
  };

  for (const definition of INSURANCE_SOURCE_DEFINITIONS.filter((source) => source.import)) {
    const sourceHealth = healthBySource.get(definition.name) || {
      source_name: definition.name,
      latest_record_date: null,
      frozen: definition.sourceFamily === "legacy",
      safe_for_current_leads: definition.sourceFamily === "motus"
    };

    const rows = await fetchImportRows(definition, limit).catch((err) => {
      console.warn(`[InsuranceFilingImport] ${definition.name} import skipped: ${err.message}`);
      return [];
    });

    await persistInsuranceRows(definition, rows, sourceHealth, stats);
  }

  return stats;
}

export async function importInsuranceFilingsForRenewalWindow(options = {}) {
  await ensureInsuranceIntelligenceTables();
  const range = renewalEffectiveRange(options.from || options.start, options.to || options.end);
  if (!range) {
    const err = new Error("Valid from and to dates are required for renewal-window import.");
    err.status = 400;
    throw err;
  }

  const limit = Number(options.limit || DEFAULT_IMPORT_LIMIT);
  const skipHealth = Boolean(options.skipHealth);
  const health = skipHealth ? [] : await checkInsuranceSourceHealth();
  const healthBySource = await latestHealthBySource();
  const stats = {
    sourcesChecked: health.length,
    renewalWindow: {
      from: dateOnly(options.from || options.start),
      to: dateOnly(options.to || options.end),
      effectiveStart: dateOnly(range.start),
      effectiveEnd: dateOnly(range.end)
    },
    snapshotsInserted: 0,
    eventsInserted: 0,
    verifiedCancellationEvents: 0,
    estimatedRenewalEvents: 0,
    historicalEvents: 0,
    sources: health
  };

  for (const definition of INSURANCE_SOURCE_DEFINITIONS.filter((source) => source.import && source.dateFields.includes("effective_date"))) {
    const sourceHealth = healthBySource.get(definition.name) || {
      source_name: definition.name,
      latest_record_date: null,
      frozen: definition.sourceFamily === "legacy",
      safe_for_current_leads: definition.sourceFamily === "motus"
    };
    const rows = await fetchRowsForEffectiveRange(definition, range.start, range.end, limit);
    await persistInsuranceRows(definition, rows, sourceHealth, stats);
  }

  return stats;
}

function renewalWindowKey(row = {}) {
  return [
    row.source_record_id || "",
    dotNumber(row.dot_number),
    clean(row.docket_number),
    clean(row.policy_number),
    dateOnly(row.effective_date)
  ].join("|");
}

function hasMatchingEstimatedWindow(existing, estimated) {
  return (
    dateOnly(existing?.estimated_renewal_start) === dateOnly(estimated.start)
    && dateOnly(existing?.estimated_renewal_end) === dateOnly(estimated.end)
    && existing?.event_type === "Estimated Renewal Window"
  );
}

export async function backfillInsuranceRenewalWindows(options = {}) {
  const dryRun = Boolean(options.dryRun);
  if (!dryRun) await ensureInsuranceIntelligenceTables();
  const stats = {
    scanned: 0,
    with_effective_date: 0,
    windows_already_exist: 0,
    windows_would_create: 0,
    windows_would_update: 0,
    windows_created: 0,
    windows_updated: 0,
    skipped_no_effective_date: 0,
    skipped_invalid_effective_date: 0,
    records_with_cancel_date: 0,
    verified_cancel_dates_kept: 0,
    historical_only_records: 0,
    errors: 0
  };

  const [snapshotResult, eventResult] = await Promise.all([
    query(`
    SELECT s.*, h.safe_for_current_leads, h.frozen
    FROM insurance_filing_snapshots s
    LEFT JOIN insurance_source_health h ON h.source_name = s.source_name
  `),
    query(`
      SELECT source_record_id, dot_number, docket_number, policy_number, effective_date,
             event_type, estimated_renewal_start, estimated_renewal_end
      FROM insurance_filing_events
      WHERE event_type IN ('Estimated Renewal Window', 'Historical Renewal Estimate')
    `)
  ]);
  const existingByKey = new Map(eventResult.rows.map((row) => [renewalWindowKey(row), row]));

  for (const row of snapshotResult.rows) {
    stats.scanned += 1;
    if (!row.effective_date) {
      stats.skipped_no_effective_date += 1;
      if (row.cancel_effective_date) stats.historical_only_records += 1;
      continue;
    }
    stats.with_effective_date += 1;

    if (row.cancel_effective_date) {
      stats.records_with_cancel_date += 1;
      stats.verified_cancel_dates_kept += 1;
    }

    const estimated = estimatedRenewalWindowFromEffective(row.effective_date);
    if (!estimated) {
      stats.skipped_invalid_effective_date += 1;
      continue;
    }

    const sourceIsCurrent = Boolean(row.safe_for_current_leads) && !row.frozen;
    const eventType = "Estimated Renewal Window";
    const confidence = "Estimated";
    const verificationStatus = sourceIsCurrent ? "Estimated" : "Estimated From Historical Baseline";
    const note = "Estimated from public filing effective date. Not a verified cancellation.";
    const existing = existingByKey.get(renewalWindowKey(row));

    if (dryRun) {
      if (!existing) stats.windows_would_create += 1;
      else if (hasMatchingEstimatedWindow(existing, estimated)) stats.windows_already_exist += 1;
      else stats.windows_would_update += 1;
      continue;
    }

    try {
      const updated = await query(
        `UPDATE insurance_filing_events
         SET event_date = $1,
             event_type = $12,
             event_source = $2,
             insurance_company = $3,
             policy_number = $4,
             effective_date = $5,
             estimated_renewal_start = $6,
             estimated_renewal_end = $7,
             estimated_renewal_basis = 'filing_effective_date',
             estimated_renewal_confidence = 'estimated',
             estimated_renewal_note = $8,
             confidence = $9,
             verification_status = $10,
             raw_data_json = $11::jsonb
         WHERE event_type IN ('Estimated Renewal Window', 'Historical Renewal Estimate')
           AND (
             (source_record_id IS NOT NULL AND source_record_id = $13)
             OR (
               source_record_id IS NULL
               AND COALESCE(dot_number, '') = COALESCE($14, '')
               AND COALESCE(docket_number, '') = COALESCE($15, '')
               AND COALESCE(policy_number, '') = COALESCE($4, '')
               AND effective_date IS NOT DISTINCT FROM $5::date
             )
           )`,
        [
          dateOnly(estimated.renewalDate),
          row.source_name,
          row.insurance_company || null,
          row.policy_number || null,
          dateOnly(row.effective_date),
          dateOnly(estimated.start),
          dateOnly(estimated.end),
          note,
          confidence,
          verificationStatus,
          JSON.stringify(row.raw_data_json || {}),
          eventType,
          row.source_record_id || null,
          row.dot_number || null,
          row.docket_number || null
        ]
      );

      if (updated.rowCount > 0) {
        stats.windows_updated += updated.rowCount;
        continue;
      }

      await query(
        `INSERT INTO insurance_filing_events (
           dot_number, docket_number, mc_number, event_type, event_date, event_source,
           insurance_company, policy_number, effective_date, cancel_effective_date,
           estimated_renewal_start, estimated_renewal_end, estimated_renewal_basis,
           estimated_renewal_confidence, estimated_renewal_note, new_value, confidence,
           lead_priority, verification_status, last_verified_at, source_record_id, raw_data_json
         )
         VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, NULL,
           $10, $11, 'filing_effective_date',
           'estimated', $12, $4, $13,
           'Normal', $14, NULL, $15, $16::jsonb
         )`,
        [
          row.dot_number || null,
          row.docket_number || null,
          row.mc_number || null,
          eventType,
          dateOnly(estimated.renewalDate),
          row.source_name,
          row.insurance_company || null,
          row.policy_number || null,
          dateOnly(row.effective_date),
          dateOnly(estimated.start),
          dateOnly(estimated.end),
          note,
          confidence,
          verificationStatus,
          row.source_record_id || null,
          JSON.stringify(row.raw_data_json || {})
        ]
      );
      stats.windows_created += 1;
    } catch (err) {
      stats.errors += 1;
      console.warn(`[InsuranceRenewalBackfill] ${row.source_record_id || row.id} skipped: ${err.message}`);
    }
  }

  return stats;
}

function countSql(whereSql = "") {
  return `
    SELECT COUNT(*)::int AS count
    FROM insurance_filing_snapshots s
    LEFT JOIN insurance_source_health h ON h.source_name = s.source_name
    LEFT JOIN carriers c ON c.dot_number = s.dot_number
    LEFT JOIN enriched_carrier_data e ON e.carrier_id = c.id
    ${whereSql}
  `;
}

async function scalarCount(sql, params = []) {
  const result = await query(sql, params);
  return Number(result.rows[0]?.count || 0);
}

function addDebugFilter(filters, values, condition) {
  values.push(filters);
  return condition.replace("?", `$${values.length}`);
}

export async function debugInsuranceRenewalSearch(options = {}) {
  if (options.ensureSchema !== false) await ensureInsuranceIntelligenceTables();
  const start = dateOnly(options.start);
  const end = dateOnly(options.end);
  if (!start || !end) {
    const err = new Error("Valid start and end dates are required.");
    err.status = 400;
    throw err;
  }

  const state = clean(options.state).toUpperCase();
  const requireContact = ["1", "true", "yes"].includes(clean(options.requireContact).toLowerCase());
  const activeAuthorityOnly = ["1", "true", "yes"].includes(clean(options.activeAuthorityOnly).toLowerCase());
  const verifiedOnly = ["1", "true", "yes"].includes(clean(options.verifiedOnly).toLowerCase());
  const estimatedOnly = ["1", "true", "yes"].includes(clean(options.estimatedOnly).toLowerCase());
  const includeHistoricalRecords = ["1", "true", "yes"].includes(clean(options.includeHistoricalRecords).toLowerCase());
  const includeHistoricalEstimates = !["0", "false", "no"].includes(clean(options.includeHistoricalEstimates).toLowerCase());
  const insuranceCompany = clean(options.insuranceCompany);
  const minFleetSize = options.minFleetSize === undefined || options.minFleetSize === "" ? null : Number(options.minFleetSize);
  const maxFleetSize = options.maxFleetSize === undefined || options.maxFleetSize === "" ? null : Number(options.maxFleetSize);

  const counts = {};
  counts.totalInsuranceRecords = await scalarCount(countSql());
  counts.recordsFromFrozenHistoricalSource = await scalarCount(countSql("WHERE COALESCE(h.frozen, false) = true OR COALESCE(h.safe_for_current_leads, false) = false"));
  counts.recordsFromCurrentSource = await scalarCount(countSql("WHERE COALESCE(h.safe_for_current_leads, false) = true AND COALESCE(h.frozen, false) = false"));
  counts.recordsWithEffectiveDate = await scalarCount(countSql("WHERE s.effective_date IS NOT NULL"));
  counts.recordsWithCancelEffectiveDate = await scalarCount(countSql("WHERE s.cancel_effective_date IS NOT NULL"));
  counts.recordsWithEstimatedRenewalDate = await scalarCount(countSql("WHERE s.effective_date IS NOT NULL"));
  counts.recordsWithEstimatedRenewalWindow = await scalarCount(countSql("WHERE s.effective_date IS NOT NULL"));
  counts.recordsWithPolicyNumber = await scalarCount(countSql("WHERE NULLIF(s.policy_number, '') IS NOT NULL"));
  counts.recordsWithInsuranceCompany = await scalarCount(countSql("WHERE NULLIF(s.insurance_company, '') IS NOT NULL"));
  counts.recordsWithDotNumber = await scalarCount(countSql("WHERE NULLIF(s.dot_number, '') IS NOT NULL"));
  counts.recordsWithMcNumber = await scalarCount(countSql("WHERE NULLIF(COALESCE(s.mc_number, s.docket_number), '') IS NOT NULL"));
  counts.recordsWithContactPhoneOrEmail = await scalarCount(countSql("WHERE NULLIF(COALESCE(c.phone, e.phone, c.email, e.email), '') IS NOT NULL"));
  counts.cancelEffectiveDateInsideRange = await scalarCount(countSql("WHERE s.cancel_effective_date BETWEEN $1::date AND $2::date"), [start, end]);
  counts.effectiveDateInsideRange = await scalarCount(countSql("WHERE s.effective_date BETWEEN $1::date AND $2::date"), [start, end]);
  counts.effectiveDateOneYearPriorMatchesRange = await scalarCount(
    countSql("WHERE (s.effective_date + INTERVAL '1 year')::date BETWEEN $1::date AND $2::date"),
    [start, end]
  );

  const eventBaseParams = [start, end];
  const eventBaseWhere = `
    WHERE (
      (ev.event_type = 'Verified Cancellation' AND ev.cancel_effective_date BETWEEN $1::date AND $2::date)
      OR (ev.event_type = 'Insurance Filing Change' AND ev.event_date BETWEEN $1::date AND $2::date)
      OR (ev.event_type = 'Estimated Renewal Window'
          AND ev.estimated_renewal_start <= $2::date
          AND ev.estimated_renewal_end >= $1::date)
      ${includeHistoricalRecords ? "OR (ev.event_type IN ('Historical Insurance Record', 'Historical Renewal Estimate') AND COALESCE(ev.cancel_effective_date, ev.event_date, ev.effective_date) BETWEEN $1::date AND $2::date)" : ""}
    )
  `;
  const eventEstimatedOverlap = await scalarCount(
    `SELECT COUNT(*)::int AS count FROM insurance_filing_events ev
     WHERE ev.event_type = 'Estimated Renewal Window'
       AND ev.estimated_renewal_start <= $2::date
       AND ev.estimated_renewal_end >= $1::date`,
    eventBaseParams
  );
  const snapshotEstimatedOverlap = await scalarCount(
    countSql(`WHERE s.effective_date IS NOT NULL
      AND (s.effective_date + INTERVAL '1 year' - INTERVAL '30 days')::date <= $2::date
      AND (s.effective_date + INTERVAL '1 year' + INTERVAL '15 days')::date >= $1::date`),
    [start, end]
  );
  counts.estimatedRenewalWindowOverlapsRange = eventEstimatedOverlap + snapshotEstimatedOverlap;
  counts.verifiedCancellationCount = await scalarCount(
    `SELECT COUNT(*)::int AS count FROM insurance_filing_events ev
     WHERE ev.event_type = 'Verified Cancellation'
       AND ev.cancel_effective_date BETWEEN $1::date AND $2::date`,
    eventBaseParams
  );
  counts.insuranceFilingChangeCount = await scalarCount(
    `SELECT COUNT(*)::int AS count FROM insurance_filing_events ev
     WHERE ev.event_type = 'Insurance Filing Change'
       AND ev.event_date BETWEEN $1::date AND $2::date`,
    eventBaseParams
  );
  counts.historicalOnlyRecordsInsideRange = await scalarCount(
    `SELECT COUNT(*)::int AS count FROM insurance_filing_events ev
     WHERE ev.event_type = 'Historical Insurance Record'
       AND COALESCE(ev.cancel_effective_date, ev.event_date, ev.effective_date) BETWEEN $1::date AND $2::date`,
    eventBaseParams
  );

  const candidateCte = `
    WITH raw_candidates AS (
      SELECT ev.id, ev.dot_number, ev.docket_number, ev.policy_number, ev.event_type,
             c.hq_state, c.authority_status, c.vehicle_count,
             COALESCE(c.phone, e.phone) AS phone,
             COALESCE(c.email, e.email) AS email,
             ev.insurance_company,
             COALESCE(h.frozen, false) AS frozen,
             COALESCE(h.safe_for_current_leads, false) AS safe_for_current_leads
      FROM insurance_filing_events ev
      LEFT JOIN carriers c ON c.dot_number = ev.dot_number
      LEFT JOIN enriched_carrier_data e ON e.carrier_id = c.id
      LEFT JOIN insurance_source_health h ON h.source_name = ev.event_source
      ${eventBaseWhere}
    ),
    deduped AS (
      SELECT DISTINCT ON (COALESCE(NULLIF(dot_number, ''), NULLIF(docket_number, ''), id::text), event_type, COALESCE(policy_number, ''))
             *
      FROM raw_candidates
      ORDER BY COALESCE(NULLIF(dot_number, ''), NULLIF(docket_number, ''), id::text), event_type, COALESCE(policy_number, ''), id DESC
    )
  `;

  counts.rawCandidateEvents = await scalarCount(`${candidateCte} SELECT COUNT(*)::int AS count FROM raw_candidates`, eventBaseParams);
  counts.dedupedCandidateEvents = await scalarCount(`${candidateCte} SELECT COUNT(*)::int AS count FROM deduped`, eventBaseParams);
  counts.removedByDuplicateFilter = Math.max(0, counts.rawCandidateEvents - counts.dedupedCandidateEvents);

  const filterValues = [...eventBaseParams];
  const finalFilters = [];
  if (state) finalFilters.push(addDebugFilter(state, filterValues, "UPPER(COALESCE(hq_state, '')) = ?"));
  if (requireContact) finalFilters.push("NULLIF(COALESCE(phone, email), '') IS NOT NULL");
  if (activeAuthorityOnly) finalFilters.push("(authority_status ILIKE '%active%' OR authority_status ILIKE '%authorized%')");
  if (verifiedOnly) finalFilters.push("event_type = 'Verified Cancellation'");
  if (estimatedOnly) finalFilters.push("event_type = 'Estimated Renewal Window'");
  if (!includeHistoricalEstimates) finalFilters.push("event_type <> 'Historical Renewal Estimate'");
  if (!includeHistoricalRecords) finalFilters.push("event_type <> 'Historical Insurance Record'");
  if (insuranceCompany) finalFilters.push(addDebugFilter(`%${insuranceCompany}%`, filterValues, "insurance_company ILIKE ?"));
  if (Number.isFinite(minFleetSize)) finalFilters.push(addDebugFilter(minFleetSize, filterValues, "COALESCE(vehicle_count, 0) >= ?"));
  if (Number.isFinite(maxFleetSize)) finalFilters.push(addDebugFilter(maxFleetSize, filterValues, "COALESCE(vehicle_count, 0) <= ?"));

  const filterSql = finalFilters.length ? `WHERE ${finalFilters.join(" AND ")}` : "";
  counts.finalCountReturnedToUi = await scalarCount(`${candidateCte} SELECT COUNT(*)::int AS count FROM deduped ${filterSql}`, filterValues);
  if (!verifiedOnly && !includeHistoricalRecords && !state && !requireContact && !activeAuthorityOnly && !insuranceCompany && !Number.isFinite(minFleetSize) && !Number.isFinite(maxFleetSize)) {
    counts.finalCountReturnedToUi += snapshotEstimatedOverlap;
  }
  counts.removedByStateFilter = state
    ? await scalarCount(`${candidateCte} SELECT COUNT(*)::int AS count FROM deduped WHERE NOT (UPPER(COALESCE(hq_state, '')) = $3)`, [...eventBaseParams, state])
    : 0;
  counts.removedByActiveAuthorityFilter = activeAuthorityOnly
    ? await scalarCount(`${candidateCte} SELECT COUNT(*)::int AS count FROM deduped WHERE NOT (authority_status ILIKE '%active%' OR authority_status ILIKE '%authorized%')`, eventBaseParams)
    : 0;
  counts.removedByContactInfoRequiredFilter = requireContact
    ? await scalarCount(`${candidateCte} SELECT COUNT(*)::int AS count FROM deduped WHERE NULLIF(COALESCE(phone, email), '') IS NULL`, eventBaseParams)
    : 0;
  counts.removedBySourceHealthFrozenFilter = 0;

  return {
    range: { start, end },
    filters: {
      state: state || null,
      requireContact,
      activeAuthorityOnly,
      verifiedOnly,
      estimatedOnly,
      includeHistoricalRecords,
      includeHistoricalEstimates,
      insuranceCompany: insuranceCompany || null,
      minFleetSize: Number.isFinite(minFleetSize) ? minFleetSize : null,
      maxFleetSize: Number.isFinite(maxFleetSize) ? maxFleetSize : null
    },
    counts,
    notes: [
      "Final count is based on insurance_filing_events using cancellation BETWEEN, filing-change BETWEEN, and estimated-window overlap logic.",
      "Frozen historical sources are not removed by default; they are labeled as historical estimates."
    ]
  };
}

export async function listInsuranceSourceHealth() {
  await ensureInsuranceIntelligenceTables();
  const result = await query(`
    SELECT source_name, source_url, dataset_id, last_checked_at, last_success_at,
           latest_record_date, record_count, status, frozen, safe_for_current_leads,
           CASE
             WHEN frozen THEN 'Source appears frozen and is being used for historical reference only.'
             WHEN safe_for_current_leads THEN 'Source is available for current lead verification.'
             WHEN status = 'down' THEN COALESCE(error_message, 'Source unavailable.')
             ELSE 'Source is not safe for current cancellation lead generation.'
           END AS message,
           error_message
    FROM insurance_source_health
    ORDER BY source_name ASC
  `);
  return result.rows;
}

export async function currentInsuranceFeedWarning() {
  const rows = await listInsuranceSourceHealth();
  const hasCurrentCancellationSource = rows.some((row) => (
    row.safe_for_current_leads
    && !row.frozen
    && /Motus InsHist|Motus RevokeSuspend|Motus Insur/i.test(row.source_name)
  ));
  return hasCurrentCancellationSource
    ? ""
    : "Current insurance cancellation feed is unavailable. MyTruckingLeads is showing estimated renewal windows and historical insurance data until live source verification is restored.";
}
