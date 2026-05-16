import {
  TRIAL_LIMIT_MESSAGE,
  TRIAL_LIMITS,
  applyTrialResponse,
  getTrialUsage,
  isTrialUser
} from "../utils/trialAccess.js";

function limitErrorResponse(req, res, usage, extra = {}) {
  return res.status(403).json({
    error: TRIAL_LIMIT_MESSAGE,
    trialAccess: usage,
    access: extra.access,
    ...extra
  });
}

export function applyTrialAccessContext(req, res, next) {
  applyTrialResponse(res, req.user);
  next();
}

export function enforceTrialSearchLimit(req, res, next) {
  const usage = getTrialUsage(req.user);
  res.locals.trialAccess = usage;

  if (usage.active) {
    const current = Number(req.query.limit) || TRIAL_LIMITS.searchResults;
    req.query.limit = String(Math.min(Math.max(current, 1), TRIAL_LIMITS.searchResults));
    req.trialSearchLimited = true;
  }

  next();
}

export function enforceTrialProfileLimit(req, res, next) {
  const usage = getTrialUsage(req.user);
  res.locals.trialAccess = usage;

  if (usage.active && usage.remaining.profileViews <= 0) {
    return limitErrorResponse(req, res, usage);
  }

  next();
}

export function enforceTrialSaveLimit(req, res, next) {
  const usage = getTrialUsage(req.user);
  res.locals.trialAccess = usage;

  if (usage.active && usage.remaining.savedProspects <= 0) {
    return limitErrorResponse(req, res, usage);
  }

  next();
}

export function blockTrialCsvExport(req, res, next) {
  const usage = getTrialUsage(req.user);
  res.locals.trialAccess = usage;

  if (usage.active) {
    return limitErrorResponse(req, res, usage);
  }

  next();
}

export function trialCanRevealContacts(req) {
  const usage = resOrLocalsTrialAccess(req);
  return !usage.active || usage.remaining.contactViews > 0;
}

export function trialRequiresMaskedContacts(req) {
  const usage = resOrLocalsTrialAccess(req);
  return usage.active && usage.remaining.contactViews <= 0;
}

function resOrLocalsTrialAccess(req) {
  return req.res?.locals?.trialAccess || getTrialUsage(req.user);
}

export function isActiveTrialRequest(req) {
  return isTrialUser(req.user) && !getTrialUsage(req.user).expired;
}
