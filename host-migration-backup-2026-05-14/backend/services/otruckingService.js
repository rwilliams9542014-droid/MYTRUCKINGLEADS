import axios from "axios";
import * as cheerio from "cheerio";

/**
 * OTrucking.com Scraper Service
 * Extracts carrier data from otrucking.com FMCSA carrier directory
 * Note: otrucking.com does NOT provide email addresses - use enrichment services for that
 */

const BASE_URL = "https://otrucking.com/carrier/";
const DETAIL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
};

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function parseNumber(value) {
  const parsed = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isNaN(parsed) ? null : parsed;
}

function textLines($) {
  return $("body").text().split(/\n+/).map(cleanText).filter(Boolean);
}

function indexOfLine(lines, label, start = 0) {
  return lines.findIndex((line, index) => index >= start && line.toLowerCase() === label.toLowerCase());
}

function valueAfter(lines, label) {
  const index = indexOfLine(lines, label);
  return index >= 0 ? lines[index + 1] || "" : "";
}

function valueBefore(lines, label) {
  const index = indexOfLine(lines, label);
  return index > 0 ? lines[index - 1] || "" : "";
}

function linesBetween(lines, startLabel, endLabels = []) {
  const start = indexOfLine(lines, startLabel);
  if (start === -1) return [];
  const end = lines.findIndex((line, index) => (
    index > start && endLabels.some(label => line.toLowerCase() === label.toLowerCase())
  ));
  return lines.slice(start + 1, end === -1 ? lines.length : end);
}

function parseEquipmentTypes(lines) {
  const section = linesBetween(lines, "Equipment Analysis", ["Need dispatch for this equipment type?", "Fleet Breakdown"]);
  const knownTypes = [
    "Dry Van",
    "Reefer",
    "Flatbed",
    "Step Deck",
    "Power Only",
    "Hotshot",
    "Box Truck",
    "Tanker",
    "Car Hauler",
    "Intermodal",
    "Movers"
  ];

  const text = section.join(" ");
  return knownTypes.filter(type => new RegExp(`\\b${type}\\b`, "i").test(text));
}

function parseInspectionHistory(lines) {
  const start = indexOfLine(lines, "Date", indexOfLine(lines, "Out-of-Service Rates vs National Average"));
  const end = lines.findIndex((line, index) => index > start && /^Showing \d+ of \d+ inspections\./i.test(line));
  if (start === -1 || end === -1) return [];

  const rows = [];
  for (let index = start + 5; index + 4 < end; index += 5) {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(lines[index])) break;
    rows.push({
      date: lines[index],
      state: lines[index + 1],
      level: lines[index + 2],
      violations: parseNumber(lines[index + 3]),
      outOfService: parseNumber(lines[index + 4]) || 0
    });
  }
  return rows;
}

function parseCrashEvents(lines) {
  const start = indexOfLine(lines, "Crash History");
  const header = indexOfLine(lines, "Date", start);
  const end = lines.findIndex((line, index) => index > header && line.startsWith("Crash data from FMCSA"));
  if (start === -1 || header === -1 || end === -1) return [];

  const rows = [];
  for (let index = header + 6; index + 5 < end; index += 6) {
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(lines[index])) break;
    rows.push({
      date: lines[index],
      state: lines[index + 1],
      location: lines[index + 2],
      fatal: parseNumber(lines[index + 3]),
      injuries: parseNumber(lines[index + 4]),
      tow: /^yes$/i.test(lines[index + 5])
    });
  }
  return rows;
}

function parseOTruckingDetailPage($, detailUrl) {
  const lines = textLines($);
  const dotLineIndex = lines.findIndex(line => /^DOT#\s*\d+/i.test(line));
  const topSummary = lines.slice(Math.max(0, dotLineIndex - 3), dotLineIndex + 24);
  const trustScoreIndex = indexOfLine(lines, "Carrier Trust Score");
  const trustScore = parseNumber(lines[trustScoreIndex - 2] || lines[trustScoreIndex - 1]);
  const safetyRecordIndex = indexOfLine(lines, "Safety Record");
  const safetyRatingIndex = indexOfLine(lines, "Safety Rating", safetyRecordIndex);
  const contactIndex = indexOfLine(lines, "Contact Information");
  const address = contactIndex >= 0
    ? [lines[contactIndex + 2], lines[contactIndex + 3]].filter(Boolean).join(", ")
    : "";
  const phone = contactIndex >= 0 ? lines[contactIndex + 5] || "" : "";
  const cellPhone = contactIndex >= 0 && /^Cell$/i.test(lines[contactIndex + 6] || "") ? lines[contactIndex + 7] || "" : "";
  const email = contactIndex >= 0 ? lines.find((line, index) => index > contactIndex && /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(line)) || "" : "";
  const crashEvents = parseCrashEvents(lines);
  const driverOosIndex = indexOfLine(lines, "Driver OOS Rate");
  const vehicleOosIndex = indexOfLine(lines, "Vehicle OOS Rate");

  return {
    detailUrl,
    source: "otrucking.com",
    companyName: lines[dotLineIndex - 1] || "",
    dotNumber: (lines[dotLineIndex] || "").match(/\d+/)?.[0] || "",
    mcNumber: (lines[dotLineIndex + 2] || "").match(/\d+/)?.[0] || "",
    status: topSummary.find(line => /active|inactive/i.test(line)) || "",
    carrierType: lines[dotLineIndex - 2] || valueAfter(lines, "Carrier Type"),
    trustScore,
    trustLabel: valueAfter(lines, "Carrier Trust Score"),
    trustSummary: lines.slice(
      lines.findIndex(line => line.startsWith("Computed from FMCSA public data")) + 2,
      indexOfLine(lines, "Power Units") - 1
    ).filter(Boolean),
    authorityAge: valueBefore(lines, "Authority Age"),
    overview: valueAfter(lines, "Company Overview"),
    equipmentTypes: parseEquipmentTypes(lines),
    fleetBreakdown: {
      trucks: {
        owned: parseNumber(lines[indexOfLine(lines, "Trucks") + 1]),
        termLeased: parseNumber(lines[indexOfLine(lines, "Trucks") + 2]),
        tripLeased: parseNumber(lines[indexOfLine(lines, "Trucks") + 3]),
        total: parseNumber(lines[indexOfLine(lines, "Trucks") + 4])
      },
      classification: (lines.find(line => line.startsWith("Fleet Size Classification:")) || "").replace("Fleet Size Classification:", "").trim()
    },
    cargoTypes: linesBetween(lines, "Authorized Cargo Types", ["Operations Scope"]).filter(line => !/authorized to transport/i.test(line)),
    operationsScope: valueAfter(lines, "Operations Scope"),
    mcs150Mileage: (lines.find(line => line.startsWith("MCS-150 Mileage:")) || "").replace("MCS-150 Mileage:", "").trim(),
    powerUnits: parseNumber(valueBefore(lines, "Power Units")),
    drivers: parseNumber(valueBefore(lines, "Drivers")),
    totalDrivers: parseNumber(valueBefore(lines, "Total Drivers")),
    interstateDrivers: parseNumber(valueBefore(lines, "Interstate Drivers")),
    safetyPerformance: {
      grade: valueAfter(lines, "Safety Performance"),
      gradeLabel: lines[indexOfLine(lines, "Safety Performance") + 2] || "",
      gradeSummary: lines[indexOfLine(lines, "Safety Performance") + 3] || "",
      inspections: parseNumber(valueBefore(lines, "Inspections")),
      violations: parseNumber(valueBefore(lines, "Violations")),
      outOfServiceOrders: parseNumber(valueBefore(lines, "Out of Service")),
      driverOosRate: driverOosIndex >= 0 ? lines[driverOosIndex + 1] || "" : "",
      driverOosNationalAverage: driverOosIndex >= 0 ? (lines[driverOosIndex + 2] || "").replace("Nat'l avg:", "").trim() : "",
      driverOosComparison: driverOosIndex >= 0 ? [lines[driverOosIndex + 3], lines[driverOosIndex + 4]].filter(Boolean).join(" ") : "",
      vehicleOosRate: vehicleOosIndex >= 0 ? lines[vehicleOosIndex + 1] || "" : "",
      vehicleOosNationalAverage: vehicleOosIndex >= 0 ? (lines[vehicleOosIndex + 2] || "").replace("Nat'l avg:", "").trim() : "",
      vehicleOosComparison: vehicleOosIndex >= 0 ? [lines[vehicleOosIndex + 3], lines[vehicleOosIndex + 4]].filter(Boolean).join(" ") : ""
    },
    inspectionHistory: parseInspectionHistory(lines),
    violationBreakdown: {
      totalViolations: parseNumber((lines.find(line => /Total Violations$/i.test(line)) || "").match(/\d+/)?.[0]),
      driverViolations: parseNumber(valueAfter(lines, "Driver Violations")),
      driverOutOfService: parseNumber((lines[indexOfLine(lines, "Driver Violations") + 3] || "").match(/\d+/)?.[0]),
      vehicleViolations: parseNumber(valueAfter(lines, "Vehicle Violations")),
      vehicleOutOfService: parseNumber((lines[indexOfLine(lines, "Vehicle Violations") + 3] || "").match(/\d+/)?.[0]),
      overallOutOfServiceRate: valueAfter(lines, "Overall Out-of-Service Rate"),
      overallOutOfServiceCount: lines[indexOfLine(lines, "Overall Out-of-Service Rate") + 2] || ""
    },
    insurance: {
      bipdCoverage: valueAfter(lines, "BIPD"),
      bipdCompany: lines[indexOfLine(lines, "BIPD") + 2] || "",
      cargo: valueAfter(lines, "Cargo"),
      bond: valueAfter(lines, "Bond")
    },
    crashHistory: {
      total: parseNumber(valueBefore(lines, "Total Crashes")),
      fatalities: parseNumber(valueBefore(lines, "Fatalities")),
      injuries: parseNumber(valueBefore(lines, "Injuries")),
      towAways: parseNumber(valueBefore(lines, "Tow-Aways")),
      events: crashEvents
    },
    contactInfo: {
      address,
      phone,
      cellPhone,
      email,
      companyOfficer: valueAfter(lines, "Company Officer"),
      companyOfficer2: valueAfter(lines, "Company Officer 2")
    },
    authority: {
      dotNumber: valueAfter(lines, "DOT Number"),
      mcNumber: valueAfter(lines, "MC Number"),
      status: valueAfter(lines, "Status"),
      mcStatus: valueAfter(lines, "MC#"),
      authoritySince: valueAfter(lines, "Authority Since")
    },
    businessDetails: {
      safetyRating: safetyRatingIndex >= 0 ? lines[safetyRatingIndex + 1] || "" : "",
      crashRate: valueAfter(lines, "Crash Rate"),
      carrierType: valueAfter(lines, "Carrier Type"),
      hazmat: valueAfter(lines, "Hazmat"),
      passengerCarrier: valueAfter(lines, "Passenger Carrier"),
      mcs150Update: valueAfter(lines, "MCS-150 Update"),
      fleetSize: valueAfter(lines, "Fleet Size"),
      county: valueAfter(lines, "County")
    }
  };
}

/**
 * Search for carriers on otrucking.com
 * @param {string} query - Company name or DOT#
 * @param {string} state - Optional state filter (e.g., "CA", "TX")
 * @returns {Promise<Array>} Array of carrier results
 */
export async function searchOTrucking(query, state = "") {
  try {
    const searchUrl = new URL(BASE_URL);
    searchUrl.searchParams.append("q", query);
    if (state) {
      searchUrl.searchParams.append("state", state);
    }

    console.log(`Searching otrucking.com: ${searchUrl.toString()}`);

    const response = await axios.get(searchUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const carriers = [];

    // Parse the carrier search results table
    $("table tbody tr").each((index, element) => {
      try {
        const cells = $(element).find("td");
        if (cells.length < 6) return; // Skip incomplete rows

        const companyLink = $(cells[0]).find("a").first();
        const companyName = companyLink.text().trim();
        const companyUrl = companyLink.attr("href");
        const dotNumber = $(cells[1]).text().trim();
        const location = $(cells[2]).text().trim();
        const powerUnits = $(cells[3]).text().trim();
        const equipment = $(cells[4]).text().trim();
        const status = $(cells[5]).text().trim();

        if (dotNumber && companyName) {
          carriers.push({
            companyName,
            dotNumber,
            mcNumber: null, // Will need to fetch from detail page
            location,
            state: location.split(",")[1]?.trim() || null,
            powerUnits: /^[^\d]+$/.test(powerUnits) ? null : parseInt(powerUnits) || null,
            equipment: /^[^\w]+$/.test(equipment) ? [] : equipment.split(/\s+(?=[A-Z])/).filter(e => e),
            status,
            detailUrl: companyUrl ? `https://otrucking.com${companyUrl}` : null,
            source: "otrucking.com"
          });
        }
      } catch (err) {
        console.error("Error parsing carrier row:", err.message);
      }
    });

    console.log(`Found ${carriers.length} carriers`);
    return carriers;
  } catch (err) {
    console.error("OTrucking search error:", err.message);
    throw new Error(`Failed to search otrucking.com: ${err.message}`);
  }
}

/**
 * Get detailed carrier information from otrucking.com detail page
 * INCLUDES: Email, phone, address, company officer info
 * @param {string} dotNumber - DOT number of carrier
 * @returns {Promise<Object>} Detailed carrier information with contact details
 */
export async function getOTruckingCarrierDetail(dotNumber) {
  try {
    // Search for the carrier first to get the detail URL
    const results = await searchOTrucking(dotNumber);
    
    if (results.length === 0) {
      throw new Error(`Carrier with DOT ${dotNumber} not found on otrucking.com`);
    }

    const carrier = results[0];
    
    if (!carrier.detailUrl) {
      console.warn(`No detail URL for carrier ${dotNumber}`);
      return carrier;
    }

    console.log(`Fetching details from: ${carrier.detailUrl}`);

    const response = await axios.get(carrier.detailUrl, {
      headers: DETAIL_HEADERS,
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const details = parseOTruckingDetailPage($, carrier.detailUrl);

    return {
      ...carrier,
      ...details,
      companyName: details.companyName || carrier.companyName,
      dotNumber: details.dotNumber || carrier.dotNumber,
      mcNumber: details.mcNumber || carrier.mcNumber,
      location: carrier.location,
      state: carrier.state,
      status: details.status || carrier.status,
      equipment: details.equipmentTypes?.length ? details.equipmentTypes : carrier.equipment
    };
  } catch (err) {
    console.error("OTrucking detail fetch error:", err.message);
    throw err;
  }
}

/**
 * Browse carriers by state from otrucking.com
 * @param {string} stateCode - State abbreviation (e.g., "CA", "TX")
 * @param {number} limit - Max number of results
 * @returns {Promise<Array>} Array of carriers in that state
 */
export async function browseCarriersByState(stateCode, limit = 50) {
  try {
    const searchUrl = new URL(BASE_URL);
    searchUrl.searchParams.append("state", stateCode);

    const response = await axios.get(searchUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const carriers = [];

    $("table tbody tr").slice(0, limit).each((index, element) => {
      try {
        const cells = $(element).find("td");
        if (cells.length < 6) return;

        const companyLink = $(cells[0]).find("a").first();
        const companyName = companyLink.text().trim();
        const companyUrl = companyLink.attr("href");
        const dotNumber = $(cells[1]).text().trim();
        const location = $(cells[2]).text().trim();

        if (dotNumber && companyName) {
          carriers.push({
            companyName,
            dotNumber,
            location,
            state: stateCode,
            status: $(cells[5]).text().trim(),
            detailUrl: companyUrl ? `https://otrucking.com${companyUrl}` : null,
            source: "otrucking.com"
          });
        }
      } catch (err) {
        console.error("Error parsing state browse row:", err.message);
      }
    });

    return carriers;
  } catch (err) {
    console.error("OTrucking state browse error:", err.message);
    throw err;
  }
}

/**
 * Batch search for multiple carriers
 * @param {Array<string>} queries - Array of company names or DOT#s
 * @returns {Promise<Array>} Array of all results
 */
export async function batchSearchOTrucking(queries) {
  const results = [];

  for (const query of queries) {
    try {
      const carriers = await searchOTrucking(query);
      results.push(...carriers);
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`Error searching for ${query}:`, err.message);
    }
  }

  return results;
}

export default {
  searchOTrucking,
  getOTruckingCarrierDetail,
  browseCarriersByState,
  batchSearchOTrucking
};

