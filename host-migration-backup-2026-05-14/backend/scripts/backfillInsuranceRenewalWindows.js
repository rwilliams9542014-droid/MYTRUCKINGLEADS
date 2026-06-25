import { closePool } from "../config/db.js";
import { backfillInsuranceRenewalWindows } from "../services/insuranceFilingImportService.js";

async function main() {
  console.log("[InsuranceRenewalBackfill] Starting renewal window backfill...");
  const stats = await backfillInsuranceRenewalWindows();
  console.log("[InsuranceRenewalBackfill] Completed.");
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
