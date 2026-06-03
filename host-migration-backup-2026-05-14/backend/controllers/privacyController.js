import { ValidationError } from "../middleware/errorHandler.js";
import { validateEmail, validateString } from "../utils/validators.js";
import { sendPrivacyRequestEmail } from "../services/emailService.js";

const PRIVACY_REQUEST_TYPES = new Set([
  "access",
  "correction",
  "export",
  "deletion",
  "opt_out",
  "other"
]);

function optionalString(value, maxLength = 255) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.length > maxLength) {
    throw new ValidationError(`Value must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

function optionalEmail(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  return validateEmail(trimmed);
}

function normalizeRequestType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!PRIVACY_REQUEST_TYPES.has(normalized)) {
    throw new ValidationError("Choose a valid privacy request type", "requestType");
  }
  return normalized;
}

function buildSourcePage(req) {
  try {
    const origin = String(req?.get?.("origin") || "").trim();
    if (origin) return origin;

    const protocol = String(req?.protocol || "https").trim() || "https";
    const host = String(req?.get?.("host") || req?.headers?.host || "").trim();
    const routePath = String(req?.originalUrl || req?.url || "/").trim() || "/";
    if (host) return `${protocol}://${host}${routePath}`;
  } catch (err) {
    console.error("Failed to determine privacy request source page:", err.message);
  }

  return "Website privacy request form";
}

export async function submitPrivacyRequest(req, res, next) {
  try {
    const honeypot = String(req.body?.website || "").trim();
    if (honeypot) {
      return res.json({ success: true, message: "Request received." });
    }

    const requestType = normalizeRequestType(req.body?.requestType);
    const name = validateString(req.body?.name, "name", 2, 120);
    const email = validateEmail(req.body?.email);
    const accountEmail = optionalEmail(req.body?.accountEmail);
    const location = optionalString(req.body?.location, 120);
    const details = validateString(req.body?.details, "details", 10, 2500);
    const submittedAt = new Date().toISOString();
    const sourcePage = buildSourcePage(req);

    let result = null;
    try {
      result = await sendPrivacyRequestEmail({
        toEmail: process.env.PRIVACY_REQUEST_TO || process.env.CONTACT_REQUEST_TO || "mytruckingleads@gmail.com",
        requestType,
        name,
        email,
        accountEmail,
        location,
        details,
        submittedAt,
        sourcePage
      });
    } catch (err) {
      console.error("Unexpected privacy request email delivery error:", {
        error: err.message,
        stack: err.stack,
        toEmail: process.env.PRIVACY_REQUEST_TO || process.env.CONTACT_REQUEST_TO || "mytruckingleads@gmail.com",
        requesterEmail: email,
        sourcePage
      });
    }

    if (!result?.success) {
      const failureMessage = result?.message || "Privacy request email is not available right now.";
      console.warn("Privacy request email unavailable:", {
        toEmail: process.env.PRIVACY_REQUEST_TO || process.env.CONTACT_REQUEST_TO || "mytruckingleads@gmail.com",
        requesterEmail: email,
        message: failureMessage,
        sourcePage
      });
      return res.status(503).json({
        success: false,
        error: failureMessage
      });
    }

    return res.json({
      success: true,
      message: "Thanks. Your privacy request was sent successfully. We will follow up by email after review."
    });
  } catch (err) {
    next(err);
  }
}
