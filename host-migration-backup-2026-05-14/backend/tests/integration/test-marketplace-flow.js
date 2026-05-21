import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

process.env.MARKETPLACE_SKIP_STRIPE_CHARGE = "true";
process.env.MARKETPLACE_ELITE_EARLY_ACCESS_MINUTES = "0";

const { query } = await import("../../config/db.js");
const { ensureMarketplaceSchema } = await import("../../services/marketplaceSchemaService.js");
const {
  createMarketplaceQuoteRequest,
  deleteMarketplaceDocumentAdmin,
  ensureMarketplaceUploadDir,
  getMarketplaceAccessSummary,
  getMarketplaceDocumentForDownload,
  getMarketplaceLeadForUser,
  listMarketplaceLeadsForUser,
  purchaseMarketplaceLead,
  updateMarketplaceDocumentAdmin,
  updateMarketplaceLeadAdmin
} = await import("../../services/marketplaceService.js");

const createdUserIds = [];
const createdQuoteIds = [];
const tempFiles = [];

function randomIdentity(prefix) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

async function createTestUser({ plan, namePrefix }) {
  const handle = randomIdentity(namePrefix);
  const result = await query(
    `INSERT INTO users (
       name, username, email, password_hash, plan, subscription_status,
       lead_state, last_usage_reset_at, monthly_export_rows, monthly_export_reset_at
     )
     VALUES ($1, $2, $3, $4, $5, 'active', 'FL', NOW(), 0, NOW())
     RETURNING id, name, username, email, plan, subscription_status, lead_state`,
    [
      handle,
      handle,
      `${handle}@example.com`,
      "test-password-hash",
      plan
    ]
  );

  const user = result.rows[0];
  createdUserIds.push(user.id);
  return user;
}

async function createTempUpload(filename, mimeType, contents = "sample document", documentType = "other_supporting_documents") {
  const uploadDir = await ensureMarketplaceUploadDir();
  const storedName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${filename}`;
  const filePath = path.join(uploadDir, storedName);
  await fs.writeFile(filePath, contents, "utf8");
  tempFiles.push(filePath);
  const stat = await fs.stat(filePath);
  return {
    originalname: filename,
    filename: storedName,
    mimetype: mimeType,
    size: stat.size,
    path: filePath,
    documentType
  };
}

async function submitQuoteRequest(body, files) {
  const lead = await createMarketplaceQuoteRequest({
    body,
    files,
    req: {
      ip: "127.0.0.1",
      headers: {
        "user-agent": "marketplace-test"
      }
    }
  });
  createdQuoteIds.push(lead.id);
  return lead;
}

function daysFromNow(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function cleanup() {
  if (createdQuoteIds.length) {
    await query("DELETE FROM quote_requests WHERE id = ANY($1::int[])", [createdQuoteIds]);
  }
  if (createdUserIds.length) {
    await query("DELETE FROM users WHERE id = ANY($1::int[])", [createdUserIds]);
  }
  for (const filePath of tempFiles) {
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (err?.code !== "ENOENT") {
        console.warn("Cleanup warning:", err.message);
      }
    }
  }
}

async function testMarketplaceFlow() {
  await ensureMarketplaceSchema();

  const starterUser = await createTestUser({ plan: "basic", namePrefix: "market-starter" });
  const proUser = await createTestUser({ plan: "pro", namePrefix: "market-pro" });
  const eliteUser = await createTestUser({ plan: "premium", namePrefix: "market-elite" });

  const bronzeLead = await submitQuoteRequest(
    {
      companyName: "Bronze Carrier LLC",
      dotNumber: "1111111",
      mcNumber: "MC111111",
      yearsInBusiness: 1,
      powerUnits: 2,
      driverCount: 2,
      cargoHauled: "Dry Van",
      statesOperated: "FL, GA",
      contactName: "Bronze Owner",
      contactTitle: "Owner",
      phoneNumber: "(555) 100-2000",
      emailAddress: "bronze@example.com",
      currentInsuranceCompany: "Carrier Mutual",
      currentPremium: "",
      renewalDate: daysFromNow(95),
      coverageTypesNeeded: "Auto liability",
      activelyShopping: "no",
      coverageNeededWithin: "90 Days",
      additionalComments: "Basic lead."
    },
    []
  );

  const silverLead = await submitQuoteRequest(
    {
      companyName: "Silver Carrier LLC",
      dotNumber: "2222222",
      mcNumber: "MC222222",
      yearsInBusiness: 5,
      powerUnits: 6,
      driverCount: 8,
      cargoHauled: "Reefer",
      statesOperated: "TX, LA",
      contactName: "Silver Contact",
      contactTitle: "Controller",
      phoneNumber: "(555) 300-4000",
      emailAddress: "silver@example.com",
      currentInsuranceCompany: "Risk Shield",
      currentPremium: "45000",
      renewalDate: daysFromNow(45),
      coverageTypesNeeded: "Auto liability, cargo",
      activelyShopping: "yes",
      coverageNeededWithin: "30 Days",
      additionalComments: "Has current quote pressure."
    },
    [
      await createTempUpload("silver-loss-runs.pdf", "application/pdf", "loss runs", "loss_runs"),
      await createTempUpload("silver-policy.pdf", "application/pdf", "policy", "current_policy_declarations_page")
    ]
  );

  const goldLead = await submitQuoteRequest(
    {
      companyName: "Gold Fleet Logistics",
      dotNumber: "3333333",
      mcNumber: "MC333333",
      yearsInBusiness: 12,
      powerUnits: 14,
      driverCount: 18,
      cargoHauled: "Flatbed",
      statesOperated: "FL, GA, SC",
      contactName: "Gold Dispatcher",
      contactTitle: "Safety Director",
      phoneNumber: "(555) 900-1111",
      emailAddress: "gold@example.com",
      currentInsuranceCompany: "Premier Fleet",
      currentPremium: "98000",
      renewalDate: daysFromNow(30),
      coverageTypesNeeded: "Auto liability, cargo, physical damage",
      activelyShopping: "yes",
      coverageNeededWithin: "7 Days",
      additionalComments: "Need quick turnaround with full package."
    },
    [
      await createTempUpload("gold-loss-runs.pdf", "application/pdf", "loss runs", "loss_runs"),
      await createTempUpload("gold-policy.pdf", "application/pdf", "policy", "current_policy_declarations_page"),
      await createTempUpload("gold-vehicle-schedule.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "vehicles", "vehicle_schedule"),
      await createTempUpload("gold-registrations.pdf", "application/pdf", "registrations", "truck_registrations"),
      await createTempUpload("gold-driver-licenses.pdf", "application/pdf", "licenses", "driver_licenses")
    ]
  );

  assert.equal(bronzeLead.leadTier, "Bronze");
  assert.equal(silverLead.leadTier, "Silver");
  assert.equal(goldLead.leadTier, "Gold");
  assert.equal(silverLead.documents.length, 2);
  assert.ok(goldLead.documentCompletionPercent >= 66);

  const starterList = await listMarketplaceLeadsForUser(starterUser, {});
  const maskedSilver = starterList.leads.find((lead) => lead.id === silverLead.id);
  assert.equal(maskedSilver.masked, true);
  assert.equal(maskedSilver.companyName, null);
  console.log("PASS marketplace visibility masks lead details before purchase");

  const elitePurchase = await purchaseMarketplaceLead(eliteUser, goldLead.id);
  assert.equal(elitePurchase.purchased, true);
  assert.equal(elitePurchase.usedCredit, true);
  assert.equal(elitePurchase.pricePaid, 0);
  assert.equal(elitePurchase.freeLeadCreditsRemaining, 9);
  assert.equal(elitePurchase.lead.documents.length, 5);
  console.log("PASS elite lead credits unlock gold lead and reveal documents");

  const eliteAccess = await getMarketplaceAccessSummary(eliteUser);
  assert.equal(eliteAccess.freeLeadCreditsRemaining, 9);

  const starterPurchase = await purchaseMarketplaceLead(starterUser, bronzeLead.id);
  assert.equal(starterPurchase.usedCredit, false);
  assert.equal(starterPurchase.pricePaid, 20);
  assert.equal(starterPurchase.lead.companyName, "Bronze Carrier LLC");
  console.log("PASS starter lead purchase charges standard price and reveals lead");

  const starterLeadDetail = await getMarketplaceLeadForUser(starterUser, bronzeLead.id);
  assert.equal(starterLeadDetail.masked, undefined);
  assert.equal(starterLeadDetail.companyName, "Bronze Carrier LLC");
  console.log("PASS purchased lead reveals full details after purchase");

  await assert.rejects(
    () => purchaseMarketplaceLead(proUser, bronzeLead.id),
    (err) => {
      assert.match(err.message, /no longer available/i);
      return true;
    }
  );
  console.log("PASS duplicate purchase prevention blocks exclusive lead resale");

  const goldDoc = await getMarketplaceDocumentForDownload({
    quoteRequestId: goldLead.id,
    documentId: elitePurchase.lead.documents[0].id,
    user: eliteUser,
    adminMode: false
  });
  assert.ok(goldDoc.storage_location);
  console.log("PASS document download access works after purchase");

  const adminUpdatedLead = await updateMarketplaceLeadAdmin(silverLead.id, {
    leadTier: "Gold",
    leadPrice: 95,
    status: "Assigned"
  });
  assert.equal(adminUpdatedLead.leadTier, "Gold");
  assert.equal(adminUpdatedLead.status, "Assigned");

  const silverDocumentId = silverLead.documents[0].id;
  const updatedDocument = await updateMarketplaceDocumentAdmin({
    quoteRequestId: silverLead.id,
    documentId: silverDocumentId,
    status: "approved",
    reviewerId: eliteUser.id
  });
  assert.equal(updatedDocument.status, "approved");

  const deletedDocument = await deleteMarketplaceDocumentAdmin({
    quoteRequestId: silverLead.id,
    documentId: silverLead.documents[1].id
  });
  assert.ok(deletedDocument.id);
  console.log("PASS admin controls update lead settings and manage documents");
}

try {
  await testMarketplaceFlow();
  console.log("Marketplace integration checks passed");
} finally {
  await cleanup();
}
