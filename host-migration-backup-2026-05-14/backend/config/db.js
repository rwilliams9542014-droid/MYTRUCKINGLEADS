import dotenv from "dotenv";
import pkg from "pg";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env") });

const { Pool } = pkg;
const connectionString = process.env.DATABASE_URL;

console.log("Database config:", connectionString ? "configured" : "missing DATABASE_URL");

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
});

export async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
      console.warn(`Slow query detected (${duration}ms): ${text.substring(0, 50)}...`);
    }

    return result;
  } catch (err) {
    console.error("Database query error:", {
      query: text.substring(0, 100),
      error: err.message,
      duration: Date.now() - start
    });
    throw err;
  }
}

export async function closePool() {
  await pool.end();
  console.log("Database pool closed");
}
