import assert from "node:assert/strict";
import { scoreQuoteRequest } from "../../services/marketplaceService.js";

function buildPayload(overrides = {}) {
  return {
    companyName: "Acme Transport LLC",
    dotNumber: "1234567",
    mcNumber: "MC123456",
    yearsInBusiness: 4,
    powerUnits: 2,
    driverCount: 2,
    cargoHauled: "Dry Van",
    statesOperated: "FL, GA",
    contactName: "Alex Carter",
    phoneNumber: "(555) 222-1000",
    emailAddress: "alex@example.com",
    currentInsuranceCompany: "Smith Insurance",
    renewalDate: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
    coverageTypesNeeded: "Auto liability, cargo",
    activelyShopping: false,
    ...overrides
  };
}

function buildDocument(type) {
  return {
    documentType: type,
    document_type: type,
    status: "pending"
  };
}

function testBronze() {
  const result = scoreQuoteRequest(buildPayload(), []);
  assert.equal(result.leadTier, "Bronze");
  assert.equal(result.leadPrice, 20);
  assert.equal(result.documentCompletionPercent, 0);
  console.log("PASS bronze lead scoring");
}

function testSilver() {
  const result = scoreQuoteRequest(
    buildPayload({
      powerUnits: 5,
      driverCount: 6,
      activelyShopping: true,
      renewalDate: new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10)
    }),
    [
      buildDocument("loss_runs"),
      buildDocument("current_policy_declarations_page")
    ]
  );

  assert.equal(result.leadTier, "Silver");
  assert.equal(result.leadPrice, 40);
  assert.equal(result.documentCount, 2);
  console.log("PASS silver lead scoring");
}

function testGold() {
  const result = scoreQuoteRequest(
    buildPayload({
      powerUnits: 12,
      driverCount: 15,
      activelyShopping: true,
      renewalDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
    }),
    [
      buildDocument("loss_runs"),
      buildDocument("current_policy_declarations_page"),
      buildDocument("vehicle_schedule"),
      buildDocument("driver_licenses"),
      buildDocument("truck_registrations")
    ]
  );

  assert.equal(result.leadTier, "Gold");
  assert.ok(result.leadPrice >= 75 && result.leadPrice <= 100);
  assert.ok(result.leadScore >= 80);
  console.log("PASS gold lead scoring");
}

testBronze();
testSilver();
testGold();
console.log("Marketplace scoring checks passed");
