import assert from "node:assert/strict";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { query } from "../../config/db.js";
import {
  getMarketplaceDocumentForDownload,
  purchaseMarketplaceLead
} from "../../services/marketplaceService.js";

const companyName = process.argv[2] || "Volume Persistence Trucking LLC";
const password = "Markettest1";

async function main() {
  const leadResult = await query(
    `SELECT id
     FROM quote_requests
     WHERE company_name = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [companyName]
  );

  assert.ok(leadResult.rows[0], `No quote request found for ${companyName}`);
  const leadId = leadResult.rows[0].id;

  const handle = `voltest-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const hash = await bcrypt.hash(password, 12);
  const userResult = await query(
    `INSERT INTO users (
       name, username, email, password_hash, plan, subscription_status,
       lead_state, last_usage_reset_at, monthly_export_rows, monthly_export_reset_at
     )
     VALUES ($1, $2, $3, $4, 'premium', 'active', 'FL', NOW(), 0, NOW())
     RETURNING id, username, email, plan, subscription_status`,
    [handle, handle, `${handle}@example.com`, hash]
  );

  const user = userResult.rows[0];

  const purchase = await purchaseMarketplaceLead(user, leadId);
  assert.equal(purchase.purchased, true);
  assert.ok(purchase.lead.documents.length > 0, "Expected at least one document on purchased lead");

  const document = await getMarketplaceDocumentForDownload({
    quoteRequestId: leadId,
    documentId: purchase.lead.documents[0].id,
    user,
    adminMode: false
  });

  console.log(JSON.stringify({
    leadId,
    userId: user.id,
    username: user.username,
    email: user.email,
    password,
    documentId: document.id,
    originalFilename: document.original_filename,
    storageLocation: document.storage_location
  }));
}

main().catch((err) => {
  console.error("Marketplace volume persistence setup failed:", err);
  process.exit(1);
});
