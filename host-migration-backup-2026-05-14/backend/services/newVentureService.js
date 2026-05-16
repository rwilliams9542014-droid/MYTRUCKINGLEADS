import axios from "axios";
import { verifyEmailAddress } from "./emailVerificationService.js";

const FMCSA_CENSUS_URL = "https://data.transportation.gov/resource/az4n-8mr2.json";

function parseInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function formatCensusDate(value) {
  if (!value) return "";
  const compact = String(value).trim();
  if (/^\d{8}/.test(compact)) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }
  return dateOrNull(compact) || compact;
}

function compactDateNumber(value) {
  const normalized = dateOrNull(value);
  if (!normalized) return null;
  return Number(normalized.replace(/-/g, ""));
}

function mapNewVenture(row) {
  const email = row.email_address || "";
  const powerUnits = parseInteger(row.power_units);
  const truckUnits = parseInteger(row.truck_units);
  const busUnits = parseInteger(row.bus_units);
  const reportedFleetSize = parseInteger(row.fleetsize);

  return {
    dotNumber: row.dot_number || "",
    carrierName: row.legal_name || "",
    phone: row.phone || row.cell_phone || "",
    email,
    addDate: formatCensusDate(row.add_date),
    mcs150Date: formatCensusDate(row.mcs150_date),
    state: row.phy_state || "",
    city: row.phy_city || "",
    physicalAddress: [row.phy_street, row.phy_city, row.phy_state, row.phy_zip].filter(Boolean).join(", "),
    mailingAddress: [
      row.carrier_mailing_street,
      row.carrier_mailing_city,
      row.carrier_mailing_state,
      row.carrier_mailing_zip
    ].filter(Boolean).join(", "),
    carrierOperation: row.carrier_operation || "",
    businessType: row.business_org_desc || "",
    fleetSize: reportedFleetSize ?? powerUnits ?? truckUnits ?? busUnits,
    powerUnits,
    truckUnits,
    busUnits,
    drivers: parseInteger(row.total_drivers),
    cdlDrivers: parseInteger(row.total_cdl),
    hazmat: row.hm_ind === "Y",
    interstateBeyond100Miles: row.interstate_beyond_100_miles === "Y",
    interstateWithin100Miles: row.interstate_within_100_miles === "Y",
    intrastateBeyond100Miles: row.intrastate_beyond_100_miles === "Y",
    intrastateWithin100Miles: row.intrastate_within_100_miles === "Y",
    emailSource: email ? "FMCSA Company Census File / MCS-150 self-reported" : "",
    emailVerified: false,
    verificationProvider: ""
  };
}

function buildSocrataParams(filters = {}) {
  const where = [];
  const params = {
    $select: [
      "dot_number",
      "legal_name",
      "add_date",
      "mcs150_date",
      "phy_street",
      "phy_city",
      "phy_state",
      "phy_zip",
      "carrier_mailing_street",
      "carrier_mailing_city",
      "carrier_mailing_state",
      "carrier_mailing_zip",
      "carrier_operation",
      "business_org_desc",
      "phone",
      "cell_phone",
      "email_address",
      "fleetsize",
      "power_units",
      "truck_units",
      "bus_units",
      "total_drivers",
      "total_cdl",
      "hm_ind",
      "interstate_beyond_100_miles",
      "interstate_within_100_miles",
      "intrastate_beyond_100_miles",
      "intrastate_within_100_miles"
    ].join(","),
    $order: "add_date DESC",
    $limit: Math.min(Math.max(parseInteger(filters.limit) || 100, 1), 500)
  };

  const from = dateOrNull(filters.from);
  const to = dateOrNull(filters.to);
  const state = filters.state ? String(filters.state).trim().toUpperCase() : "";
  const operation = filters.operation ? String(filters.operation).trim() : "";
  const hasEmail = String(filters.hasEmail || "").toLowerCase() === "true";

  if (from) where.push(`add_date >= ${compactDateNumber(from)}`);
  if (to) where.push(`add_date <= ${compactDateNumber(to)}`);
  if (state) where.push(`upper(phy_state) = '${state.replace(/'/g, "''")}'`);
  if (operation) where.push(`carrier_operation = '${operation.replace(/'/g, "''")}'`);
  if (hasEmail) where.push("email_address IS NOT NULL");

  if (where.length) {
    params.$where = where.join(" AND ");
  }

  return params;
}

export async function searchNewVentureLeads(filters = {}) {
  const response = await axios.get(FMCSA_CENSUS_URL, {
    params: buildSocrataParams(filters),
    headers: {
      Accept: "application/json"
    },
    timeout: 30000
  });

  const verifyEmails = String(filters.verifyEmails || "").toLowerCase() === "true";
  const minFleetSize = parseInteger(filters.minFleetSize);
  const leads = response.data
    .map(mapNewVenture)
    .filter(lead => minFleetSize === null || (lead.powerUnits ?? lead.fleetSize ?? 0) >= minFleetSize);

  if (verifyEmails) {
    for (const lead of leads) {
      if (!lead.email) continue;
      const verification = await verifyEmailAddress(lead.email);
      lead.emailVerified = Boolean(verification.verified);
      lead.verificationProvider = verification.provider;
    }
  }

  return leads;
}

export function newVentureRowsToCsv(leads) {
  const headers = [
    "Carrier Name",
    "DOT Number",
    "Added Date",
    "MCS-150 Date",
    "State",
    "City",
    "Physical Address",
    "Mailing Address",
    "Operation",
    "Business Type",
    "Fleet Size",
    "Power Units",
    "Drivers",
    "Email",
    "Email Source",
    "Email Verified",
    "Phone"
  ];

  const rows = leads.map(lead => [
    lead.carrierName,
    lead.dotNumber,
    lead.addDate,
    lead.mcs150Date,
    lead.state,
    lead.city,
    lead.physicalAddress,
    lead.mailingAddress,
    lead.carrierOperation,
    lead.businessType,
    lead.fleetSize,
    lead.powerUnits,
    lead.drivers,
    lead.email,
    lead.emailSource,
    lead.emailVerified ? "Yes" : "No",
    lead.phone
  ]);

  return [headers, ...rows]
    .map(row => row.map(csvCell).join(","))
    .join("\n");
}

function csvCell(value) {
  if (value === undefined || value === null) return "";
  const stringValue = String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}
