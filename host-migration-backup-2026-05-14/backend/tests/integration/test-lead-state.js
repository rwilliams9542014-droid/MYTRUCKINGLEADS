import assert from "node:assert/strict";

import { getAccountLeadState, resolvePlanLeadState } from "../../public/assets/js/lead-state.js";

function testAccountLeadStateLookup() {
  assert.equal(getAccountLeadState({ leadState: "fl" }), "FL");
  assert.equal(getAccountLeadState({ lead_state: "tx" }), "TX");
  assert.equal(getAccountLeadState({ access: { leadState: "ga" } }), "GA");
  console.log("PASS lead state lookup normalizes user and access payloads");
}

function testOneStatePlanFallsBackToAccountState() {
  const starterUser = { leadState: "FL" };

  assert.equal(
    resolvePlanLeadState({ selectedState: "", user: starterUser, oneStatePlan: true }),
    "FL"
  );
  assert.equal(
    resolvePlanLeadState({ selectedState: "GA", user: starterUser, oneStatePlan: true }),
    "FL"
  );
  console.log("PASS one-state plans always resolve searches to the account lead state when present");
}

function testOneStatePlanCanSetInitialState() {
  assert.equal(
    resolvePlanLeadState({ selectedState: "TX", user: {}, oneStatePlan: true }),
    "TX"
  );
  console.log("PASS one-state plans still allow an initial state selection before the account is locked");
}

function testAgencyUnlimitedKeepsRequestedState() {
  assert.equal(
    resolvePlanLeadState({ selectedState: "CA", user: { leadState: "FL" }, oneStatePlan: false }),
    "CA"
  );
  assert.equal(
    resolvePlanLeadState({ selectedState: "", user: { leadState: "FL" }, oneStatePlan: false }),
    ""
  );
  console.log("PASS agency unlimited keeps the requested state behavior");
}

testAccountLeadStateLookup();
testOneStatePlanFallsBackToAccountState();
testOneStatePlanCanSetInitialState();
testAgencyUnlimitedKeepsRequestedState();

console.log("Lead state resolution checks passed");
