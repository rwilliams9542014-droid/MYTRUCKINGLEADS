import cron from "node-cron";
import { connectMongo } from "../config/mongo.js";
import { importCarriersFromCensus } from "../services/carrierImportService.js";
import { enrichLeadPools } from "../services/carrierFullEnrichmentService.js";
import { importInsuranceExpirations } from "../services/insuranceEnrichmentService.js";
import { importCarriersFromMotusRegister } from "../services/motusRegisterImportService.js";

let scheduledTask = null;
let running = false;

function defaultDailyWhere() {
  const lookbackDays = Math.max(Number(process.env.FMCSA_DAILY_LOOKBACK_DAYS || 45), 1);
  const from = new Date();
  from.setUTCDate(from.getUTCDate() - lookbackDays);
  const compactDate = from.toISOString().slice(0, 10).replace(/-/g, "");
  return `add_date >= '${compactDate}'`;
}

export async function runDailyCarrierUpdate(options = {}) {
  if (running) {
    console.warn("[CarrierCron] Carrier update skipped because a previous run is still active.");
    return { skipped: true, reason: "already-running" };
  }

  running = true;
  const startedAt = new Date();

  try {
    await connectMongo({ required: true });
    console.log(`[CarrierCron] Daily carrier update started at ${startedAt.toISOString()}`);

    let motusStats = null;
    if (process.env.MOTUS_REGISTER_IMPORT_ENABLED !== "false") {
      motusStats = await importCarriersFromMotusRegister({
        from: options.motusFrom,
        to: options.motusTo
      });
    }

    const where = process.env.FMCSA_DAILY_WHERE || defaultDailyWhere();
    console.log(`[CarrierCron] FMCSA daily census filter: ${where}`);

    const stats = await importCarriersFromCensus({
      batchSize: Number(process.env.FMCSA_DAILY_BATCH_SIZE || process.env.FMCSA_IMPORT_BATCH_SIZE || 1000),
      limit: Number(process.env.FMCSA_DAILY_IMPORT_LIMIT || 0),
      where,
      ...options
    });

    let insuranceStats = null;
    if (process.env.CARRIER_CRON_INSURANCE_ENABLED !== "false") {
      insuranceStats = await importInsuranceExpirations({
        batchSize: Number(process.env.FMCSA_INSURANCE_IMPORT_BATCH_SIZE || 1000),
        limit: Number(process.env.FMCSA_INSURANCE_IMPORT_LIMIT || 0),
        to: options.insuranceTo || process.env.INSURANCE_IMPORT_TO || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
      });
    }

    let enrichmentStats = null;
    if (process.env.CARRIER_CRON_FULL_ENRICHMENT_ENABLED !== "false") {
      enrichmentStats = await enrichLeadPools({
        newLeadDays: Number(process.env.FULL_ENRICHMENT_NEW_LEAD_DAYS || 90),
        renewalDays: Number(process.env.FULL_ENRICHMENT_RENEWAL_DAYS || 90),
        limit: Number(process.env.FULL_ENRICHMENT_BATCH_LIMIT || 100)
      });
    }

    console.log("[CarrierCron] Daily carrier update finished:", { motusStats, carrierStats: stats, insuranceStats, enrichmentStats });
    return { motusStats, carrierStats: stats, insuranceStats, enrichmentStats };
  } catch (err) {
    console.error("[CarrierCron] Daily carrier update failed:", err);
    throw err;
  } finally {
    running = false;
  }
}

export function startCarrierUpdateCron() {
  if (scheduledTask) return scheduledTask;

  const schedule = process.env.CARRIER_CRON_SCHEDULE || "0 2 * * *";
  const timezone = process.env.CARRIER_CRON_TIMEZONE || "America/New_York";

  scheduledTask = cron.schedule(
    schedule,
    () => {
      runDailyCarrierUpdate().catch(() => {
        // Error is already logged in runDailyCarrierUpdate.
      });
    },
    { timezone }
  );

  console.log(`[CarrierCron] Scheduled carrier update: "${schedule}" (${timezone})`);
  return scheduledTask;
}

export function stopCarrierUpdateCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}
