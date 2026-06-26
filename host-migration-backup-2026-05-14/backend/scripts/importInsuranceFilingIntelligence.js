import { closePool } from "../config/db.js";
import {
  currentInsuranceFeedWarning,
  importInsuranceFilingsForRenewalWindow,
  importInsuranceFilingIntelligence
} from "../services/insuranceFilingImportService.js";

function argValue(name, fallback = "") {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function main() {
  const limit = Number(argValue("--limit", process.env.INSURANCE_FILING_IMPORT_LIMIT || 2500));
  const skipHealth = process.argv.includes("--skip-health");
  const renewalFrom = argValue("--renewal-from", argValue("--from"));
  const renewalTo = argValue("--renewal-to", argValue("--to"));
  console.log(`[InsuranceFilingImport] Starting import with limit ${limit}...`);
  const stats = renewalFrom && renewalTo
    ? await importInsuranceFilingsForRenewalWindow({
        from: renewalFrom,
        to: renewalTo,
        limit,
        skipHealth
      })
    : await importInsuranceFilingIntelligence({ limit, skipHealth });
  console.log("[InsuranceFilingImport] Completed.");
  console.log(JSON.stringify({
    stats,
    warning: await currentInsuranceFeedWarning()
  }, null, 2));
}

main()
  .catch((err) => {
    console.error("[InsuranceFilingImport] Failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
