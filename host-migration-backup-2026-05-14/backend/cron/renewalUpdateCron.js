import cron from "node-cron";
import { connectMongo } from "../config/mongo.js";
import { enrichLeadPools } from "../services/carrierFullEnrichmentService.js";
import { importInsuranceExpirations } from "../services/insuranceEnrichmentService.js";

let scheduledTask = null;
let running = false;

export async function runMonthlyRenewalUpdate(options = {}) {
  if (running) {
    console.warn("[RenewalCron] Renewal update skipped because a previous run is still active.");
    return { skipped: true, reason: "already-running" };
  }

  running = true;
  const startedAt = new Date();

  try {
    await connectMongo({ required: true });
    console.log(`[RenewalCron] Renewal update started at ${startedAt.toISOString()}`);

    const stats = await importInsuranceExpirations({
      batchSize: Number(process.env.FMCSA_INSURANCE_IMPORT_BATCH_SIZE || 1000),
      limit: Number(process.env.FMCSA_INSURANCE_IMPORT_LIMIT || 0),
      to: options.to || process.env.INSURANCE_IMPORT_TO || new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
      ...options
    });

    const enrichmentStats = process.env.RENEWAL_CRON_FULL_ENRICHMENT_ENABLED === "false"
      ? null
      : await enrichLeadPools({
        newLeadDays: 0,
        renewalDays: Number(process.env.FULL_ENRICHMENT_RENEWAL_DAYS || 90),
        limit: Number(process.env.FULL_ENRICHMENT_BATCH_LIMIT || 100)
      });

    console.log("[RenewalCron] Renewal update finished:", { renewalStats: stats, enrichmentStats });
    return { renewalStats: stats, enrichmentStats };
  } catch (err) {
    console.error("[RenewalCron] Renewal update failed:", err);
    throw err;
  } finally {
    running = false;
  }
}

export function startRenewalUpdateCron() {
  if (scheduledTask) return scheduledTask;

  const schedule = process.env.RENEWAL_CRON_SCHEDULE || "0 3 * * *";
  const timezone = process.env.RENEWAL_CRON_TIMEZONE || process.env.CARRIER_CRON_TIMEZONE || "America/New_York";

  scheduledTask = cron.schedule(
    schedule,
    () => {
      runMonthlyRenewalUpdate().catch(() => {
        // Error is already logged in runMonthlyRenewalUpdate.
      });
    },
    { timezone }
  );

  console.log(`[RenewalCron] Scheduled renewal update: "${schedule}" (${timezone})`);
  return scheduledTask;
}

export function stopRenewalUpdateCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}
