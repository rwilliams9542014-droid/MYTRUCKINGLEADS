import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { closeMongo, connectMongo } from "../config/mongo.js";
import { importInsuranceExpirations } from "../services/insuranceEnrichmentService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

function parseArgs(argv) {
  const options = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, value = "true"] = arg.slice(2).split("=");
    options[key] = value;
  }
  return options;
}

function numberOption(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  await connectMongo({ required: true });

  const stats = await importInsuranceExpirations({
    from: args.from || process.env.INSURANCE_IMPORT_FROM || "",
    to: args.to || process.env.INSURANCE_IMPORT_TO || "",
    limit: numberOption(args.limit, Number(process.env.FMCSA_INSURANCE_IMPORT_LIMIT || 0)),
    batchSize: numberOption(args.batchSize, Number(process.env.FMCSA_INSURANCE_IMPORT_BATCH_SIZE || 1000)),
    startOffset: numberOption(args.offset, 0)
  });

  console.log(JSON.stringify(stats, null, 2));
}

main()
  .catch(err => {
    console.error("Insurance enrichment failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongo();
  });
