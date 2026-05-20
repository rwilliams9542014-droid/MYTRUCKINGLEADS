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

async function fetchCensusCarrierByExactName(name) {
  if (!name) return null;

  const escapedName = escapeSocrataString(name);
  if (!escapedName) return null;

  return withFmcsaCache(
    { source: "fmcsa-census-name-exact-v2", identifier: escapedName },
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

      return mapCensusCarrier(selectBestCensusCarrierRow(response.data));
    }
  );
}

async function fetchCensusCarrierByPartialName(name) {
  if (!name) return null;

  const escapedName = escapeSocrataString(name);
  if (!escapedName) return null;

  return withFmcsaCache(
    { source: "fmcsa-census-name-like-v2", identifier: escapedName },
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

      return mapCensusCarrier(selectBestCensusCarrierRow(response.data));
    }
  );
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

function mergeCarrierData(apiCarrier, censusCarrier, smsSafety, saferData) {
  if (!apiCarrier && !censusCarrier && !smsSafety && !saferData) return null;
  if (!apiCarrier && !censusCarrier) {
    return {
      ...saferData,
      safetyRating: smsSafety?.safetyRating || saferData?.safetyRating || "Unknown",
      safetyRatingDate: smsSafety?.safetyRatingDate || saferData?.safetyRatingDate || "",
      smsSafety,
      saferData
    };
  }
  if (!apiCarrier) {
    return {
      ...censusCarrier,
      safetyRating: smsSafety?.safetyRating || saferData?.safetyRating || censusCarrier.safetyRating,
      safetyRatingDate: smsSafety?.safetyRatingDate || saferData?.safetyRatingDate || censusCarrier.safetyRatingDate,
      authorityStatus: saferData?.authorityStatus || censusCarrier.authorityStatus,
      operatingStatus: saferData?.operatingStatus || "",
      totalInspections: saferData?.totalInspections || smsSafety?.inspections || "",
      crashTotal: saferData?.crashTotal || "",
      crashes: saferData?.crashes || null,
      vehicleCount: saferData?.vehicleCount ?? censusCarrier.vehicleCount ?? null,
      driverCount: saferData?.driverCount ?? censusCarrier.driverCount ?? null,
      cargo: saferData?.cargo || censusCarrier.cargo || "",
      cargoTypes: saferData?.cargoTypes || censusCarrier.cargoTypes || [],
      smsSafety,
      saferData
    };
  }
  if (!censusCarrier) {
    return {
      ...apiCarrier,
      safetyRating: smsSafety?.safetyRating || saferData?.safetyRating || apiCarrier.safetyRating,
      safetyRatingDate: smsSafety?.safetyRatingDate || saferData?.safetyRatingDate || apiCarrier.safetyRatingDate,
      authorityStatus: saferData?.authorityStatus || apiCarrier.authorityStatus || "",
      operatingStatus: saferData?.operatingStatus || "",
      totalInspections: saferData?.totalInspections || smsSafety?.inspections || "",
      crashTotal: saferData?.crashTotal || "",
      crashes: saferData?.crashes || null,
      vehicleCount: saferData?.vehicleCount ?? apiCarrier.vehicleCount ?? null,
      driverCount: saferData?.driverCount ?? apiCarrier.driverCount ?? null,
      cargo: saferData?.cargo || apiCarrier.cargo || "",
      cargoTypes: saferData?.cargoTypes || apiCarrier.cargoTypes || [],
      smsSafety,
      saferData
    };
  }

  return {
    ...apiCarrier,
    carrierName: censusCarrier.carrierName || apiCarrier.carrierName,
    dot: censusCarrier.dot || apiCarrier.dot,
    mc: censusCarrier.mc || apiCarrier.mc,
    safetyRating: smsSafety?.safetyRating || saferData?.safetyRating || censusCarrier.safetyRating || apiCarrier.safetyRating,
    safetyRatingDate: smsSafety?.safetyRatingDate || saferData?.safetyRatingDate || censusCarrier.safetyRatingDate || apiCarrier.safetyRatingDate,
    authorityStatus: saferData?.authorityStatus || censusCarrier.authorityStatus || apiCarrier.authorityStatus || "",
    operatingStatus: saferData?.operatingStatus || "",
    operatingAuthority: censusCarrier.operatingAuthority || "",
    email: censusCarrier.email || apiCarrier.email,
    phone: censusCarrier.phone || apiCarrier.phone,
    fax: censusCarrier.fax || apiCarrier.fax,
    address: censusCarrier.address || apiCarrier.address,
    mailingAddress: censusCarrier.mailingAddress || apiCarrier.mailingAddress,
    vehicleCount: saferData?.vehicleCount ?? censusCarrier.vehicleCount ?? apiCarrier.vehicleCount ?? null,
    driverCount: saferData?.driverCount ?? censusCarrier.driverCount ?? apiCarrier.driverCount ?? null,
    cargo: saferData?.cargo || censusCarrier.cargo || apiCarrier.cargo || "",
    cargoTypes: saferData?.cargoTypes || censusCarrier.cargoTypes || apiCarrier.cargoTypes || [],
    mcs150Date: censusCarrier.mcs150Date || apiCarrier.mcs150Date,
    totalInspections: saferData?.totalInspections || smsSafety?.inspections || "",
    crashTotal: saferData?.crashTotal || "",
    crashes: saferData?.crashes || null,
    hazmatAuthorized: censusCarrier.hazmatAuthorized ?? apiCarrier.hazmatAuthorized ?? false,
    smsSafety,
    saferData,
    source: smsSafety
      ? "FMCSA SMS public carrier overview"
      : saferData
        ? "FMCSA SAFER Company Snapshot"
      : censusCarrier.email
        ? "FMCSA Company Census File / MCS-150 self-reported"
        : apiCarrier.source
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

  const carrier = mergeCarrierData(apiResult, censusResult, smsSafety, saferData);
  if (!carrier) throw new Error("Carrier not found in FMCSA data sources");

  const providerResults = {
    qcmobile: apiResult,
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

export async function fetchCarrierByDotOrMc({ dot, mc, name }) {
  const result = await getCarrierData({ dot, mc, name });
  return result.carrier;
}
