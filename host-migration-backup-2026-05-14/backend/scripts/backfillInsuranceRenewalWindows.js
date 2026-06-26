import { closePool } from "../config/db.js";
import { backfillInsuranceRenewalWindows } from "../services/insuranceFilingImportService.js";

function hasFlag(name) {
  return process.argv.slice(2).includes(name);
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  console.log(`[InsuranceRenewalBackfill] Starting renewal window backfill${dryRun ? " dry-run" : ""}...`);
  const stats = await backfillInsuranceRenewalWindows({ dryRun });
  console.log(`[InsuranceRenewalBackfill] ${dryRun ? "Dry-run completed without writes" : "Completed"}.`);
  console.log(JSON.stringify(stats, null, 2));
}

main()
  .catch((err) => {
    console.error("[InsuranceRenewalBackfill] Failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
