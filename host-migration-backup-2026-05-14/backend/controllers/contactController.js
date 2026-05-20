import { ValidationError } from "../middleware/errorHandler.js";
import { validateEmail, validateString } from "../utils/validators.js";
import { sendContactRequestEmail } from "../services/emailService.js";

function optionalString(value, maxLength = 255) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.length > maxLength) {
    throw new ValidationError(`Value must be ${maxLength} characters or fewer`);
  }
  return trimmed;
}

function buildSourcePage(req) {
  try {
    const origin = String(req?.get?.("origin") || "").trim();
    if (origin) return origin;

    const protocol = String(req?.protocol || "https").trim() || "https";
    const host = String(req?.get?.("host") || req?.headers?.host || "").trim();
    const path = String(req?.originalUrl || req?.url || "/").trim() || "/";
    if (host) return `${protocol}://${host}${path}`;
  } catch (err) {
    console.error("Failed to determine contact request source page:", err.message);
  }

  return "Website contact form";
}

export async function submitContactRequest(req, res, next) {
  try {
    const honeypot = String(req.body?.website || "").trim();
    if (honeypot) {
      return res.json({ success: true, message: "Request received." });
    }

    const name = validateString(req.body?.name, "name", 2, 120);
    const email = validateEmail(req.body?.email);
    const message = validateString(req.body?.message, "message", 10, 2500);
    const phone = optionalString(req.body?.phone, 40);
    const agency = optionalString(req.body?.agency, 160);
    const submittedAt = new Date().toISOString();
    const sourcePage = buildSourcePage(req);

    let result = null;
    try {
      result = await sendContactRequestEmail({
        toEmail: process.env.CONTACT_REQUEST_TO || "rwilliams9542014@gmail.com",
        name,
        email,
        phone,
        agency,
        message,
        submittedAt,
        sourcePage
      });
    } catch (err) {
      console.error("Unexpected contact email delivery error:", {
        error: err.message,
        stack: err.stack,
        toEmail: process.env.CONTACT_REQUEST_TO || "rwilliams9542014@gmail.com",
        requesterEmail: email,
        sourcePage
      });
    }

    if (!result?.success) {
      const failureMessage = result?.message || "Contact email is not available right now.";
      console.warn("Contact request email unavailable:", {
        toEmail: process.env.CONTACT_REQUEST_TO || "rwilliams9542014@gmail.com",
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
      message: "Thanks. Your request was sent successfully."
    });
  } catch (err) {
    next(err);
  }
}
