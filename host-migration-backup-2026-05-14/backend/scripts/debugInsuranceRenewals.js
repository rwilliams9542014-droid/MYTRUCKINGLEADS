import { closePool } from "../config/db.js";
import { debugInsuranceRenewalSearch } from "../services/insuranceFilingImportService.js";

function argValue(name, fallback = "") {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

async function main() {
  const start = argValue("--start");
  const end = argValue("--end");
  const state = argValue("--state");
  if (!start || !end) {
    throw new Error("Usage: npm run insurance:debug-renewals -- --start=2026-08-01 --end=2026-08-25");
  }

  console.log("[InsuranceRenewalDebug] Running read-only renewal debug counts...");
  const report = await debugInsuranceRenewalSearch({
    start,
    end,
    state,
    ensureSchema: false
  });
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((err) => {
    console.error("[InsuranceRenewalDebug] Failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
