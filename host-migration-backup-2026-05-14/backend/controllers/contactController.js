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

    const result = await sendContactRequestEmail({
      toEmail: process.env.CONTACT_REQUEST_TO || "rwilliams9542014@gmail.com",
      name,
      email,
      phone,
      agency,
      message,
      submittedAt: new Date().toISOString(),
      sourcePage: req.get("origin") || `${req.protocol}://${req.get("host")}${req.originalUrl}`
    });

    if (!result.success) {
      return res.status(503).json({
        success: false,
        error: result.message || "Contact email is not available right now."
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
