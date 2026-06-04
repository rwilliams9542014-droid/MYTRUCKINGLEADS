import {
  collectContactNumbersFromAllSources,
  getBestPrimaryPhone
} from "../utils/contactNumbers.js";

function clean(value, fallback = "") {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  return text && !/^not available(?: from public fmcsa data)?$/i.test(text) ? text : fallback;
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function valuesByKey(source, wantedKeys) {
  const wanted = new Set(wantedKeys.map(key => key.toLowerCase()));
  const found = [];
  const visit = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 4) return;
    for (const [key, nested] of Object.entries(value)) {
      if (wanted.has(key.toLowerCase()) && clean(nested)) found.push(nested);
      if (nested && typeof nested === "object") visit(nested, depth + 1);
    }
  };
  visit(source);
  return found;
}

function first(source, keys, ...fallbacks) {
  return clean(valuesByKey(source, keys)[0]) || fallbacks.map(value => clean(value)).find(Boolean) || "";
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function dateText(value) {
  if (!value) return "";
  const compact = String(value).trim().match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? clean(value) : date.toISOString().slice(0, 10);
}

function splitCargo(value) {
  if (Array.isArray(value)) return value.map(item => clean(item)).filter(Boolean);
  return String(value || "").split(/[,;|]/).map(item => clean(item)).filter(Boolean);
}

function parseAddressText(value = "") {
  const parts = String(value || "").split(",").map(clean).filter(Boolean);
  const stateZip = String(parts[2] || "").match(/^([A-Z]{2})\s+(.+)$/i);
  return {
    street: parts[0] || "",
    city: parts[1] || "",
    state: stateZip?.[1] || parts[2] || "",
    zip: stateZip?.[2] || parts[3] || "",
    country: parts[4] || ""
  };
}

function addressFields(source, address = {}) {
  const nested = safeObject(address);
  const parsed = parseAddressText(clean(address));
  const street = first(source, ["phyStreet", "physicalStreet", "physical_street", "street", "streetAddress", "carrierStreet"], nested.street, parsed.street);
  const city = first(source, ["phyCity", "physicalCity", "physical_city", "city"], nested.city, parsed.city);
  const state = first(source, ["phyState", "physicalState", "physical_state", "state"], nested.state, parsed.state);
  const zip = first(source, ["phyZip", "phyZipcode", "physicalZip", "physical_zip", "zip", "zipCode", "postalCode"], nested.zip, parsed.zip);
  const country = first(source, ["phyCountry", "physicalCountry", "physical_country", "country"], nested.country, parsed.country);
  return {
    street,
    city,
    state,
    zip,
    country,
    text: [street, city, [state, zip].filter(Boolean).join(" "), country].filter(Boolean).join(", ")
  };
}

function mailingFields(source) {
  const street = first(source, ["mailingStreet", "mailing_street", "carrier_mailing_street"]);
  const city = first(source, ["mailingCity", "mailing_city", "carrier_mailing_city"]);
  const state = first(source, ["mailingState", "mailing_state", "carrier_mailing_state"]);
  const zip = first(source, ["mailingZip", "mailing_zip", "carrier_mailing_zip"]);
  const country = first(source, ["mailingCountry", "mailing_country"]);
  return {
    street,
    city,
    state,
    zip,
    country,
    text: [street, city, [state, zip].filter(Boolean).join(" "), country].filter(Boolean).join(", ")
  };
}

export function normalizeCanonicalCarrier(input = {}) {
  const source = safeObject(input);
  const census = safeObject(source.raw?.census);
  const combined = { ...census, ...source };
  const physical = addressFields(combined, source.addressParts || source.address || source.physicalAddress);
  const mailing = mailingFields(combined);
  const cargoTypes = splitCargo(source.cargoTypes || source.cargoCarried || source.cargoHauled || source.cargo || source.cargo_hauled);
  const insuranceExpirationDate = dateText(source.insuranceExpirationDate || source.insuranceExpiration || source.insurance_expiration);
  const insuranceCancellationDate = dateText(source.insuranceCancellationDate || source.insuranceCancelDate || source.fmcsaInsuranceCancellationDate || insuranceExpirationDate);
  const contactNumbers = collectContactNumbersFromAllSources({
    leadSearchResult: source,
    carrierProfile: source,
    motusRecord: source.motusProfile || source.raw?.motusProfile || source.raw?.motusRegister,
    fmcsaRecord: source.qcmobileDetails || source.raw?.liveCarrier || source.raw?.qcmobileDetails,
    saferRecord: source.saferData || source.raw?.saferData,
    dataTransportRecord: census,
    cachedDatabaseRecord: source.cachedDatabaseRecord || source.raw?.databaseRecord,
    enrichmentRecord: source
  });
  const primaryContact = getBestPrimaryPhone(contactNumbers);
  const bestPhone = primaryContact?.type === "fax" ? "" : primaryContact?.number || "";
  const faxContact = contactNumbers.find((entry) => entry.type === "fax");

  return {
    dotNumber: first(combined, ["dotNumber", "dot_number", "usdot", "usdotNumber", "dot"]),
    mcNumber: first(combined, ["mcNumber", "mc_number", "docketNumber", "mc"]),
    legalName: first(combined, ["legalName", "legal_name", "carrierName", "carrier_name", "name"]),
    dbaName: first(combined, ["dbaName", "dba_name", "dba"]),
    carrierName: first(combined, ["carrierName", "carrier_name", "legalName", "legal_name", "name"], "Unknown Carrier"),
    entityType: first(combined, ["entityType", "entity_type", "businessType", "business_org_desc"]),
    operatingStatus: first(combined, ["operatingStatus", "operating_status"]),
    authorityStatus: first(combined, ["authorityStatus", "authority_status"]),
    outOfServiceStatus: first(combined, ["outOfServiceStatus", "out_of_service_status"]),
    outOfServiceDate: dateText(first(combined, ["outOfServiceDate", "out_of_service_date"])),
    phone: bestPhone || first(combined, ["telephone", "phone", "phoneNumber", "carrierPhone"]),
    phoneNumber: bestPhone || first(combined, ["telephone", "phone", "phoneNumber", "carrierPhone"]),
    email: first(combined, ["email", "emailAddress", "carrierEmail", "contactEmail", "businessEmail", "email_address"]).toLowerCase(),
    fax: faxContact?.number || first(combined, ["fax", "faxNumber"]),
    contactNumbers,
    physicalAddress: physical.text,
    physicalStreet: physical.street,
    physicalCity: physical.city,
    physicalState: physical.state,
    physicalZip: physical.zip,
    physicalCountry: physical.country,
    mailingAddress: mailing.text,
    mailingStreet: mailing.street,
    mailingCity: mailing.city,
    mailingState: mailing.state,
    mailingZip: mailing.zip,
    mailingCountry: mailing.country,
    powerUnits: numberOrNull(source.powerUnits ?? source.power_units ?? source.fleetSize ?? source.vehicleCount ?? census.power_units),
    drivers: numberOrNull(source.drivers ?? source.driverCount ?? source.driver_count ?? source.total_drivers ?? census.total_drivers),
    cargoHauled: cargoTypes,
    operationClassification: source.operationClassification || source.carrierOperation || census.carrier_operation || "",
    mcs150Date: dateText(source.mcs150Date || source.mcs150_date || census.mcs150_date),
    addedDate: dateText(source.addedDate || source.addDate || source.add_date || source.dateCreated || source.firstSeenAt),
    registrationDate: dateText(source.registrationDate || source.add_date || source.dateCreated || source.newLeadSince),
    newDotDate: dateText(source.newDotDate || source.add_date || source.dateCreated || source.newLeadSince),
    insuranceCarrier: clean(source.insuranceCarrier || source.insuranceCompany || source.insurance_company),
    insurancePolicyNumber: clean(source.insurancePolicyNumber || source.insurance_policy_number),
    insuranceEffectiveDate: dateText(source.insuranceEffectiveDate || source.insurance_effective_date),
    insuranceExpirationDate,
    insuranceCancellationDate,
    insuranceFilings: source.insuranceFilings || [],
    totalInspections: numberOrNull(source.totalInspections),
    vehicleInspections: numberOrNull(source.vehicleInspections),
    driverInspections: numberOrNull(source.driverInspections),
    hazmatInspections: numberOrNull(source.hazmatInspections),
    vehicleOosRate: numberOrNull(source.vehicleOosRate),
    driverOosRate: numberOrNull(source.driverOosRate),
    hazmatOosRate: numberOrNull(source.hazmatOosRate),
    totalViolations: numberOrNull(source.totalViolations),
    totalCrashes: numberOrNull(source.totalCrashes ?? source.crashTotal),
    fatalCrashes: numberOrNull(source.fatalCrashes),
    injuryCrashes: numberOrNull(source.injuryCrashes),
    towCrashes: numberOrNull(source.towCrashes),
    safetyRating: clean(source.safetyRating, "Unknown"),
    safetyRatingDate: dateText(source.safetyRatingDate),
    basics: source.basics || source.basicScores || [],
    source: clean(source.source, "Saved database / FMCSA public data"),
    rawSources: source.raw || {}
  };
}

export function canonicalCarrierToLead(carrier = {}, mode = "new") {
  return {
    ...carrier,
    dot: carrier.dotNumber,
    mc: carrier.mcNumber,
    name: carrier.carrierName,
    state: carrier.physicalState,
    city: carrier.physicalCity,
    address: carrier.physicalAddress,
    phone: carrier.phone,
    phoneNumber: carrier.phoneNumber || carrier.phone,
    fax: carrier.fax,
    contactNumbers: carrier.contactNumbers || [],
    email: carrier.email,
    trucks: carrier.powerUnits,
    powerUnits: carrier.powerUnits,
    drivers: carrier.drivers,
    cargo: carrier.cargoHauled,
    cargoHauled: carrier.cargoHauled,
    mcs150Date: carrier.mcs150Date,
    addedDate: carrier.addedDate || carrier.newDotDate,
    insuranceCompany: carrier.insuranceCarrier,
    insuranceExpirationDate: carrier.insuranceExpirationDate,
    insuranceCancelDate: carrier.insuranceCancellationDate,
    type: mode
  };
}
