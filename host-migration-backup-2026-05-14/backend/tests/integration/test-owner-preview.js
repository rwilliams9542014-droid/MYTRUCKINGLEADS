import assert from "node:assert/strict";

import {
  applyOwnerPreview,
  normalizeOwnerPreviewInput
} from "../../utils/ownerPreview.js";

function testNormalizeStarterPreview() {
  const preview = normalizeOwnerPreviewInput(
    { plan: "starter", subscriptionStatus: "active", leadState: "fl" },
    {}
  );

  assert.equal(preview.plan, "basic");
  assert.equal(preview.lead_state, "FL");
  assert.equal(preview.subscription_status, "active");
  console.log("PASS starter preview normalizes to internal basic plan");
}

function testNormalizeAgencyPreviewWithoutState() {
  const preview = normalizeOwnerPreviewInput(
    { plan: "agency", subscriptionStatus: "trialing", leadState: "" },
    {}
  );

  assert.equal(preview.plan, "premium");
  assert.equal(preview.lead_state, null);
  assert.equal(preview.subscription_status, "trialing");
  console.log("PASS agency preview supports an all-state configuration");
}

function testApplyPreviewPreservesActualOwnerValues() {
  const owner = {
    plan: "premium",
    lead_state: "FL",
    subscription_status: "active",
    subscription_expires_at: "2026-06-30T00:00:00.000Z"
  };
  const preview = normalizeOwnerPreviewInput(
    { plan: "pro", subscriptionStatus: "past_due", leadState: "tx" },
    owner
  );
  const applied = applyOwnerPreview(owner, preview);

  assert.equal(applied.plan, "pro");
  assert.equal(applied.lead_state, "TX");
  assert.equal(applied.subscription_status, "past_due");
  assert.equal(applied.owner_preview_active, true);
  assert.equal(applied.owner_actual_plan, "premium");
  assert.equal(applied.owner_actual_lead_state, "FL");
  assert.equal(applied.owner_actual_subscription_status, "active");
  console.log("PASS preview mode keeps the real owner account context for restoration");
}

function testStarterRequiresState() {
  assert.throws(
    () => normalizeOwnerPreviewInput({ plan: "basic", subscriptionStatus: "active", leadState: "" }, {}),
    /lead state/i
  );
  console.log("PASS one-state previews require a lead state");
}

testNormalizeStarterPreview();
testNormalizeAgencyPreviewWithoutState();
testApplyPreviewPreservesActualOwnerValues();
testStarterRequiresState();

console.log("Owner preview checks passed");
