import { assertOutreachAccess } from "../services/outreachService.js";

function countFromBody(req) {
  return Array.isArray(req.body?.leads) ? req.body.leads.length : 1;
}

export function requireEmailAccess(req, res, next) {
  try {
    assertOutreachAccess(req.user, "email");
    next();
  } catch (err) {
    res.status(err.status || 403).json({ error: err.message });
  }
}

export function requireSmsAccess(req, res, next) {
  try {
    assertOutreachAccess(req.user, "sms");
    next();
  } catch (err) {
    res.status(err.status || 403).json({ error: err.message });
  }
}

export function requireBulkMessagingAccess(req, res, next) {
  try {
    const channel = req.path.includes("/sms/") ? "sms" : "email";
    assertOutreachAccess(req.user, channel, countFromBody(req), { bulk: true });
    next();
  } catch (err) {
    res.status(err.status || 403).json({ error: err.message });
  }
}
