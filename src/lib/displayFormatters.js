const UNAVAILABLE_PATTERN = /^(unknown|n\/a|na|none|null|undefined|not available|not public|not publicly available|unavailable)$/i;

export function formatUnavailable(value, short = false) {
  if (value || value === 0) return value;
  return short ? "None Shown" : "None Shown";
}

export function cleanDisplayValue(value) {
  const text = String(value ?? "").trim();
  return text && !UNAVAILABLE_PATTERN.test(text) ? text : "";
}

export function formatDate(value) {
  const text = cleanDisplayValue(value);
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})/);
  if (compact) return `${compact[2]}/${compact[3]}/${compact[1]}`;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatMcNumber(value) {
  const text = cleanDisplayValue(value).replace(/^(MC|MX|FF)\s*-?\s*/i, "");
  return text ? `MC ${text}` : "";
}

export function formatCarrierOperation(value) {
  const text = cleanDisplayValue(value).replace(/^\d+\s*,\s*/, "").trim();
  if (!text || /^[A-Z0-9]$/i.test(text)) return "";
  return text;
}

export function formatEntityType(value) {
  const text = cleanDisplayValue(value);
  const upper = text.toUpperCase();
  if (!text) return "";
  if (upper === "A" || upper === "C") return "Carrier";
  if (upper.includes("CARRIER")) return "Carrier";
  if (/^[A-Z]$/.test(upper)) return "";
  return text;
}

export function formatAuthorityStatus(value) {
  const text = cleanDisplayValue(value);
  const upper = text.toUpperCase();
  if (!text) return "";
  if (upper === "N") return "Not Authorized";
  if (upper === "Y" || upper === "A") return "Authorized";
  if (upper === "P") return "Pending";
  if (upper.includes("NOT AUTH")) return "Not Authorized";
  if (upper.includes("AUTHORIZED")) return text.replace(/^authorized$/i, "Authorized");
  if (upper.includes("REVOK")) return "Revoked";
  if (/^[A-Z]$/.test(upper)) return "";
  return text;
}

export function formatOosStatus(value) {
  const text = cleanDisplayValue(value);
  const upper = text.toUpperCase();
  if (!text) return "";
  if (upper === "Y") return "Yes";
  if (upper === "N") return "No";
  if (/^[A-Z]$/.test(upper)) return "";
  return text;
}

export function formatCargoList(value) {
  const rows = Array.isArray(value) ? value : String(value || "").split(/[,;|]/);
  return [...new Set(rows.map(cleanDisplayValue).filter(Boolean))];
}

export function formatContactNumbers(numbers = []) {
  return (Array.isArray(numbers) ? numbers : []).filter((entry) => entry?.number);
}

export function formatVehicleBreakdown(carrier = {}) {
  const breakdown = carrier.fleetBreakdown || {};
  const rows = [
    ["Straight Trucks", carrier.straightTrucks ?? breakdown.straightTrucks],
    ["Truck Tractors", carrier.tractors ?? breakdown.tractors],
    ["Trailers", carrier.trailers ?? breakdown.trailers],
    ["Hazmat Cargo Tank Trailers", breakdown.hazmatCargoTankTrailers],
    ["Motor Coach", breakdown.motorCoach],
    ["School Bus", breakdown.schoolBus],
    ["Mini Bus", breakdown.miniBus],
    ["Van", breakdown.van],
    ["Limousine", breakdown.limousine],
    ["Passenger Car", breakdown.passengerCar],
    ["Other", breakdown.other],
  ].filter(([, total]) => total || total === 0);

  return {
    rows: rows.map(([type, total]) => ({ type, owned: "", termLeased: "", tripLeased: "", total })),
    totalPowerUnits: carrier.trucks ?? carrier.powerUnits ?? carrier.fleetSize ?? "",
  };
}

export function formatDriverBreakdown(carrier = {}) {
  const rows = [
    ["Total CDL Drivers", carrier.cdlDrivers],
    ["Total Drivers", carrier.drivers],
  ].filter(([, total]) => total || total === 0);

  return {
    rows: rows.map(([type, total]) => ({
      type,
      interstate: "",
      intrastate: type === "Total Drivers" ? carrier.intrastateDrivers || "" : "",
      total,
    })),
    totalDrivers: carrier.drivers ?? carrier.driverCount ?? "",
  };
}
