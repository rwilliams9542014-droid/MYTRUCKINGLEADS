import { ValidationError } from "../middleware/errorHandler.js";
import { query } from "../config/db.js";
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
    const bodySource = String(req?.body?.sourcePage || req?.body?.source_page || "").trim();
    if (bodySource) return bodySource;

    const referer = String(req?.get?.("referer") || req?.headers?.referer || "").trim();
    if (referer) return referer;

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

async function persistContactRequest(record) {
  if (!process.env.DATABASE_URL) return null;

  try {
    const result = await query(
      `INSERT INTO contact_requests (
         name, email, phone, agency, message, source_page,
         email_delivery_status, email_delivery_message, submitted_at, status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')
       RETURNING id, status`,
      [
        record.name,
        record.email,
        record.phone || "",
        record.agency || "",
        record.message,
        record.sourcePage || "",
        record.emailDeliveryStatus || "failed",
        record.emailDeliveryMessage || "",
        record.submittedAt
      ]
    );

    return result.rows[0] || null;
  } catch (err) {
    console.error("Failed to persist contact request:", err.message);
    return null;
  }
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
      await persistContactRequest({
        name,
        email,
        phone,
        agency,
        message,
        sourcePage,
        submittedAt,
        emailDeliveryStatus: "failed",
        emailDeliveryMessage: failureMessage
      });

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

    await persistContactRequest({
      name,
      email,
      phone,
      agency,
      message,
      sourcePage,
      submittedAt,
      emailDeliveryStatus: "sent",
      emailDeliveryMessage: result.message
    });

    return res.json({
      success: true,
      message: "Thanks. Your request was sent successfully."
    });
  } catch (err) {
    next(err);
  }
}
