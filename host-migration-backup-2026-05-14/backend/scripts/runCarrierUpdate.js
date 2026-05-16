import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { closeMongo } from "../config/mongo.js";
import { runDailyCarrierUpdate } from "../cron/carrierUpdateCron.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

runDailyCarrierUpdate()
  .then(stats => {
    console.log(JSON.stringify(stats, null, 2));
  })
  .catch(err => {
    console.error("Carrier update failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongo();
  });
