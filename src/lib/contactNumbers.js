const UNAVAILABLE_PATTERN = /^(n\/a|na|none|null|not available|not public|not publicly available|unavailable)$/i;

const PHONE_CANDIDATES = [
  ["phone", "phone"],
  ["phoneNumber", "phoneNumber"],
  ["telephone", "telephone"],
  ["tel", "tel"],
  ["carrierPhone", "carrierPhone"],
  ["businessPhone", "businessPhone"],
  ["primaryPhone", "primaryPhone"],
  ["contactPhone", "contactPhone"],
  ["contact_phone", "contact_phone"],
  ["cellPhone", "cellPhone"],
  ["cell_phone", "cell_phone"],
  ["mobilePhone", "mobilePhone"],
  ["mobile", "mobile"],
  ["cellphone", "cellphone"],
  ["phone1", "phone1"],
  ["phone2", "phone2"],
  ["alternatePhone", "alternatePhone"],
  ["secondaryPhone", "secondaryPhone"],
  ["fax", "fax"],
  ["faxNumber", "faxNumber"],
  ["carrierFax", "carrierFax"],
  ["businessFax", "businessFax"],
  ["fax_phone", "fax_phone"],
  ["contact.phone", "contact.phone"],
  ["contactInfo.phone", "contactInfo.phone"],
  ["carrier.phone", "carrier.phone"],
  ["raw.phone", "raw.phone"],
  ["raw.phoneNumber", "raw.phoneNumber"],
  ["raw.telephone", "raw.telephone"],
  ["raw.cellPhone", "raw.cellPhone"],
  ["raw.cell_phone", "raw.cell_phone"],
  ["raw.mobilePhone", "raw.mobilePhone"],
  ["raw.fax", "raw.fax"],
  ["raw.faxNumber", "raw.faxNumber"],
  ["raw.contact.phone", "raw.contact.phone"],
  ["raw.contactInfo.phone", "raw.contactInfo.phone"],
  ["raw.census.phone", "raw.census.phone"],
  ["raw.census.cell_phone", "raw.census.cell_phone"],
  ["raw.census.fax", "raw.census.fax"],
];

export const PHONE_TYPE_LABELS = {
  primary: "Primary",
  business: "Business",
  mobile: "Mobile",
  contact: "Contact",
  fax: "Fax",
  secondary: "Secondary",
  unknown: "Other",
};

function clean(value) {
  return String(value || "").trim();
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
  if (digits.length === 10) return digits;
  return "";
}

export function formatPhoneNumber(value) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return "";
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function inferType(label = "") {
  const text = String(label).toLowerCase();
  if (/fax/.test(text)) return "fax";
  if (/mobile|cell/.test(text)) return "mobile";
  if (/primary/.test(text)) return "primary";
  if (/business|carrier|telephone|tel\b|phone$|^phone$|phone1/.test(text)) return "business";
  if (/contact/.test(text)) return "contact";
  if (/alternate|secondary|phone2/.test(text)) return "secondary";
  return "unknown";
}

function inferSource(label = "") {
  const text = String(label).toLowerCase();
  if (/fmcsa|census|safer/.test(text)) return "FMCSA";
  if (/motus/.test(text)) return "Motus";
  if (/raw/.test(text)) return "Enrichment";
  return "Carrier record";
}

function confidenceFor(type) {
  if (type === "primary" || type === "business" || type === "mobile" || type === "fax") return "high";
  if (type === "contact" || type === "secondary") return "medium";
  return "low";
}

function normalizeEntry(value, label = "", extra = {}) {
  const digits = normalizePhoneDigits(value);
  if (!digits) return null;
  const type = extra.type || inferType(label);
  return {
    type,
    label: extra.label || PHONE_TYPE_LABELS[type] || "Other",
    number: formatPhoneNumber(digits),
    digits,
    source: extra.source || inferSource(label),
    confidence: extra.confidence || confidenceFor(type),
    original: clean(value),
  };
}

function rankType(type) {
  return { primary: 1, business: 2, contact: 3, mobile: 4, secondary: 5, unknown: 6, fax: 7 }[type] || 8;
}

export function dedupeContactNumbers(numbers = []) {
  const byDigits = new Map();
  numbers.filter(Boolean).forEach((entry) => {
    const normalized = normalizeEntry(entry.digits || entry.number || entry.original, entry.type || entry.label, entry);
    if (!normalized) return;
    const current = byDigits.get(normalized.digits);
    if (!current || rankType(normalized.type) < rankType(current.type)) {
      byDigits.set(normalized.digits, {
        ...current,
        ...normalized,
        source: [current?.source, normalized.source].filter(Boolean)[0] || normalized.source,
      });
    }
  });
  return [...byDigits.values()].sort((a, b) => rankType(a.type) - rankType(b.type) || a.number.localeCompare(b.number));
}

export function collectContactNumbers(raw = {}) {
  const entries = [];
  const source = raw && typeof raw === "object" ? raw : {};
  if (Array.isArray(source.contactNumbers)) {
    source.contactNumbers.forEach((entry) => entries.push(normalizeEntry(entry.number || entry.phone || entry.value || entry.digits, entry.type || entry.label, entry)));
  }
  PHONE_CANDIDATES.forEach(([path, label]) => {
    const value = getPath(source, path);
    if (Array.isArray(value)) {
      value.forEach((item) => entries.push(normalizeEntry(item, label)));
    } else {
      entries.push(normalizeEntry(value, label));
    }
  });
  return dedupeContactNumbers(entries);
}

export function getPrimaryContactNumber(numbers = []) {
  return dedupeContactNumbers(numbers).find((entry) => entry.type !== "fax") || null;
}

export function getContactNumberByType(numbers = [], type) {
  return dedupeContactNumbers(numbers).find((entry) => entry.type === type) || null;
}

export function getTextCandidateNumber(numbers = []) {
  const candidates = dedupeContactNumbers(numbers).filter((entry) => entry.type !== "fax");
  return candidates.find((entry) => entry.type === "mobile")
    || candidates.find((entry) => ["business", "contact", "primary", "secondary", "unknown"].includes(entry.type))
    || null;
}

export function formatContactNumber(entry = {}) {
  return [entry.label || PHONE_TYPE_LABELS[entry.type] || "Other", entry.number].filter(Boolean).join(": ");
}

export function formatAllContactNumbers(numbers = []) {
  return dedupeContactNumbers(numbers).map(formatContactNumber).join(" | ");
}
