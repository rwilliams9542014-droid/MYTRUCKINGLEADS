const UNAVAILABLE_PATTERN = /^(n\/a|na|none|null|not available|not public|not publicly available|unavailable)$/i;

const SOURCE_LABELS = {
  leadSearchResult: "LeadSearch",
  carrierProfile: "Profile",
  motusRecord: "Motus",
  fmcsaRecord: "FMCSA",
  saferRecord: "SAFER",
  dataTransportRecord: "DataTransportGov",
  cachedDatabaseRecord: "Database",
  enrichmentRecord: "Enrichment",
};

const PHONE_CANDIDATES = [
  ["phone", "business"],
  ["phoneNumber", "business"],
  ["telephone", "business"],
  ["tel", "business"],
  ["carrierPhone", "business"],
  ["businessPhone", "business"],
  ["primaryPhone", "primary"],
  ["contactPhone", "contact"],
  ["contact_phone", "contact"],
  ["phone1", "business"],
  ["phone2", "secondary"],
  ["alternatePhone", "secondary"],
  ["secondaryPhone", "secondary"],
  ["mainPhone", "business"],
  ["registrationPhone", "contact"],
  ["applicantPhone", "contact"],
  ["companyPhone", "business"],
  ["cellPhone", "mobile"],
  ["cell_phone", "mobile"],
  ["mobilePhone", "mobile"],
  ["mobile", "mobile"],
  ["cellphone", "mobile"],
  ["contactMobile", "mobile"],
  ["fax", "fax"],
  ["faxNumber", "fax"],
  ["carrierFax", "fax"],
  ["businessFax", "fax"],
  ["fax_phone", "fax"],
  ["carrier.phone", "business"],
  ["carrier.telephone", "business"],
  ["carrier.fax", "fax"],
  ["contact.phone", "contact"],
  ["contact.mobile", "mobile"],
  ["contactInfo.phone", "contact"],
  ["registration.phone", "contact"],
  ["business.phone", "business"],
  ["business.fax", "fax"],
  ["raw.phone", "business"],
  ["raw.telephone", "business"],
  ["raw.phoneNumber", "business"],
  ["raw.mobile", "mobile"],
  ["raw.mobilePhone", "mobile"],
  ["raw.cellPhone", "mobile"],
  ["raw.cell_phone", "mobile"],
  ["raw.fax", "fax"],
  ["raw.faxNumber", "fax"],
  ["raw.carrier.phone", "business"],
  ["raw.carrier.telephone", "business"],
  ["raw.carrier.fax", "fax"],
  ["raw.contact.phone", "contact"],
  ["raw.contact.mobile", "mobile"],
  ["raw.contactInfo.phone", "contact"],
  ["raw.registration.phone", "contact"],
  ["raw.business.phone", "business"],
  ["raw.business.fax", "fax"],
  ["raw.census.phone", "business"],
  ["raw.census.cell_phone", "mobile"],
  ["raw.census.fax", "fax"],
];

export const PHONE_TYPE_LABELS = {
  business: "Business Phone",
  primary: "Primary Phone",
  secondary: "Secondary Phone",
  mobile: "Mobile Phone",
  fax: "Fax Number",
  contact: "Contact Phone",
  unknown: "Phone Number",
};

function clean(value) {
  return String(value || "").trim();
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getPath(source, path) {
  return String(path || "").split(".").reduce((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return value[key];
  }, source);
}

export function normalizePhoneDigits(value) {
  const text = clean(value);
  if (!text || UNAVAILABLE_PATTERN.test(text)) return "";
  const digits = text.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  if (digits.length === 10 && !/^(\d)\1{9}$/.test(digits) && !/^[01]/.test(digits) && !/^\d{3}[01]/.test(digits)) return digits;
  return "";
}

export function formatPhoneNumber(value) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return "";
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function normalizeType(type = "") {
  const text = String(type || "").toLowerCase();
  if (/fax/.test(text)) return "fax";
  if (/mobile|cell/.test(text)) return "mobile";
  if (/primary/.test(text)) return "primary";
  if (/business|main|company|carrier|telephone|tel\b|phone$|^phone$|phone1/.test(text)) return "business";
  if (/contact|registration|applicant/.test(text)) return "contact";
  if (/alternate|secondary|phone2/.test(text)) return "secondary";
  return "unknown";
}

function confidenceFor(type) {
  if (["business", "primary", "mobile", "fax"].includes(type)) return "high";
  if (["contact", "secondary"].includes(type)) return "medium";
  return "low";
}

function rankType(type) {
  return { business: 1, primary: 2, contact: 3, mobile: 4, unknown: 5, secondary: 6, fax: 7 }[type] || 8;
}

function normalizeEntry(value, fieldType = "unknown", extra = {}) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return null;
  const type = normalizeType(extra.type || fieldType);
  return {
    type,
    label: PHONE_TYPE_LABELS[type] || PHONE_TYPE_LABELS.unknown,
    number: formatPhoneNumber(digits),
    rawNumber: clean(value),
    digits,
    source: extra.source || "Profile",
    sourceField: extra.sourceField || extra.field || "",
    confidence: extra.confidence || confidenceFor(type),
    isPrimary: Boolean(extra.isPrimary) || type === "business" || type === "primary",
  };
}

function mergeEntry(existing, next) {
  if (!existing) return next;
  if (existing.type === "fax" && next.type !== "fax") return { ...existing, ...next };
  if (next.type === "fax" && existing.type !== "fax") return existing;
  if (rankType(next.type) < rankType(existing.type)) return { ...existing, ...next };
  return {
    ...next,
    ...existing,
    source: existing.source || next.source,
    sourceField: existing.sourceField || next.sourceField,
    confidence: existing.confidence === "high" ? "high" : next.confidence || existing.confidence,
  };
}

export function dedupeContactNumbers(numbers = []) {
  const byDigits = new Map();
  numbers.filter(Boolean).forEach((entry) => {
    const normalized = normalizeEntry(entry.rawNumber || entry.number || entry.phone || entry.value || entry.digits, entry.type || entry.label, entry);
    if (!normalized) return;
    byDigits.set(normalized.digits, mergeEntry(byDigits.get(normalized.digits), normalized));
  });
  return [...byDigits.values()].sort((a, b) => rankType(a.type) - rankType(b.type) || a.number.localeCompare(b.number));
}

export function collectContactNumbers(raw = {}, options = {}) {
  const entries = [];
  const source = safeObject(raw);
  const sourceName = options.source || source.sourceName || "Profile";

  if (Array.isArray(source.contactNumbers)) {
    source.contactNumbers.forEach((entry) => entries.push(normalizeEntry(
      entry.rawNumber || entry.number || entry.phone || entry.value || entry.digits,
      entry.type || entry.label,
      { ...entry, source: entry.source || sourceName, sourceField: entry.sourceField || "contactNumbers" }
    )));
  }

  PHONE_CANDIDATES.forEach(([path, fieldType]) => {
    const value = getPath(source, path);
    if (Array.isArray(value)) {
      value.forEach((item) => entries.push(normalizeEntry(item, fieldType, { source: sourceName, sourceField: path })));
    } else {
      entries.push(normalizeEntry(value, fieldType, { source: sourceName, sourceField: path }));
    }
  });

  return dedupeContactNumbers(entries);
}

export function collectContactNumbersFromAllSources(carrierSources = {}) {
  const entries = [];
  Object.entries(SOURCE_LABELS).forEach(([key, source]) => {
    const value = carrierSources[key];
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((item) => entries.push(...collectContactNumbers(item, { source })));
    } else {
      entries.push(...collectContactNumbers(value, { source }));
    }
  });
  return dedupeContactNumbers(entries);
}

export function getBestPrimaryPhone(numbers = []) {
  const deduped = dedupeContactNumbers(numbers);
  return deduped.find((entry) => entry.type === "business")
    || deduped.find((entry) => entry.type === "primary")
    || deduped.find((entry) => entry.type === "contact")
    || deduped.find((entry) => entry.type === "mobile")
    || deduped.find((entry) => entry.type === "unknown")
    || deduped.find((entry) => entry.type === "fax")
    || null;
}

export function getPrimaryContactNumber(numbers = []) {
  const best = getBestPrimaryPhone(numbers);
  return best?.type === "fax" ? null : best;
}

export function getContactNumberByType(numbers = [], type) {
  return dedupeContactNumbers(numbers).find((entry) => entry.type === type) || null;
}

export function getTextCandidateNumber(numbers = []) {
  const candidates = dedupeContactNumbers(numbers).filter((entry) => entry.type !== "fax");
  return candidates.find((entry) => entry.type === "mobile")
    || candidates.find((entry) => ["business", "contact", "primary", "unknown", "secondary"].includes(entry.type))
    || null;
}

export function formatContactNumber(entry = {}) {
  const type = normalizeType(entry.type || entry.label);
  return [PHONE_TYPE_LABELS[type] || PHONE_TYPE_LABELS.unknown, entry.number].filter(Boolean).join(": ");
}

export function formatAllContactNumbers(numbers = []) {
  return dedupeContactNumbers(numbers).map(formatContactNumber).join(" | ");
}
