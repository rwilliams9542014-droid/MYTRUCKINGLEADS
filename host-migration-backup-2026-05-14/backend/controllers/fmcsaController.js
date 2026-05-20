import { ValidationError } from "../middleware/errorHandler.js";
import {
  fetchQcmobileCarrierByDotOrMc,
  isFmcsaWebKeyConfigured
} from "../services/fmcsaService.js";

function normalizeLookupValue(value) {
  return String(value || "").trim();
}

function normalizeDot(value) {
  const normalized = normalizeLookupValue(value);
  if (!normalized) return "";
  if (!/^\d{1,8}$/.test(normalized)) {
    throw new ValidationError("dot must be 1 to 8 digits", "dot");
  }
  return normalized;
}

function normalizeMc(value) {
  const normalized = normalizeLookupValue(value).toUpperCase().replace(/^(MC|MX|FF)\s*-?\s*/, "");
  if (!normalized) return "";
  if (!/^[A-Z0-9-]{1,20}$/.test(normalized)) {
    throw new ValidationError("mc must be 1 to 20 letters, numbers, or dashes", "mc");
  }
  return normalized;
}

export async function searchFmcsaCarrier(req, res, next) {
  try {
    const dot = normalizeDot(req.query?.dot);
    const mc = normalizeMc(req.query?.mc);

    if (!dot && !mc) {
      throw new ValidationError("dot or mc query parameter is required");
    }

    if (dot && mc) {
      throw new ValidationError("Provide either dot or mc, not both");
    }

    if (!isFmcsaWebKeyConfigured()) {
      return res.status(503).json({
        success: false,
        error: "FMCSA webKey is not configured"
      });
    }

    const carrier = await fetchQcmobileCarrierByDotOrMc({ dot, mc });
    if (!carrier) {
      return res.status(404).json({
        success: false,
        error: "Carrier not found in FMCSA QCMobile"
      });
    }

    return res.json({
      success: true,
      carrier,
      source: "FMCSA QCMobile API",
      proxied: true
    });
  } catch (err) {
    next(err);
  }
}
