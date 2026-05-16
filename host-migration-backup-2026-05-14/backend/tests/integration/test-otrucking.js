/**
 * OTrucking Integration - Test Script
 * 
 * Run this file to test the otrucking scraper and email enrichment
 * 
 * Usage:
 * node test-otrucking.js
 */

import {
  searchOTrucking,
  getOTruckingCarrierDetail,
  browseCarriersByState,
  batchSearchOTrucking
} from "../../services/otruckingService.js";

import { enrichCarrierData } from "../../services/dataEnrichmentService.js";

// Test 1: Search for carriers
async function testSearch() {
  console.log("\n📌 TEST 1: Search OTrucking");
  console.log("================================");
  try {
    const results = await searchOTrucking("abc trucking", "MI");
    console.log(`✅ Found ${results.length} carriers`);
    if (results.length > 0) {
      console.log("\nFirst result:");
      console.log(JSON.stringify(results[0], null, 2));
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

// Test 2: Get carrier details
async function testDetail() {
  console.log("\n📌 TEST 2: Get Carrier Detail");
  console.log("================================");
  try {
    // Use a real DOT number - this one is from the search
    const results = await searchOTrucking("abc");
    
    if (results.length > 0) {
      const dotNumber = results[0].dotNumber;
      console.log(`Fetching details for DOT #${dotNumber}...`);
      
      const detail = await getOTruckingCarrierDetail(dotNumber);
      console.log("✅ Carrier Details:");
      console.log(JSON.stringify(detail, null, 2));
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

// Test 3: Browse by state
async function testBrowseState() {
  console.log("\n📌 TEST 3: Browse Carriers by State");
  console.log("================================");
  try {
    const carriers = await browseCarriersByState("TX", 10);
    console.log(`✅ Found ${carriers.length} carriers in Texas`);
    if (carriers.length > 0) {
      console.log("\nFirst 3 carriers:");
      carriers.slice(0, 3).forEach((c, i) => {
        console.log(`${i + 1}. ${c.companyName} (DOT: ${c.dotNumber})`);
      });
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

// Test 4: Batch search
async function testBatchSearch() {
  console.log("\n📌 TEST 4: Batch Search");
  console.log("================================");
  try {
    const queries = ["abc trucking", "xyz transport", "premier logistics"];
    console.log(`Searching for: ${queries.join(", ")}`);
    
    const results = await batchSearchOTrucking(queries);
    console.log(`✅ Found ${results.length} total carriers`);
    
    const byQuery = {};
    queries.forEach(q => byQuery[q] = results.filter(r => r.companyName.toLowerCase().includes(q.toLowerCase())).length);
    
    console.log("\nResults by query:");
    Object.entries(byQuery).forEach(([q, count]) => {
      console.log(`  - "${q}": ${count} results`);
    });
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

// Test 5: Full enrichment (Search + Email)
async function testFullEnrichment() {
  console.log("\n📌 TEST 5: Full Enrichment (Search + Email Lookup)");
  console.log("=================================================");
  try {
    console.log("Searching for 'abc' carriers...");
    const results = await searchOTrucking("abc", "");
    
    if (results.length === 0) {
      console.log("No carriers found");
      return;
    }
    
    const carrier = results[0];
    console.log(`\n📌 Enriching: ${carrier.companyName}`);
    console.log("  Scraper data:");
    console.log(`    - DOT: ${carrier.dotNumber}`);
    console.log(`    - Location: ${carrier.location}`);
    console.log(`    - Equipment: ${carrier.equipment.join(", ")}`);
    console.log(`    - Power Units: ${carrier.powerUnits}`);
    
    // Enrich with email data
    console.log("\n  Enriching with email data from Hunter, Apollo, etc...");
    const enriched = await enrichCarrierData(
      carrier.dotNumber,
      carrier.mcNumber || "",
      carrier.companyName,
      carrier.website || ""
    );
    
    console.log("\n✅ Enriched data:");
    console.log(`    - Email: ${enriched.email || "Not found"}`);
    console.log(`    - Phone: ${enriched.phone || "Not found"}`);
    console.log(`    - Address: ${enriched.address || "Not found"}`);
    console.log(`    - Website: ${enriched.website || "Not found"}`);
    console.log(`    - Sources: ${enriched.dataSources.join(", ")}`);
    
    if (enriched.additionalEmails?.length > 0) {
      console.log(`    - Additional Emails: ${enriched.additionalEmails.join(", ")}`);
    }
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
}

// Run all tests
async function runAllTests() {
  console.log("╔════════════════════════════════════════════════════╗");
  console.log("║      OTrucking Integration - Test Suite            ║");
  console.log("╚════════════════════════════════════════════════════╝");

  try {
    await testSearch();
    // Small delay between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));

    await testDetail();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await testBrowseState();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await testBatchSearch();
    await new Promise(resolve => setTimeout(resolve, 1000));

    await testFullEnrichment();

    console.log("\n╔════════════════════════════════════════════════════╗");
    console.log("║           ✅ All Tests Completed!                 ║");
    console.log("╚════════════════════════════════════════════════════╝");
  } catch (err) {
    console.error("\n❌ Fatal error:", err.message);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(err => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
