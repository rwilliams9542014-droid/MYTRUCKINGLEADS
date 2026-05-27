import axios from "axios";
import { withFmcsaCache } from "./fmcsaCacheService.js";
const FMCSA_WEBKEY = process.env.FMCSA_WEBKEY;
const FMCSA_BASE_URL = "https://mobile.fmcsa.dot.gov/qc/services";
const FMCSA_CENSUS_URL = "https://data.transportation.gov/resource/az4n-8mr2.json";
const FMCSA_SMS_BASE_URL = "https://ai.fmcsa.dot.gov/SMS";
const FMCSA_SAFER_URL = "https://safer.fmcsa.dot.gov/query.asp";
export const MOTUS_PORTAL_URL = "https://motus.dot.gov/";
export const FMCSA_TRANSITION_NOTICE = "FMCSA is transitioning registration services to Motus. Some legacy SAFER registration functions may move to Motus over time.";
const FMCSA_SMS_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `${FMCSA_SMS_BASE_URL}/`,
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 MyTruckingLeads/1.0"
};

function findFirstValue(node, keyPatterns) {
  if (!node || typeof node !== "object") return "";

  for (const [key, value] of Object.entries(node)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const isMatch = keyPatterns.some(pattern => normalizedKey.includes(pattern));

    if (isMatch && value !== null && value !== undefined && typeof value !== "object") {
      return String(value).trim();
    }

    if (typeof value === "object") {
      const nestedValue = findFirstValue(value, keyPatterns);
      if (nestedValue) return nestedValue;
    }
  }

  return "";
}

function findEmailInPayload(payload) {
  const directEmail = findFirstValue(payload, ["email", "emailaddress", "emailaddr"]);
  if (directEmail) return directEmail;

  const payloadText = JSON.stringify(payload);
  const emailMatch = payloadText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch?.[0] || "";
}

function buildAddress(...parts) {
  return parts.flat().filter(Boolean).map(part => String(part).trim()).filter(Boolean).join(", ");
}

function valueOrEmpty(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function escapeSocrataString(value) {
  return String(value || "").replace(/'/g, "''").trim();
}

function mapStatusCode(value) {
  const status = valueOrEmpty(value).toUpperCase();
  if (status === "A") return "Active";
  if (status === "I") return "Inactive";
  if (status === "P") return "Pending";
  return valueOrEmpty(value);
}

function getCarrierPayload(responseData) {
  return (
    responseData?.content?.carrier ||
    responseData?.content ||
    responseData?.carrier ||
    responseData ||
    {}
  );
}

function mapCensusCarrier(row) {
  if (!row) return null;

  const docket =
    row.docket1 ||
    row.docket2 ||
    row.docket3 ||
    "";

  const docketPrefix =
    row.docket1prefix ||
    row.docket2prefix ||
    row.docket3prefix ||
    "";

  return {
    carrierName: valueOrEmpty(row.legal_name || row.dba_name || "Unknown"),
    dot: valueOrEmpty(row.dot_number),
    mc: docket ? `${docketPrefix}${docket}` : "",
    safetyRating: valueOrEmpty(row.safety_rating || "Unknown"),
    safetyRatingDate: valueOrEmpty(row.safety_rating_date),
    authorityStatus: mapStatusCode(row.status_code),
    operatingAuthority: valueOrEmpty(row.classdef),
    carrierOperation: valueOrEmpty(row.carrier_operation),
    hazmatAuthorized: valueOrEmpty(row.hm_ind).toUpperCase() === "Y",
    passengerCarrier: valueOrEmpty(row.pc_flag || row.passenger_flag || row.passenger_carrier),
    companyOfficer1: valueOrEmpty(row.company_officer_1),
    companyOfficer2: valueOrEmpty(row.company_officer_2),
    dateCreated: valueOrEmpty(row.add_date),
    county: valueOrEmpty(row.phy_county || row.county),
    insuranceExpiration: "",
    cargo: "",
    email: valueOrEmpty(row.email_address),
    phone: valueOrEmpty(row.phone || row.cell_phone),
    fax: valueOrEmpty(row.fax),
    address: buildAddress(row.phy_street, row.phy_city, row.phy_state, row.phy_zip),
    mailingAddress: buildAddress(
      row.carrier_mailing_street,
      row.carrier_mailing_city,
      row.carrier_mailing_state,
      row.carrier_mailing_zip
    ),
    vehicleCount: row.power_units ? Number(row.power_units) : null,
    driverCount: row.total_drivers ? Number(row.total_drivers) : null,
    mcs150Date: valueOrEmpty(row.mcs150_date),
    mcs150Mileage: valueOrEmpty(row.mcs150_mileage || row.mileage),
    source: "FMCSA Company Census File / MCS-150 self-reported"
  };
}

function compactDateToEpochDays(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return 0;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.floor(date.getTime() / 86400000);
}

function censusRowStatusWeight(row = {}) {
  const status = valueOrEmpty(row.status_code).toUpperCase();
  if (status === "A") return 3;
  if (status === "P") return 2;
  if (status === "I") return 1;
  return 0;
}

function numberValue(value) {
  const parsed = Number(String(value || "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOrEmpty(value) {
  if (value === undefined || value === null || value === "") return "";
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : "";
}

function rateValue(value) {
  const parsed = numberOrEmpty(value);
  if (parsed === "") return "";
  return parsed <= 1 ? parsed * 100 : parsed;
}

function percentValue(numerator, denominator) {
  const num = numberOrEmpty(numerator);
  const den = numberOrEmpty(denominator);
  if (num === "" || den === "" || den <= 0) return "";
  return Math.round((num / den) * 1000) / 10;
}

function devFmcsaDebug(message, meta = {}) {
  if (process.env.NODE_ENV === "production") return;
  const safeMeta = { ...meta };
  delete safeMeta.webKey;
  delete safeMeta.FMCSA_WEBKEY;
  console.debug(`[FMCSA] ${message}`, safeMeta);
}

function normalizeNameForMatch(value) {
  return valueOrEmpty(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeName(value) {
  return normalizeNameForMatch(value).split(" ").filter(Boolean);
}

function docketFromRow(row = {}) {
  const docket =
    valueOrEmpty(row.docket1) ||
    valueOrEmpty(row.docket2) ||
    valueOrEmpty(row.docket3);
  const docketPrefix =
    valueOrEmpty(row.docket1prefix) ||
    valueOrEmpty(row.docket2prefix) ||
    valueOrEmpty(row.docket3prefix);
  return docket ? `${docketPrefix}${docket}` : "";
}

function censusAuthoritySignal(row = {}) {
  const values = [
    row.common_authority_status,
    row.contract_authority_status,
    row.broker_authority_status,
    row.common_authority_pending,
    row.contract_authority_pending,
    row.broker_authority_pending
  ].map(value => valueOrEmpty(value).toUpperCase()).filter(Boolean);

  if (values.some(value => ["A", "ACTIVE", "GRANTED", "Y", "YES"].includes(value))) return 250;
  if (values.some(value => ["P", "PENDING"].includes(value))) return 120;
  if (values.some(value => ["N", "NO", "I", "INACTIVE", "REVOKED"].includes(value))) return -60;
  return 0;
}

function censusInsuranceSignal(row = {}) {
  const values = [
    row.bipd_required,
    row.cargo_required,
    row.bond_required,
    row.ins_form_code
  ].map(value => valueOrEmpty(value).toUpperCase()).filter(Boolean);

  if (values.some(value => ["Y", "YES", "ACTIVE", "ON FILE", "CURRENT"].includes(value))) return 120;
  if (values.some(value => ["N", "NO", "CANCELLED", "EXPIRED", "INACTIVE"].includes(value))) return -40;
  return 0;
}

function censusOperatingSignal(row = {}) {
  const operation = valueOrEmpty(row.carrier_operation).toUpperCase();
  if (operation === "A") return 220;
  if (operation === "C") return 140;
  if (operation === "B") return 100;
  return operation ? 40 : 0;
}

function scoreCensusNameCandidate(row = {}, {
  name = "",
  state = "",
  city = "",
  mc = ""
} = {}) {
  const queryName = normalizeNameForMatch(name);
  const legalName = normalizeNameForMatch(row.legal_name);
  const dbaName = normalizeNameForMatch(row.dba_name);
  const queryTokens = tokenizeName(name);
  const legalTokens = new Set(tokenizeName(row.legal_name));
  const dbaTokens = new Set(tokenizeName(row.dba_name));
  const docket = valueOrEmpty(docketFromRow(row)).replace(/\s+/g, "");
  const preferredMc = valueOrEmpty(mc).replace(/\s+/g, "").toUpperCase();
  const rowState = valueOrEmpty(row.phy_state).toUpperCase();
  const rowCity = valueOrEmpty(row.phy_city).toUpperCase();
  const preferredState = valueOrEmpty(state).toUpperCase();
  const preferredCity = valueOrEmpty(city).toUpperCase();

  const exactLegalMatch = Boolean(queryName && legalName === queryName);
  const exactDbaMatch = Boolean(queryName && dbaName === queryName);
  const legalStartsWith = Boolean(queryName && !exactLegalMatch && legalName.startsWith(queryName));
  const dbaStartsWith = Boolean(queryName && !exactDbaMatch && dbaName.startsWith(queryName));
  const legalContains = Boolean(queryName && !exactLegalMatch && legalName.includes(queryName));
  const dbaContains = Boolean(queryName && !exactDbaMatch && dbaName.includes(queryName));
  const matchedTokenCount = queryTokens.reduce((count, token) => {
    if (legalTokens.has(token) || dbaTokens.has(token)) return count + 1;
    return count;
  }, 0);
  const fullTokenCoverage = Boolean(queryTokens.length && matchedTokenCount === queryTokens.length);
  const mcMatch = Boolean(preferredMc && docket.toUpperCase() === preferredMc);
  const stateMatch = Boolean(preferredState && rowState === preferredState);
  const cityMatch = Boolean(preferredCity && rowCity === preferredCity);

  let score = censusRowRankScore(row);
  if (exactLegalMatch) score += 150000;
  if (exactDbaMatch) score += 135000;
  if (legalStartsWith) score += 40000;
  if (dbaStartsWith) score += 32000;
  if (legalContains) score += 18000;
  if (dbaContains) score += 14000;
  if (matchedTokenCount > 0) score += matchedTokenCount * 1500;
  if (fullTokenCoverage) score += 6000;
  if (mcMatch) score += 45000;
  if (stateMatch) score += 4000;
  if (cityMatch) score += 2500;
  score += censusOperatingSignal(row);
  score += censusAuthoritySignal(row);
  score += censusInsuranceSignal(row);

  return {
    score,
    exactLegalMatch,
    exactDbaMatch,
    legalStartsWith,
    dbaStartsWith,
    legalContains,
    dbaContains,
    fullTokenCoverage,
    matchedTokenCount,
    mcMatch,
    stateMatch,
    cityMatch,
    docket,
    city: rowCity,
    state: rowState
  };
}

function censusRowRankScore(row = {}) {
  const statusWeight = censusRowStatusWeight(row) * 1000000;
  const mcs150Score = compactDateToEpochDays(row.mcs150_date);
  const powerUnitsScore = numberValue(row.power_units) * 120;
  const driversScore = numberValue(row.total_drivers) * 40;
  const docketScore = valueOrEmpty(row.docket1 || row.docket2 || row.docket3) ? 25 : 0;
  return statusWeight + mcs150Score + powerUnitsScore + driversScore + docketScore;
}

function selectBestCensusCarrierRow(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return [...rows].sort((left, right) => {
    return censusRowRankScore(right) - censusRowRankScore(left);
  })[0];
}

async function fetchCensusCarrierByDot(dot) {
  if (!dot) return null;

  return withFmcsaCache(
    { source: "fmcsa-census-dot", identifier: dot, dotNumber: dot },
    async () => {
      const response = await axios.get(FMCSA_CENSUS_URL, {
        params: {
          dot_number: dot,
          $limit: 1
        },
        headers: {
          Accept: "application/json"
        },
        timeout: 30000
      });

      return mapCensusCarrier(response.data?.[0]);
    }
  );
}

async function fetchCensusCarrierByName(name) {
  if (!name) return null;

  return withFmcsaCache(
    { source: "fmcsa-census-name", identifier: name },
    async () => {
      const response = await axios.get(FMCSA_CENSUS_URL, {
        params: {
          $q: name,
          $limit: 1
        },
        headers: {
          Accept: "application/json"
        },
        timeout: 30000
      });

      return mapCensusCarrier(response.data?.[0]);
    }
  );
}

async function fetchCensusCarrierRowsByExactName(name) {
  if (!name) return [];

  const escapedName = escapeSocrataString(name);
  if (!escapedName) return [];

  return withFmcsaCache(
    { source: "fmcsa-census-name-exact-rows-v1", identifier: escapedName },
    async () => {
      const response = await axios.get(FMCSA_CENSUS_URL, {
        params: {
          $where: `upper(legal_name) = upper('${escapedName}') OR upper(dba_name) = upper('${escapedName}')`,
          $limit: 25
        },
        headers: {
          Accept: "application/json"
        },
        timeout: 30000
      });

      return Array.isArray(response.data) ? response.data : [];
    }
  );
}

async function fetchCensusCarrierByExactName(name) {
  const rows = await fetchCensusCarrierRowsByExactName(name);
  return mapCensusCarrier(selectBestCensusCarrierRow(rows));
}

async function fetchCensusCarrierRowsByPartialName(name) {
  if (!name) return [];

  const escapedName = escapeSocrataString(name);
  if (!escapedName) return [];

  return withFmcsaCache(
    { source: "fmcsa-census-name-like-rows-v1", identifier: escapedName },
    async () => {
      const response = await axios.get(FMCSA_CENSUS_URL, {
        params: {
          $where: `upper(legal_name) like upper('%${escapedName}%') OR upper(dba_name) like upper('%${escapedName}%')`,
          $limit: 25
        },
        headers: {
          Accept: "application/json"
        },
        timeout: 30000
      });

      return Array.isArray(response.data) ? response.data : [];
    }
  );
}

async function fetchCensusCarrierByPartialName(name) {
  const rows = await fetchCensusCarrierRowsByPartialName(name);
  return mapCensusCarrier(selectBestCensusCarrierRow(rows));
}

async function fetchCensusCarrierByMc(mc) {
  if (!mc) return null;

  const docket = valueOrEmpty(mc).replace(/^(MC|MX|FF)\s*-?/i, "");
  if (!docket) return null;
  const escapedDocket = escapeSocrataString(docket);

  return withFmcsaCache(
    { source: "fmcsa-census-mc-v2", identifier: escapedDocket },
    async () => {
      const response = await axios.get(FMCSA_CENSUS_URL, {
        params: {
          $where: `docket1 = '${escapedDocket}' OR docket2 = '${escapedDocket}' OR docket3 = '${escapedDocket}'`,
          $limit: 1
        },
        headers: {
          Accept: "application/json"
        },
        timeout: 30000
      });

      return mapCensusCarrier(response.data?.[0]);
    }
  );
}

function textAfter(text, label, maxLength = 220) {
  const index = text.indexOf(label);
  if (index === -1) return "";
  return text.slice(index + label.length, index + label.length + maxLength).replace(/\s+/g, " ").trim();
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function textMatch(text, pattern) {
  return text.match(pattern)?.[1]?.trim() || "";
}

function extractSaferCargoTypes(pageHtml) {
  const html = String(pageHtml || "");
  const start = html.search(/summary=["']Cargo Carried["']/i);
  if (start === -1) return [];

  const endCandidates = [
    html.indexOf('A name="Inspections"', start),
    html.indexOf("ID/Operations", start),
    html.indexOf("US Inspection results", start)
  ].filter(index => index > start);
  const end = endCandidates.length ? Math.min(...endCandidates) : Math.min(html.length, start + 12000);
  const section = html.slice(start, end);
  const cargoTypes = [];
  const rowPattern = /<tr\b[\s\S]*?<td\b[^>]*class=["']?queryfield["']?[^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*>\s*<font\b[^>]*>([\s\S]*?)<\/font>/gi;

  for (const match of section.matchAll(rowPattern)) {
    const marker = htmlToText(match[1]).toUpperCase();
    const label = htmlToText(match[2]);
    if (marker === "X" && label) cargoTypes.push(label);
  }

  return [...new Set(cargoTypes)];
}

function parseSmsSafetyPage(pageText) {
  const ratingSection = textAfter(pageText, "Safety Rating & OOS Rates", 500);
  const safetyRatingMatch = ratingSection.match(/\b(SATISFACTORY|CONDITIONAL|UNSATISFACTORY|NOT RATED|NONE)\b/i);
  const ratingDateMatch = ratingSection.match(/Rating Date:\s*([0-9/]+)/i);
  const vehicleOosMatch = ratingSection.match(/Vehicle\s+([0-9.]+)\s+([0-9.]+)/i);
  const driverOosMatch = ratingSection.match(/Driver\s+([0-9.]+)\s+([0-9.]+)/i);
  const hazmatOosMatch = ratingSection.match(/Hazmat\s+([0-9.]+)\s+([0-9.]+)/i);
  const inspectionsMatch = pageText.match(/Number of Inspections:\s*([0-9,]+)/i);

  if (!safetyRatingMatch && !vehicleOosMatch && !driverOosMatch && !inspectionsMatch) {
    return null;
  }

  return {
    safetyRating: safetyRatingMatch?.[1]?.toUpperCase() || "",
    safetyRatingDate: ratingDateMatch?.[1] || "",
    inspections: inspectionsMatch?.[1]?.replace(/,/g, "") || "",
    oosRates: {
      vehicle: vehicleOosMatch ? { carrier: vehicleOosMatch[1], nationalAverage: vehicleOosMatch[2] } : null,
      driver: driverOosMatch ? { carrier: driverOosMatch[1], nationalAverage: driverOosMatch[2] } : null,
      hazmat: hazmatOosMatch ? { carrier: hazmatOosMatch[1], nationalAverage: hazmatOosMatch[2] } : null
    },
    source: "FMCSA SMS public carrier profile"
  };
}

function parseSaferSnapshotPage(pageHtml) {
  const pageText = htmlToText(pageHtml);
  const cargoTypes = extractSaferCargoTypes(pageHtml);

  if (/Record Inactive/i.test(pageText) || /is INACTIVE in the SAFER database/i.test(pageText)) {
    return {
      authorityStatus: "Inactive",
      operatingStatus: "Inactive",
      cargo: cargoTypes.join(", "),
      cargoTypes,
      source: "FMCSA SAFER Company Snapshot"
    };
  }

  const authorityStatus = textMatch(
    pageText,
    /Operating Authority Status:\s*(.+?)(?:For Licensing|MC\/MX\/FF|COMPANY INFORMATION|Legal Name:)/i
  );
  const operatingStatus = textMatch(
    pageText,
    /Operating Status:\s*(.+?)(?:Out of Service Date:|Legal Name:|DBA Name:)/i
  );
  const totalInspections = textMatch(pageText, /Total Inspections:\s*([0-9,]+)/i);
  const crashMatch = pageText.match(/Total Crashes\s+([0-9,]+)\s+([0-9,]+)\s+([0-9,]+)\s+([0-9,]+)/i);
  const safetyMatch = pageText.match(/Rating Date:\s*([0-9/]+).*?Rating:\s*(Satisfactory|Conditional|Unsatisfactory|Not Rated|None)/i);
  const powerUnits = textMatch(pageText, /Power Units:\s*([0-9,]+)/i);
  const drivers = textMatch(pageText, /Drivers:\s*([0-9,]+)/i);

  if (!authorityStatus && !operatingStatus && !totalInspections && !crashMatch && !safetyMatch && !cargoTypes.length) {
    return null;
  }

  return {
    authorityStatus: authorityStatus || operatingStatus || "",
    operatingStatus,
    safetyRating: safetyMatch?.[2] || "",
    safetyRatingDate: safetyMatch?.[1] || "",
    totalInspections: totalInspections ? totalInspections.replace(/,/g, "") : "",
    crashTotal: crashMatch?.[4]?.replace(/,/g, "") || "",
    crashes: crashMatch
      ? {
        fatal: crashMatch[1].replace(/,/g, ""),
        injury: crashMatch[2].replace(/,/g, ""),
        tow: crashMatch[3].replace(/,/g, ""),
        total: crashMatch[4].replace(/,/g, "")
      }
      : null,
    vehicleCount: powerUnits ? Number(powerUnits.replace(/,/g, "")) : null,
    driverCount: drivers ? Number(drivers.replace(/,/g, "")) : null,
    cargo: cargoTypes.join(", "),
    cargoTypes,
    source: "FMCSA SAFER Company Snapshot"
  };
}

function collectObjects(node, predicate, output = []) {
  if (!node || typeof node !== "object") return output;
  if (!Array.isArray(node) && predicate(node)) output.push(node);
  if (Array.isArray(node)) {
    node.forEach(item => collectObjects(item, predicate, output));
  } else {
    Object.values(node).forEach(value => collectObjects(value, predicate, output));
  }
  return output;
}

function collectScalarValues(node, keyPatterns, output = []) {
  if (!node || typeof node !== "object") return output;
  for (const [key, value] of Object.entries(node)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (keyPatterns.some(pattern => normalizedKey.includes(pattern))) {
      if (Array.isArray(value)) {
        value.forEach(item => {
          if (item !== null && item !== undefined && typeof item !== "object") output.push(valueOrEmpty(item));
        });
      } else if (value !== null && value !== undefined && typeof value !== "object") {
        output.push(valueOrEmpty(value));
      }
    }
    if (value && typeof value === "object") collectScalarValues(value, keyPatterns, output);
  }
  return output.filter(Boolean);
}

function collectRawKeys(node, output = new Set()) {
  if (!node || typeof node !== "object") return output;
  Object.entries(node).forEach(([key, value]) => {
    output.add(key);
    if (value && typeof value === "object") collectRawKeys(value, output);
  });
  return output;
}

function rawKeysFound(raw, patterns = []) {
  const normalizedPatterns = patterns.map(pattern => String(pattern).toLowerCase().replace(/[^a-z0-9]/g, ""));
  return [...collectRawKeys(raw)]
    .filter((key) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      return normalizedPatterns.some(pattern => normalizedKey.includes(pattern));
    })
    .sort();
}

function categoryKey(value = "") {
  const text = valueOrEmpty(value).toLowerCase();
  if (/unsafe/.test(text)) return "unsafeDriving";
  if (/hours|service|hos/.test(text)) return "hoursOfService";
  if (/driver\s*fitness|fitness/.test(text)) return "driverFitness";
  if (/controlled|substance|alcohol/.test(text)) return "controlledSubstances";
  if (/vehicle|maintenance/.test(text)) return "vehicleMaintenance";
  if (/hazard|hazmat|hm/.test(text)) return "hazmat";
  if (/crash/.test(text)) return "crashIndicator";
  return text.replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase()).replace(/[^a-z0-9]/g, "");
}

function categoryLabel(value = "") {
  const key = categoryKey(value);
  const labels = {
    unsafeDriving: "Unsafe Driving",
    hoursOfService: "Hours-of-Service Compliance",
    driverFitness: "Driver Fitness",
    controlledSubstances: "Controlled Substances / Alcohol",
    vehicleMaintenance: "Vehicle Maintenance",
    hazmat: "Hazardous Materials Compliance",
    crashIndicator: "Crash Indicator"
  };
  return labels[key] || valueOrEmpty(value) || "BASIC";
}

function mapQcmobileBasics(raw) {
  const rows = collectObjects(raw, item => {
    const keys = Object.keys(item).map(key => key.toLowerCase());
    return keys.some(key => key.includes("basic")) ||
      keys.some(key => key.includes("percentile")) ||
      keys.some(key => key.includes("snap")) ||
      keys.some(key => key.includes("violation"));
  });

  const categories = rows
    .map((row) => {
      const label = findFirstValue(row, ["basicshortdesc", "basicdesc", "basicname", "category", "description"]);
      if (!label) return null;
      return {
        id: categoryKey(label),
        category: categoryLabel(label),
        shortName: categoryKey(label),
        label: categoryLabel(label),
        basicShortDesc: findFirstValue(row, ["basicshortdesc"]) || label,
        basicDesc: findFirstValue(row, ["basicdesc", "description"]),
        percentile: findFirstValue(row, ["percentile", "score", "value"]),
        measure: findFirstValue(row, ["measure"]),
        snapshotDate: findFirstValue(row, ["snapshotdate", "snapshot", "snapdate", "csmsdate"]),
        snapShotDate: findFirstValue(row, ["snapshotdate", "snapshot", "snapdate", "csmsdate"]),
        totalInspectionsWithViolations: findFirstValue(row, ["totalinspectionswithviolation", "totalinspectionwithviolation", "inspectioncount"]),
        totalViolations: findFirstValue(row, ["totalviolations", "totalviolation", "violationcount"]),
        inspections: findFirstValue(row, ["totalinspectionswithviolation", "totalinspectionwithviolation", "inspectioncount", "totalinspection"]),
        violations: findFirstValue(row, ["totalviolations", "totalviolation", "violationcount"]),
        deficientFlags: {
          rdDeficient: findFirstValue(row, ["rddeficient"]),
          rdsvDeficient: findFirstValue(row, ["rdsvdeficient"]),
          svDeficient: findFirstValue(row, ["svdeficient"])
        },
        rdDeficient: findFirstValue(row, ["rddeficient"]),
        rdsvDeficient: findFirstValue(row, ["rdsvdeficient"]),
        svDeficient: findFirstValue(row, ["svdeficient"]),
        publicStatus: "available"
      };
    })
    .filter(Boolean)
    .filter((row, index, allRows) => allRows.findIndex(other => other.id === row.id) === index);

  return {
    categories,
    snapShotDate: categories.find(row => row.snapShotDate)?.snapShotDate || findFirstValue(raw, ["snapshotdate", "snapshot", "snapdate", "csmsdate"]),
    rawKeysFound: rawKeysFound(raw, [
      "basicShortDesc",
      "basicDesc",
      "percentile",
      "measure",
      "value",
      "score",
      "snapShotDate",
      "snapshotDate",
      "totalInspectionWithViolation",
      "totalInspectionsWithViolation",
      "totalViolation",
      "totalViolations",
      "rdDeficient",
      "rdsvDeficient",
      "svDeficient"
    ]),
    source: categories.length ? "FMCSA QCMobile BASIC public endpoint" : ""
  };
}

function mapQcmobileOos(raw) {
  const totalInspections = findFirstValue(raw, ["totalinspections", "inspections", "totalinsp", "totalinspection", "inspectiontotal"]);
  const vehicleInspections = findFirstValue(raw, ["vehicleinspections", "vehicleinspectioncount", "vehicleinspection"]);
  const driverInspections = findFirstValue(raw, ["driverinspections", "driverinspectioncount", "driverinspection"]);
  const hazmatInspections = findFirstValue(raw, ["hazmatinspections", "hazmatinspection", "hminspection"]);
  const vehicleOos = findFirstValue(raw, ["vehicleooscount", "vehicleoos", "vehicleoutofservice"]);
  const driverOos = findFirstValue(raw, ["driverooscount", "driveroos", "driveroutofservice"]);
  const hazmatOos = findFirstValue(raw, ["hazmatooscount", "hazmatoos", "hmoutofservice"]);
  const vehicleOosRate = rateValue(findFirstValue(raw, ["vehicleoospercent", "vehicleoosrate"]));
  const driverOosRate = rateValue(findFirstValue(raw, ["driveroospercent", "driveroosrate"]));
  const hazmatOosRate = rateValue(findFirstValue(raw, ["hazmatoospercent", "hazmatoosrate", "hmoosrate"]));
  const nationalAverageVehicleOosRate = rateValue(findFirstValue(raw, ["nationalaveragevehicleoosrate", "nationalavgvehicleoos", "vehicleoosnationalaverage"]));
  const nationalAverageDriverOosRate = rateValue(findFirstValue(raw, ["nationalaveragedriveroosrate", "nationalavgdriveroos", "driveroosnationalaverage"]));
  const nationalAverageHazmatOosRate = rateValue(findFirstValue(raw, ["nationalaveragehazmatoosrate", "nationalavghazmatoos", "hazmatoosnationalaverage"]));

  return {
    totalInspections,
    vehicleInspections,
    driverInspections,
    hazmatInspections,
    vehicleOos,
    driverOos,
    hazmatOos,
    vehicleOosRate: vehicleOosRate === "" ? percentValue(vehicleOos, vehicleInspections) : vehicleOosRate,
    driverOosRate: driverOosRate === "" ? percentValue(driverOos, driverInspections) : driverOosRate,
    hazmatOosRate: hazmatOosRate === "" ? percentValue(hazmatOos, hazmatInspections) : hazmatOosRate,
    nationalAverageVehicleOosRate,
    nationalAverageDriverOosRate,
    nationalAverageHazmatOosRate,
    rawKeysFound: rawKeysFound(raw, [
      "totalInspections",
      "inspections",
      "totalInsp",
      "vehicleInspections",
      "vehicleInspectionCount",
      "driverInspections",
      "driverInspectionCount",
      "hazmatInspections",
      "vehicleOos",
      "vehicleOosCount",
      "vehicleOutOfService",
      "driverOos",
      "driverOosCount",
      "driverOutOfService",
      "hazmatOos",
      "vehicleOosRate",
      "vehicleOosPercent",
      "driverOosRate",
      "driverOosPercent",
      "hazmatOosRate",
      "nationalAverageVehicleOosRate",
      "nationalAvgVehicleOos",
      "nationalAverageDriverOosRate",
      "nationalAvgDriverOos"
    ]),
    source: "FMCSA QCMobile OOS public endpoint"
  };
}

function mapQcmobileAuthority(raw) {
  return {
    authorityStatus: findFirstValue(raw, ["authoritystatus", "operatingauthoritystatus", "status"]),
    operatingStatus: findFirstValue(raw, ["operatingstatus"]),
    outOfServiceStatus: findFirstValue(raw, ["outofservicestatus", "oosstatus"]),
    outOfServiceDate: findFirstValue(raw, ["outofservicedate", "oosdate"]),
    source: "FMCSA QCMobile authority public endpoint"
  };
}

function mapQcmobileCargo(raw) {
  const values = [
    ...collectScalarValues(raw, ["cargocarried", "cargotype", "cargo"]),
    ...collectObjects(raw, item => Boolean(findFirstValue(item, ["cargocarried", "cargotype", "cargo"])))
      .map(item => findFirstValue(item, ["cargocarried", "cargotype", "cargo"]))
  ];
  return {
    cargoTypes: [...new Set(values.flatMap(value => String(value).split(/[,;|]/).map(item => item.trim()).filter(Boolean)))],
    source: "FMCSA QCMobile cargo-carried public endpoint"
  };
}

function mapQcmobileOperation(raw) {
  const values = collectScalarValues(raw, ["operationclassification", "operationclass", "classification", "operation"]);
  return {
    operationClassification: [...new Set(values)].filter(Boolean),
    source: "FMCSA QCMobile operation-classification public endpoint"
  };
}

function mapQcmobileDockets(raw) {
  const values = collectScalarValues(raw, ["docketnumber", "docket", "mcmxffnumber", "mcnumber"]);
  return {
    docketNumbers: [...new Set(values)].filter(Boolean),
    source: "FMCSA QCMobile docket-numbers public endpoint"
  };
}

async function fetchQcMobileCarrierEndpoint(dot, endpoint, mapper) {
  if (!FMCSA_WEBKEY || !dot) return null;
  const source = `fmcsa-qcmobile-${endpoint}`;
  return withFmcsaCache(
    { source, identifier: dot, dotNumber: dot },
    async () => {
      devFmcsaDebug("calling QCMobile endpoint", { endpoint, dotNumber: dot });
      const response = await axios.get(`${FMCSA_BASE_URL}/carriers/${encodeURIComponent(dot)}/${endpoint}`, {
        params: { webKey: FMCSA_WEBKEY },
        headers: { Accept: "application/json" },
        timeout: 15000
      });
      const mapped = mapper(response.data);
      devFmcsaDebug("QCMobile endpoint returned", {
        endpoint,
        dotNumber: dot,
        hasData: Boolean(mapped && JSON.stringify(mapped) !== "{}")
      });
      return mapped;
    }
  );
}

async function fetchQcmobilePublicProfileDetails(dot) {
  if (!FMCSA_WEBKEY || !dot) return null;
  const endpoints = [
    ["basics", mapQcmobileBasics],
    ["oos", mapQcmobileOos],
    ["authority", mapQcmobileAuthority],
    ["cargo-carried", mapQcmobileCargo],
    ["operation-classification", mapQcmobileOperation],
    ["docket-numbers", mapQcmobileDockets]
  ];

  const settled = await Promise.allSettled(
    endpoints.map(([endpoint, mapper]) => fetchQcMobileCarrierEndpoint(dot, endpoint, mapper))
  );

  const details = {};
  const dataSources = {};
  settled.forEach((result, index) => {
    const [endpoint] = endpoints[index];
    if (result.status === "fulfilled" && result.value) {
      details[endpoint] = result.value;
      dataSources[endpoint === "cargo-carried" ? "cargoCarried" : endpoint === "operation-classification" ? "operationClassification" : endpoint === "docket-numbers" ? "docketNumbers" : endpoint] = {
        attempted: true,
        success: Boolean(result.value?.source || Object.keys(result.value || {}).length),
        recordCount: Array.isArray(result.value?.categories)
          ? result.value.categories.length
          : Array.isArray(result.value?.cargoTypes)
            ? result.value.cargoTypes.length
            : Array.isArray(result.value?.operationClassification)
              ? result.value.operationClassification.length
              : Array.isArray(result.value?.docketNumbers)
                ? result.value.docketNumbers.length
                : undefined,
        rawKeysFound: result.value?.rawKeysFound || undefined
      };
    } else if (result.status === "rejected") {
      logProviderFailure(`FMCSA QCMobile ${endpoint} lookup`, result.reason);
      dataSources[endpoint === "cargo-carried" ? "cargoCarried" : endpoint === "operation-classification" ? "operationClassification" : endpoint === "docket-numbers" ? "docketNumbers" : endpoint] = {
        attempted: true,
        success: false,
        error: result.reason?.response?.status ? `HTTP ${result.reason.response.status}` : "request failed"
      };
    } else {
      dataSources[endpoint === "cargo-carried" ? "cargoCarried" : endpoint === "operation-classification" ? "operationClassification" : endpoint === "docket-numbers" ? "docketNumbers" : endpoint] = {
        attempted: true,
        success: false,
        recordCount: 0
      };
    }
  });

  devFmcsaDebug("normalized QCMobile profile details", {
    dotNumber: dot,
    endpoints: Object.keys(details),
    missingEndpoints: endpoints.map(([endpoint]) => endpoint).filter(endpoint => !details[endpoint])
  });

  return Object.keys(details).length || Object.keys(dataSources).length ? {
    basics: details.basics || null,
    oos: details.oos || null,
    authority: details.authority || null,
    cargo: details["cargo-carried"] || null,
    operationClassification: details["operation-classification"] || null,
    docketNumbers: details["docket-numbers"] || null,
    dataSources,
    source: "FMCSA QCMobile public profile endpoints"
  } : null;
}

async function fetchSaferSnapshotByDot(dot) {
  if (!dot) return null;

  return withFmcsaCache(
    { source: "fmcsa-safer-snapshot-v2", identifier: dot, dotNumber: dot },
    async () => {
      const response = await axios.get(FMCSA_SAFER_URL, {
        params: {
          searchtype: "ANY",
          query_type: "queryCarrierSnapshot",
          query_param: "USDOT",
          query_string: dot
        },
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": FMCSA_SMS_HEADERS["User-Agent"]
        },
        timeout: 20000
      });

      return parseSaferSnapshotPage(response.data);
    }
  );
}

async function fetchSmsSearchStatusByDot(dot) {
  return withFmcsaCache(
    { source: "fmcsa-sms-search-status", identifier: dot, dotNumber: dot },
    async () => {
      const response = await axios.post(
        `${FMCSA_SMS_BASE_URL}/Search/Index.aspx`,
        new URLSearchParams({ MCSearch: dot, search: "Search" }).toString(),
        {
          headers: {
            ...FMCSA_SMS_HEADERS,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          timeout: 20000
        }
      );

      const pageText = htmlToText(response.data);
      const inactiveMatch = pageText.match(/U\.S\. DOT#\s*\d+\s+is\s+inactive[^.]*\./i);
      if (!inactiveMatch) return null;

      return {
        safetyRating: "INACTIVE",
        safetyRatingDate: "",
        inspections: "",
        oosRates: {
          vehicle: null,
          driver: null,
          hazmat: null
        },
        status: "inactive",
        statusMessage: inactiveMatch[0],
        source: "FMCSA SMS simple search"
      };
    }
  );
}

async function fetchSmsSafetyByDot(dot) {
  if (!dot) return null;

  const smsSafety = await withFmcsaCache(
    { source: "fmcsa-sms-complete-profile", identifier: dot, dotNumber: dot },
    async () => {
      const response = await axios.get(`${FMCSA_SMS_BASE_URL}/Carrier/${encodeURIComponent(dot)}/CompleteProfile.aspx`, {
        headers: FMCSA_SMS_HEADERS,
        timeout: 20000
      });

      return parseSmsSafetyPage(htmlToText(response.data));
    }
  );

  return smsSafety || fetchSmsSearchStatusByDot(dot);
}

function mergeSmsSafetyData(smsSafety, qcmobileDetails) {
  const basics = qcmobileDetails?.basics?.categories || [];
  const oos = qcmobileDetails?.oos || {};
  if (!smsSafety && !basics.length && !Object.keys(oos).length) return smsSafety;

  const basicsById = basics.reduce((acc, item) => {
    if (item.id) acc[item.id] = item.percentile || item.measure || "";
    return acc;
  }, {});

  return {
    ...(smsSafety || {}),
    basics: {
      ...((smsSafety && smsSafety.basics) || {}),
      ...basicsById
    },
    basicCategories: basics,
    smsSnapshotDate: qcmobileDetails?.basics?.snapShotDate || smsSafety?.smsSnapshotDate || "",
    inspections: oos.totalInspections || smsSafety?.inspections || "",
    vehicleInspections: oos.vehicleInspections || "",
    driverInspections: oos.driverInspections || "",
    hazmatInspections: oos.hazmatInspections || "",
    vehicleOos: oos.vehicleOos || "",
    driverOos: oos.driverOos || "",
    hazmatOos: oos.hazmatOos || "",
    oosRates: {
      ...((smsSafety && smsSafety.oosRates) || {}),
      vehicle: oos.vehicleOosRate || smsSafety?.oosRates?.vehicle || null,
      driver: oos.driverOosRate || smsSafety?.oosRates?.driver || null,
      hazmat: oos.hazmatOosRate || smsSafety?.oosRates?.hazmat || null
    },
    source: qcmobileDetails?.source || smsSafety?.source || "FMCSA public safety data"
  };
}

function mergeCarrierData(apiCarrier, censusCarrier, smsSafety, saferData, qcmobileDetails = null) {
  const mergedSmsSafety = mergeSmsSafetyData(smsSafety, qcmobileDetails);
  const authority = qcmobileDetails?.authority || {};
  const cargo = qcmobileDetails?.cargo || {};
  const operation = qcmobileDetails?.operationClassification || {};
  const docketNumbers = qcmobileDetails?.docketNumbers?.docketNumbers || [];
  if (!apiCarrier && !censusCarrier && !mergedSmsSafety && !saferData && !qcmobileDetails) return null;
  if (!apiCarrier && !censusCarrier) {
    return {
      ...saferData,
      safetyRating: mergedSmsSafety?.safetyRating || saferData?.safetyRating || "Unknown",
      safetyRatingDate: mergedSmsSafety?.safetyRatingDate || saferData?.safetyRatingDate || "",
      authorityStatus: authority.authorityStatus || saferData?.authorityStatus || "",
      operatingStatus: authority.operatingStatus || saferData?.operatingStatus || "",
      outOfServiceStatus: authority.outOfServiceStatus || "",
      outOfServiceDate: authority.outOfServiceDate || "",
      cargoTypes: cargo.cargoTypes || saferData?.cargoTypes || [],
      operationClassification: operation.operationClassification || [],
      docketNumbers,
      smsSafety: mergedSmsSafety,
      saferData,
      qcmobileDetails
    };
  }
  if (!apiCarrier) {
    return {
      ...censusCarrier,
      safetyRating: mergedSmsSafety?.safetyRating || saferData?.safetyRating || censusCarrier.safetyRating,
      safetyRatingDate: mergedSmsSafety?.safetyRatingDate || saferData?.safetyRatingDate || censusCarrier.safetyRatingDate,
      authorityStatus: authority.authorityStatus || saferData?.authorityStatus || censusCarrier.authorityStatus,
      operatingStatus: authority.operatingStatus || saferData?.operatingStatus || "",
      outOfServiceStatus: authority.outOfServiceStatus || "",
      outOfServiceDate: authority.outOfServiceDate || "",
      totalInspections: saferData?.totalInspections || mergedSmsSafety?.inspections || "",
      crashTotal: saferData?.crashTotal || "",
      crashes: saferData?.crashes || null,
      vehicleCount: saferData?.vehicleCount ?? censusCarrier.vehicleCount ?? null,
      driverCount: saferData?.driverCount ?? censusCarrier.driverCount ?? null,
      cargo: (cargo.cargoTypes || saferData?.cargoTypes || censusCarrier.cargoTypes || []).join(", ") || saferData?.cargo || censusCarrier.cargo || "",
      cargoTypes: cargo.cargoTypes || saferData?.cargoTypes || censusCarrier.cargoTypes || [],
      operationClassification: operation.operationClassification || [],
      docketNumbers,
      smsSafety: mergedSmsSafety,
      saferData,
      qcmobileDetails
    };
  }
  if (!censusCarrier) {
    return {
      ...apiCarrier,
      safetyRating: mergedSmsSafety?.safetyRating || saferData?.safetyRating || apiCarrier.safetyRating,
      safetyRatingDate: mergedSmsSafety?.safetyRatingDate || saferData?.safetyRatingDate || apiCarrier.safetyRatingDate,
      authorityStatus: authority.authorityStatus || saferData?.authorityStatus || apiCarrier.authorityStatus || "",
      operatingStatus: authority.operatingStatus || saferData?.operatingStatus || "",
      outOfServiceStatus: authority.outOfServiceStatus || "",
      outOfServiceDate: authority.outOfServiceDate || "",
      totalInspections: saferData?.totalInspections || mergedSmsSafety?.inspections || "",
      crashTotal: saferData?.crashTotal || "",
      crashes: saferData?.crashes || null,
      vehicleCount: saferData?.vehicleCount ?? apiCarrier.vehicleCount ?? null,
      driverCount: saferData?.driverCount ?? apiCarrier.driverCount ?? null,
      cargo: (cargo.cargoTypes || saferData?.cargoTypes || apiCarrier.cargoTypes || []).join(", ") || saferData?.cargo || apiCarrier.cargo || "",
      cargoTypes: cargo.cargoTypes || saferData?.cargoTypes || apiCarrier.cargoTypes || [],
      operationClassification: operation.operationClassification || [],
      docketNumbers,
      smsSafety: mergedSmsSafety,
      saferData,
      qcmobileDetails
    };
  }

  return {
    ...apiCarrier,
    carrierName: censusCarrier.carrierName || apiCarrier.carrierName,
    dot: censusCarrier.dot || apiCarrier.dot,
    mc: censusCarrier.mc || apiCarrier.mc,
    safetyRating: mergedSmsSafety?.safetyRating || saferData?.safetyRating || censusCarrier.safetyRating || apiCarrier.safetyRating,
    safetyRatingDate: mergedSmsSafety?.safetyRatingDate || saferData?.safetyRatingDate || censusCarrier.safetyRatingDate || apiCarrier.safetyRatingDate,
    authorityStatus: authority.authorityStatus || saferData?.authorityStatus || censusCarrier.authorityStatus || apiCarrier.authorityStatus || "",
    operatingStatus: authority.operatingStatus || saferData?.operatingStatus || "",
    outOfServiceStatus: authority.outOfServiceStatus || "",
    outOfServiceDate: authority.outOfServiceDate || "",
    operatingAuthority: censusCarrier.operatingAuthority || "",
    email: censusCarrier.email || apiCarrier.email,
    phone: censusCarrier.phone || apiCarrier.phone,
    fax: censusCarrier.fax || apiCarrier.fax,
    address: censusCarrier.address || apiCarrier.address,
    mailingAddress: censusCarrier.mailingAddress || apiCarrier.mailingAddress,
    vehicleCount: saferData?.vehicleCount ?? censusCarrier.vehicleCount ?? apiCarrier.vehicleCount ?? null,
    driverCount: saferData?.driverCount ?? censusCarrier.driverCount ?? apiCarrier.driverCount ?? null,
    cargo: (cargo.cargoTypes || saferData?.cargoTypes || censusCarrier.cargoTypes || apiCarrier.cargoTypes || []).join(", ") || saferData?.cargo || censusCarrier.cargo || apiCarrier.cargo || "",
    cargoTypes: cargo.cargoTypes || saferData?.cargoTypes || censusCarrier.cargoTypes || apiCarrier.cargoTypes || [],
    operationClassification: operation.operationClassification || [],
    docketNumbers,
    mcs150Date: censusCarrier.mcs150Date || apiCarrier.mcs150Date,
    totalInspections: saferData?.totalInspections || mergedSmsSafety?.inspections || "",
    crashTotal: saferData?.crashTotal || "",
    crashes: saferData?.crashes || null,
    hazmatAuthorized: censusCarrier.hazmatAuthorized ?? apiCarrier.hazmatAuthorized ?? false,
    smsSafety: mergedSmsSafety,
    saferData,
    qcmobileDetails,
    source: mergedSmsSafety
      ? "FMCSA SMS public carrier overview"
      : saferData
        ? "FMCSA SAFER Company Snapshot"
      : censusCarrier.email
        ? "FMCSA Company Census File / MCS-150 self-reported"
        : apiCarrier.source
  };
}

function dedupeCensusRows(rows = []) {
  const seen = new Set();
  return rows.filter((row) => {
    const dot = valueOrEmpty(row?.dot_number);
    if (!dot || seen.has(dot)) return false;
    seen.add(dot);
    return true;
  });
}

function mapNameSearchCandidate(row = {}, matchMeta = {}) {
  const carrier = mapCensusCarrier(row);
  if (!carrier) return null;

  return {
    ...carrier,
    legalName: valueOrEmpty(row.legal_name || carrier.carrierName || row.dba_name || "Unknown"),
    dbaName: valueOrEmpty(row.dba_name),
    authorityStatus: mapStatusCode(row.status_code),
    operatingStatus: mapStatusCode(row.status_code),
    carrierOperation: valueOrEmpty(row.carrier_operation),
    address: {
      street: valueOrEmpty(row.phy_street),
      city: valueOrEmpty(row.phy_city),
      state: valueOrEmpty(row.phy_state),
      zip: valueOrEmpty(row.phy_zip),
      raw: carrier.address
    },
    raw: {
      census: row
    },
    sourceType: "live",
    lastUpdated: valueOrEmpty(row.mcs150_date || row.add_date),
    matchMeta
  };
}

async function fetchQcMobileCarrier({ dot, mc }) {
  if (!FMCSA_WEBKEY) return null;

  const url = dot
    ? `${FMCSA_BASE_URL}/carriers/${encodeURIComponent(dot)}`
    : `${FMCSA_BASE_URL}/carriers/docket-number/${encodeURIComponent(mc)}`;

  return withFmcsaCache(
    { source: "fmcsa-qcmobile", identifier: dot || mc, dotNumber: dot || null },
    async () => {
      const response = await axios.get(url, {
        params: { webKey: FMCSA_WEBKEY },
        headers: {
          Accept: "application/json"
        },
        timeout: 15000
      });

      const snapshot = getCarrierPayload(response.data);
      const carrierNode = snapshot?.Carrier || snapshot?.CARRIER || snapshot;
      const contactNode = snapshot?.Contact || snapshot?.CONTACT || snapshot;
      const safetyNode = snapshot?.Safety || snapshot?.SAFETY || snapshot;
      const insuranceNode = snapshot?.Insurance || snapshot?.INSURANCE || snapshot;
      const physicalAddress = carrierNode?.PhysicalAddress || carrierNode?.PHYSICAL_ADDRESS || snapshot;

      return {
        carrierName:
          carrierNode?.LegalName ||
          carrierNode?.LEGAL_NAME ||
          carrierNode?.legalName ||
          carrierNode?.name ||
          findFirstValue(snapshot, ["legalname", "dbaname", "name"]) ||
          "Unknown",
        dot:
          carrierNode?.USDOTNumber ||
          carrierNode?.USDOT_NUMBER ||
          carrierNode?.dotNumber ||
          findFirstValue(snapshot, ["usdotnumber", "dotnumber"]) ||
          dot ||
          "",
        mc:
          carrierNode?.MC_MX_FF_Number ||
          carrierNode?.MCNumber ||
          findFirstValue(snapshot, ["mcmxffnumber", "mcnumber", "docketnumber"]) ||
          mc ||
          "",
        safetyRating:
          safetyNode?.Rating ||
          safetyNode?.RATING ||
          findFirstValue(snapshot, ["safetyrating", "rating"]) ||
          "Unknown",
        insuranceExpiration:
          insuranceNode?.PolicyExpirationDate ||
          findFirstValue(snapshot, ["policyexpirationdate", "insuranceexpiration"]) ||
          "",
        cargo: snapshot?.Cargo?.CargoTypes || findFirstValue(snapshot, ["cargotypes"]) || "",
        email: findEmailInPayload(contactNode || snapshot),
        phone:
          contactNode?.Phone ||
          contactNode?.PHONE ||
          contactNode?.phone ||
          findFirstValue(snapshot, ["telephone", "phone", "cellphone"]) ||
          "",
        address: buildAddress(
          physicalAddress?.Street || physicalAddress?.STREET || physicalAddress?.phyStreet || findFirstValue(physicalAddress, ["street"]),
          physicalAddress?.City || physicalAddress?.CITY || physicalAddress?.phyCity || findFirstValue(physicalAddress, ["city"]),
          physicalAddress?.State || physicalAddress?.STATE || physicalAddress?.phyState || findFirstValue(physicalAddress, ["state"]),
          physicalAddress?.Zip || physicalAddress?.ZIP || physicalAddress?.phyZipcode || findFirstValue(physicalAddress, ["zip"])
        ),
        source: "FMCSA QCMobile API"
      };
    }
  );
}

export function isFmcsaWebKeyConfigured() {
  return Boolean(FMCSA_WEBKEY);
}

export async function fetchQcmobileCarrierByDotOrMc({ dot, mc }) {
  if (!dot && !mc) {
    throw new Error("DOT or MC required");
  }

  return fetchQcMobileCarrier({ dot, mc });
}

function logProviderFailure(label, err) {
  console.warn(`${label} failed: ${err.response?.status || err.message}`);
}

const FMCSA_PROVIDER_DEFINITIONS = {
  qcmobile: {
    key: "qcmobile",
    label: "FMCSA QCMobile API",
    enabled: ({ dot, mc }) => Boolean(FMCSA_WEBKEY && (dot || mc)),
    resolve: ({ dot, mc }) => fetchQcMobileCarrier({ dot, mc })
  },
  censusDot: {
    key: "censusDot",
    label: "FMCSA Company Census File / MCS-150 self-reported",
    enabled: ({ dot }) => Boolean(dot),
    resolve: ({ dot }) => fetchCensusCarrierByDot(dot)
  },
  censusMc: {
    key: "censusMc",
    label: "FMCSA Company Census File / MCS-150 self-reported",
    enabled: ({ mc }) => Boolean(mc),
    resolve: ({ mc }) => fetchCensusCarrierByMc(mc)
  },
  censusNameExact: {
    key: "censusNameExact",
    label: "FMCSA Company Census File / MCS-150 self-reported",
    enabled: ({ name }) => Boolean(name),
    resolve: ({ name }) => fetchCensusCarrierByExactName(name)
  },
  censusNameLike: {
    key: "censusNameLike",
    label: "FMCSA Company Census File / MCS-150 self-reported",
    enabled: ({ name }) => Boolean(name),
    resolve: ({ name }) => fetchCensusCarrierByPartialName(name)
  },
  censusName: {
    key: "censusName",
    label: "FMCSA Company Census File / MCS-150 self-reported",
    enabled: ({ name }) => Boolean(name),
    resolve: ({ name }) => fetchCensusCarrierByName(name)
  },
  sms: {
    key: "sms",
    label: "FMCSA SMS public carrier profile",
    enabled: ({ dot }) => Boolean(dot),
    resolve: ({ dot }) => fetchSmsSafetyByDot(dot)
  },
  safer: {
    key: "safer",
    label: "FMCSA SAFER Company Snapshot",
    enabled: ({ dot }) => Boolean(dot),
    resolve: ({ dot }) => fetchSaferSnapshotByDot(dot)
  },
  motus: {
    key: "motus",
    label: "Motus Registration Portal",
    enabled: () => true,
    resolve: async () => null
  }
};

export function getFmcsaProviderDefinitions() {
  return FMCSA_PROVIDER_DEFINITIONS;
}

async function runFmcsaProvider(providerKey, criteria = {}) {
  const provider = FMCSA_PROVIDER_DEFINITIONS[providerKey];
  if (!provider || !provider.enabled(criteria)) return null;
  return provider.resolve(criteria);
}

export async function getCarrierData({ dot, mc, name } = {}) {
  if (!dot && !mc && !name) throw new Error("DOT, MC, or carrier name required");

  const apiResult = dot || mc
    ? await runFmcsaProvider("qcmobile", { dot, mc }).catch(err => {
      logProviderFailure("FMCSA QCMobile lookup", err);
      return null;
    })
    : null;

  const censusMcResult = !dot && mc
    ? await runFmcsaProvider("censusMc", { mc }).catch(err => {
      logProviderFailure("FMCSA Company Census MC lookup", err);
      return null;
    })
    : null;

  let nameResult = null;
  if (!dot && !mc && name) {
    nameResult = await runFmcsaProvider("censusNameExact", { name }).catch(err => {
      logProviderFailure("FMCSA Company Census exact-name lookup", err);
      return null;
    });

    if (!nameResult) {
      nameResult = await runFmcsaProvider("censusNameLike", { name }).catch(err => {
        logProviderFailure("FMCSA Company Census partial-name lookup", err);
        return null;
      });
    }

    if (!nameResult) {
      nameResult = await runFmcsaProvider("censusName", { name }).catch(err => {
        logProviderFailure("FMCSA Company Census fuzzy-name lookup", err);
        return null;
      });
    }
  }

  const resolvedDot = dot || apiResult?.dot || censusMcResult?.dot || nameResult?.dot;
  const censusResult = resolvedDot
    ? await runFmcsaProvider("censusDot", { dot: resolvedDot }).catch(err => {
      logProviderFailure("FMCSA Company Census lookup", err);
      return censusMcResult || nameResult;
    }) || censusMcResult || nameResult
    : (censusMcResult || nameResult);

  const smsSafety = resolvedDot
    ? await runFmcsaProvider("sms", { dot: resolvedDot }).catch(err => {
      logProviderFailure("FMCSA SMS safety lookup", err);
      return null;
    })
    : null;

  const saferData = resolvedDot
    ? await runFmcsaProvider("safer", { dot: resolvedDot }).catch(err => {
      logProviderFailure("FMCSA SAFER snapshot lookup", err);
      return null;
    })
    : null;

  const qcmobileDetails = resolvedDot
    ? await fetchQcmobilePublicProfileDetails(resolvedDot).catch(err => {
      logProviderFailure("FMCSA QCMobile profile detail lookup", err);
      return null;
    })
    : null;

  const carrier = mergeCarrierData(apiResult, censusResult, smsSafety, saferData, qcmobileDetails);
  if (!carrier) throw new Error("Carrier not found in FMCSA data sources");

  const providerResults = {
    qcmobile: apiResult,
    qcmobileDetails,
    census: censusResult,
    censusMc: censusMcResult,
    censusName: nameResult,
    sms: smsSafety,
    safer: saferData,
    motus: {
      portalUrl: MOTUS_PORTAL_URL,
      notice: FMCSA_TRANSITION_NOTICE,
      status: "portal-only"
    }
  };

  carrier.dataSourceStatus = {
    carrierSnapshot: {
      attempted: Boolean(dot || mc),
      success: Boolean(apiResult || censusResult || saferData),
      recordCount: apiResult || censusResult || saferData ? 1 : 0
    },
    ...(qcmobileDetails?.dataSources || {}),
    insurance: {
      attempted: false,
      success: false,
      recordCount: 0
    }
  };

  return {
    carrier,
    providerResults,
    providersUsed: Object.entries(providerResults)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key),
    registrationPlatform: {
      active: "Motus",
      motusUrl: MOTUS_PORTAL_URL,
      notice: FMCSA_TRANSITION_NOTICE,
      legacySystems: ["SAFER", "SMS", "QCMobile"]
    }
  };
}

export async function searchCarrierCandidatesByName({
  name,
  state = "",
  city = "",
  mc = "",
  limit = 5
} = {}) {
  if (!name) throw new Error("carrier name required");

  const exactRows = await fetchCensusCarrierRowsByExactName(name).catch(err => {
    logProviderFailure("FMCSA Company Census exact-name lookup", err);
    return [];
  });

  let candidateRows = exactRows;
  if (candidateRows.length < Math.max(Number(limit) || 5, 5)) {
    const partialRows = await fetchCensusCarrierRowsByPartialName(name).catch(err => {
      logProviderFailure("FMCSA Company Census partial-name lookup", err);
      return [];
    });
    candidateRows = dedupeCensusRows([...candidateRows, ...partialRows]);
  }

  if (candidateRows.length === 0) {
    const fallback = await runFmcsaProvider("censusName", { name }).catch(err => {
      logProviderFailure("FMCSA Company Census fuzzy-name lookup", err);
      return null;
    });
    if (!fallback) return [];
    return [fallback];
  }

  return candidateRows
    .map((row) => {
      const matchMeta = scoreCensusNameCandidate(row, { name, state, city, mc });
      const carrier = mapNameSearchCandidate(row, matchMeta);
      return carrier ? { carrier, score: matchMeta.score } : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(Number(limit) || 5, 5))
    .map((entry) => entry.carrier);
}

export async function fetchCarrierByDotOrMc({ dot, mc, name }) {
  const result = await getCarrierData({ dot, mc, name });
  return result.carrier;
}
