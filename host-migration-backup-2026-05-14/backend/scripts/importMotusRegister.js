import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { closeMongo, connectMongo } from "../config/mongo.js";
import { importCarriersFromMotusRegister, refreshMotusCandidateApprovals } from "../services/motusRegisterImportService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

function option(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

connectMongo({ required: true })
  .then(() => importCarriersFromMotusRegister({
    from: option("from"),
    to: option("to")
  }))
  .then(async importStats => ({
    importStats,
    approvalStats: await refreshMotusCandidateApprovals({
      limit: option("refresh-limit")
    })
  }))
  .then(stats => {
    console.log(JSON.stringify(stats, null, 2));
  })
  .catch(err => {
    console.error("Motus Daily Register import failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongo();
  });
