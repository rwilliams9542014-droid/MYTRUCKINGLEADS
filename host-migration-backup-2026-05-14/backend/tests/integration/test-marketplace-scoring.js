import assert from "node:assert/strict";
import { scoreQuoteRequest } from "../../services/marketplaceService.js";

function dateFromToday(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

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
    renewalDate: dateFromToday(90),
    coverageTypesNeeded: "Auto liability, cargo",
    activelyShopping: false,
    coverageNeededWithin: "60 Days",
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

function testOneTruckMinimalInfoBronze() {
  const result = scoreQuoteRequest(
    buildPayload({
      powerUnits: 1,
      driverCount: 1,
      phoneNumber: "",
      emailAddress: "",
      renewalDate: "",
      currentInsuranceCompany: "",
      coverageTypesNeeded: "",
      activelyShopping: false,
      coverageNeededWithin: ""
    }),
    []
  );

  assert.equal(result.leadTier, "Bronze");
  assert.equal(result.leadPrice, 20);
  assert.equal(result.documentCount, 0);
  console.log("PASS 1-truck minimal-info lead stays Bronze");
}

function testOneTruckDocumentedSilver() {
  const result = scoreQuoteRequest(
    buildPayload({
      powerUnits: 1,
      driverCount: 1,
      renewalDate: dateFromToday(45),
      activelyShopping: false,
      coverageNeededWithin: "60 Days"
    }),
    [
      buildDocument("loss_runs"),
      buildDocument("driver_licenses")
    ]
  );

  assert.equal(result.leadTier, "Silver");
  assert.equal(result.leadPrice, 40);
  assert.equal(result.keyDocumentCount, 2);
  assert.equal(result.qualificationBadge, "Docs-Verified Silver");
  console.log("PASS 1-truck documented lead upgrades to Silver");
}

function testOneTruckStrongDocsGold() {
  const result = scoreQuoteRequest(
    buildPayload({
      powerUnits: 1,
      driverCount: 1,
      activelyShopping: true,
      renewalDate: dateFromToday(30),
      coverageNeededWithin: "30 Days"
    }),
    [
      buildDocument("loss_runs"),
      buildDocument("current_policy_declarations_page"),
      buildDocument("truck_registrations"),
      buildDocument("vehicle_schedule")
    ]
  );

  assert.equal(result.leadTier, "Gold");
  assert.ok(result.leadPrice >= 75 && result.leadPrice <= 100);
  assert.equal(result.strongDocumentPackage, true);
  assert.equal(result.qualificationBadge, "Docs-Forward Gold");
  console.log("PASS 1-truck quote-ready lead upgrades to Gold");
}

function testLargeFleetPoorInfoNotGold() {
  const result = scoreQuoteRequest(
    buildPayload({
      powerUnits: 12,
      driverCount: 12,
      phoneNumber: "",
      emailAddress: "",
      renewalDate: "",
      activelyShopping: false,
      currentInsuranceCompany: "",
      coverageTypesNeeded: "",
      coverageNeededWithin: ""
    }),
    []
  );

  assert.notEqual(result.leadTier, "Gold");
  assert.equal(result.leadTier, "Bronze");
  console.log("PASS large fleet without readiness does not auto-upgrade to Gold");
}

testOneTruckMinimalInfoBronze();
testOneTruckDocumentedSilver();
testOneTruckStrongDocsGold();
testLargeFleetPoorInfoNotGold();
console.log("Marketplace scoring checks passed");
