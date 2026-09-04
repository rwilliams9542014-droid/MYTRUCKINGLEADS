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

export function requireBulkMessagingAccess(req, res, next) {
  try {
    assertOutreachAccess(req.user, "email", countFromBody(req));
    next();
  } catch (err) {
    res.status(err.status || 403).json({ error: err.message });
  }
}
