import { closePool } from "../config/db.js";
import {
  currentInsuranceFeedWarning,
  importInsuranceFilingsForRenewalWindow,
  importInsuranceFilingIntelligence,
  pruneInsuranceRenewalCache
} from "../services/insuranceFilingImportService.js";

function argValue(name, fallback = "") {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function main() {
  const limit = Number(argValue("--limit", process.env.INSURANCE_FILING_IMPORT_LIMIT || 2500));
  const skipHealth = process.argv.includes("--skip-health");
  const pruneCache = process.argv.includes("--prune-cache");
  const allowOutsideCache = process.argv.includes("--allow-outside-cache");
  const renewalFrom = argValue("--renewal-from", argValue("--from"));
  const renewalTo = argValue("--renewal-to", argValue("--to"));
  if (pruneCache) {
    console.log("[InsuranceFilingImport] Pruning renewal cache...");
    const pruneStats = await pruneInsuranceRenewalCache({
      from: renewalFrom || undefined,
      to: renewalTo || undefined
    });
    console.log("[InsuranceFilingImport] Prune completed.");
    console.log(JSON.stringify({ pruneStats }, null, 2));
    return;
  }
  console.log(`[InsuranceFilingImport] Starting import with limit ${limit}...`);
  const stats = renewalFrom && renewalTo
    ? await importInsuranceFilingsForRenewalWindow({
        from: renewalFrom,
        to: renewalTo,
        limit,
        skipHealth,
        enforceCacheWindow: !allowOutsideCache
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
