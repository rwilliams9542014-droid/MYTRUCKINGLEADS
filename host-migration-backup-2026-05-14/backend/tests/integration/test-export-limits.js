import assert from "node:assert/strict";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", "..", ".env") });

const { query } = await import("../../config/db.js");
const { claimMonthlyExportRows } = await import("../../utils/exportUsage.js");
const { getPlanAccessSummary } = await import("../../utils/planAccess.js");

const createdUserIds = [];

function randomIdentity(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

async function ensureExportColumns() {
  await query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS monthly_export_rows INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS monthly_export_reset_at TIMESTAMPTZ DEFAULT NOW()
  `);
}

async function createTestUser({ plan, monthlyExportRows = 0, monthlyExportResetAt, subscriptionStatus = "active" }) {
  const handle = randomIdentity("export-test");
  const result = await query(
    `INSERT INTO users (
       name, username, email, password_hash, plan, subscription_status,
       monthly_export_rows, monthly_export_reset_at, last_usage_reset_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     RETURNING id, plan, subscription_status, monthly_export_rows, monthly_export_reset_at`,
    [
      handle,
      handle,
      `${handle}@example.com`,
      "test-password-hash",
      plan,
      subscriptionStatus,
      monthlyExportRows,
      monthlyExportResetAt
    ]
  );

  const user = result.rows[0];
  createdUserIds.push(user.id);
  return user;
}

async function fetchUser(userId) {
  const result = await query(
    `SELECT id, plan, subscription_status, monthly_export_rows, monthly_export_reset_at
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return result.rows[0];
}

async function cleanupUsers() {
  if (!createdUserIds.length) return;
  await query("DELETE FROM users WHERE id = ANY($1::int[])", [createdUserIds]);
}

async function testStarterLimit() {
  const starter = await createTestUser({
    plan: "basic",
    monthlyExportRows: 250,
    monthlyExportResetAt: new Date().toISOString()
  });

  const access = getPlanAccessSummary(starter);
  assert.equal(access.monthlyExportLimit, 300);
  assert.equal(access.canUseTextMessaging, false);

  const usage = await claimMonthlyExportRows(starter, 40);
  assert.equal(usage.used, 290);
  assert.equal(usage.remaining, 10);

  const afterFirstClaim = await fetchUser(starter.id);
  assert.equal(afterFirstClaim.monthly_export_rows, 290);

  await assert.rejects(
    () => claimMonthlyExportRows(afterFirstClaim, 20),
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.match(err.message, /monthly limit/i);
      return true;
    }
  );

  const afterRejectedClaim = await fetchUser(starter.id);
  assert.equal(afterRejectedClaim.monthly_export_rows, 290);

  console.log("PASS starter export quota enforces 300 rows per month");
}

async function testProResetAndQuota() {
  const lastMonth = new Date();
  lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);

  const pro = await createTestUser({
    plan: "pro",
    monthlyExportRows: 999,
    monthlyExportResetAt: lastMonth.toISOString()
  });

  const access = getPlanAccessSummary(pro);
  assert.equal(access.monthlyExportLimit, 1000);
  assert.equal(access.canUseTextMessaging, true);

  const usage = await claimMonthlyExportRows(pro, 50);
  assert.equal(usage.used, 50);
  assert.equal(usage.remaining, 950);

  const afterClaim = await fetchUser(pro.id);
  assert.equal(afterClaim.monthly_export_rows, 50);

  console.log("PASS pro export quota resets monthly and allows texting access");
}

async function testAgencyUnlimited() {
  const premium = await createTestUser({
    plan: "premium",
    monthlyExportRows: 1200,
    monthlyExportResetAt: new Date().toISOString()
  });

  const access = getPlanAccessSummary(premium);
  assert.equal(access.monthlyExportLimit, null);
  assert.equal(access.canUseTextMessaging, true);

  const usage = await claimMonthlyExportRows(premium, 500);
  assert.equal(usage.used, 1700);
  assert.equal(usage.remaining, null);

  const afterClaim = await fetchUser(premium.id);
  assert.equal(afterClaim.monthly_export_rows, 1700);

  console.log("PASS agency unlimited keeps unlimited exports and texting access");
}

async function main() {
  console.log("Monthly export limit regression test");

  try {
    await ensureExportColumns();
    await testStarterLimit();
    await testProResetAndQuota();
    await testAgencyUnlimited();
    console.log("All export limit checks passed");
  } finally {
    await cleanupUsers();
  }
}

main().catch((err) => {
  console.error("Export limit regression test failed:", err);
  process.exit(1);
});
