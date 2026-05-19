import assert from "node:assert/strict";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", "..", ".env") });

const { query } = await import("../../config/db.js");
const { handleWebhook } = await import("../../services/stripeService.js");

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_test_secret";
const createdEventIds = [];

function createTestEvent(type) {
  return {
    id: `evt_test_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    object: "event",
    api_version: "2025-03-31.basil",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: null,
      idempotency_key: null
    },
    type,
    data: {
      object: {
        id: `obj_${crypto.randomBytes(4).toString("hex")}`
      }
    }
  };
}

function signPayload(payload, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedContent = `${timestamp}.${payload}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signedContent)
    .digest("hex");

  return `t=${timestamp},v1=${signature}`;
}

function createMockRequest(body, signature) {
  return {
    headers: {
      "stripe-signature": signature
    },
    body
  };
}

async function getStoredEvent(eventId) {
  const result = await query(
    `SELECT id, status, message
     FROM stripe_webhook_events
     WHERE id = $1`,
    [eventId]
  );

  return result.rows[0] || null;
}

async function cleanupEvents() {
  if (createdEventIds.length === 0) return;

  await query(
    "DELETE FROM stripe_webhook_events WHERE id = ANY($1::text[])",
    [createdEventIds]
  );
}

async function testRawBufferAccepted() {
  const event = createTestEvent("test.webhook.raw-buffer");
  const payload = JSON.stringify(event);
  const signature = signPayload(payload, STRIPE_WEBHOOK_SECRET);
  createdEventIds.push(event.id);

  const result = await handleWebhook(
    createMockRequest(Buffer.from(payload, "utf8"), signature)
  );

  assert.equal(result.eventId, event.id);
  assert.equal(result.duplicate, undefined);

  const storedEvent = await getStoredEvent(event.id);
  assert.ok(storedEvent, "expected webhook event to be recorded");
  assert.equal(storedEvent.status, "processed");

  console.log("PASS raw buffer webhook is accepted and recorded");
}

async function testDuplicateEventShortCircuits() {
  const event = createTestEvent("test.webhook.duplicate");
  const payload = JSON.stringify(event);
  const signature = signPayload(payload, STRIPE_WEBHOOK_SECRET);
  createdEventIds.push(event.id);

  await handleWebhook(createMockRequest(Buffer.from(payload, "utf8"), signature));
  const duplicateResult = await handleWebhook(
    createMockRequest(Buffer.from(payload, "utf8"), signature)
  );

  assert.equal(duplicateResult.eventId, event.id);
  assert.equal(duplicateResult.duplicate, true);

  const storedEvent = await getStoredEvent(event.id);
  assert.ok(storedEvent, "expected duplicate webhook event to remain recorded");
  assert.equal(storedEvent.status, "processed");

  console.log("PASS duplicate webhook is ignored after first processing");
}

async function testParsedBodyRejected() {
  const event = createTestEvent("test.webhook.parsed-body");
  const payload = JSON.stringify(event);
  const signature = signPayload(payload, STRIPE_WEBHOOK_SECRET);

  await assert.rejects(
    () => handleWebhook(createMockRequest(JSON.parse(payload), signature)),
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.match(err.message, /Webhook Error:/);
      return true;
    }
  );

  const storedEvent = await getStoredEvent(event.id);
  assert.equal(
    storedEvent,
    null,
    "expected parsed-body failure to happen before any webhook row is recorded"
  );

  console.log("PASS parsed JSON body is rejected before processing");
}

async function main() {
  console.log("Stripe webhook regression test");

  try {
    await testRawBufferAccepted();
    await testDuplicateEventShortCircuits();
    await testParsedBodyRejected();
    console.log("All webhook regression checks passed");
  } finally {
    await cleanupEvents();
  }
}

main().catch((err) => {
  console.error("Webhook regression test failed:", err);
  process.exit(1);
});
