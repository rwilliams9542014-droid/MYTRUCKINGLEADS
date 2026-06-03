import { query } from "../config/db.js";

export const TRIAL_LIMIT_MESSAGE = "Free trial limit reached. Upgrade to unlock unlimited searches, exports, full carrier profiles, and CRM access.";

export const TRIAL_LIMITS = {
  searchResults: 25,
  profileViewsPerDay: 10,
  contactViewsPerDay: 3,
  savedProspectsPerDay: 5
};

const TRIAL_TIME_ZONE = process.env.TRIAL_USAGE_TIMEZONE || "America/New_York";

const USAGE_COLUMNS = {
  profile: "daily_profile_views",
  contact: "daily_contact_views",
  saved: "daily_saved_prospects"
};

const USER_ACCESS_FIELDS = `
  id,
  plan,
  lead_state,
  role,
  subscription_status,
  subscription_expires_at,
  account_status,
  frozen_at,
  frozen_by,
  frozen_reason,
  trial_ends_at,
  daily_profile_views,
  daily_contact_views,
  daily_saved_prospects,
  last_usage_reset_at
`;

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function usageDayKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TRIAL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(toDate(value) || new Date());
}

export function trialEndsAtForUser(user = {}) {
  return user.trial_ends_at || user.trialEndsAt || user.subscription_expires_at || null;
}

export function isTrialUser(user = {}) {
  const plan = String(user.plan || "").toLowerCase();
  const status = String(user.subscription_status || user.subscriptionStatus || "").toLowerCase();
  return plan === "trial" || status === "trialing";
}

export function isTrialExpired(user = {}) {
  if (!isTrialUser(user)) return false;
  const trialEndsAt = trialEndsAtForUser(user);
  const endsAt = toDate(trialEndsAt);
  return Boolean(endsAt && endsAt.getTime() <= Date.now());
}

export function getTrialUsage(user = {}) {
  const active = isTrialUser(user) && !isTrialExpired(user);
  const dailyProfileViews = toNumber(user.daily_profile_views ?? user.dailyProfileViews);
  const dailyContactViews = toNumber(user.daily_contact_views ?? user.dailyContactViews);
  const dailySavedProspects = toNumber(user.daily_saved_prospects ?? user.dailySavedProspects);

  const remaining = {
    profileViews: Math.max(TRIAL_LIMITS.profileViewsPerDay - dailyProfileViews, 0),
    contactViews: Math.max(TRIAL_LIMITS.contactViewsPerDay - dailyContactViews, 0),
    savedProspects: Math.max(TRIAL_LIMITS.savedProspectsPerDay - dailySavedProspects, 0)
  };

  return {
    active,
    expired: isTrialExpired(user),
    timeZone: TRIAL_TIME_ZONE,
    trialEndsAt: trialEndsAtForUser(user),
    limits: {
      searchResults: TRIAL_LIMITS.searchResults,
      profileViewsPerDay: TRIAL_LIMITS.profileViewsPerDay,
      contactViewsPerDay: TRIAL_LIMITS.contactViewsPerDay,
      savedProspectsPerDay: TRIAL_LIMITS.savedProspectsPerDay,
      csvExportAllowed: !active,
      unlimitedResultsAllowed: !active
    },
    usage: {
      dailyProfileViews,
      dailyContactViews,
      dailySavedProspects
    },
    remaining,
    message:
      remaining.profileViews <= 0 ||
      remaining.contactViews <= 0 ||
      remaining.savedProspects <= 0
        ? TRIAL_LIMIT_MESSAGE
        : ""
  };
}

export function applyTrialResponse(res, user = {}) {
  res.locals.trialAccess = getTrialUsage(user);
  return res.locals.trialAccess;
}

export async function expireTrialIfNeeded(user = {}) {
  if (!isTrialExpired(user)) return user;

  const result = await query(
    `UPDATE users
     SET subscription_status = 'expired',
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${USER_ACCESS_FIELDS}`,
    [user.id]
  );

  return result.rows[0] || { ...user, subscription_status: "expired" };
}

export async function resetTrialUsageIfNeeded(user = {}) {
  const lastResetAt = user.last_usage_reset_at || user.lastUsageResetAt;
  if (!lastResetAt || usageDayKey(lastResetAt) === usageDayKey()) return user;

  const result = await query(
    `UPDATE users
     SET daily_profile_views = 0,
         daily_contact_views = 0,
         daily_saved_prospects = 0,
         last_usage_reset_at = NOW(),
         updated_at = NOW()
     WHERE id = $1
     RETURNING ${USER_ACCESS_FIELDS}`,
    [user.id]
  );

  return result.rows[0] || {
    ...user,
    daily_profile_views: 0,
    daily_contact_views: 0,
    daily_saved_prospects: 0,
    last_usage_reset_at: new Date().toISOString()
  };
}

export async function hydrateTrialAccessUser(user = {}) {
  let hydrated = await expireTrialIfNeeded(user);
  hydrated = await resetTrialUsageIfNeeded(hydrated);
  return hydrated;
}

export async function incrementTrialUsage(userId, kind, amount = 1) {
  const column = USAGE_COLUMNS[kind];
  if (!column) throw new Error(`Unknown trial usage counter: ${kind}`);

  const result = await query(
    `UPDATE users
     SET ${column} = COALESCE(${column}, 0) + $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING ${USER_ACCESS_FIELDS}`,
    [amount, userId]
  );

  return result.rows[0] || null;
}

export function maskTrialCarrierContacts(carrier = {}, { hiddenLabel = "Upgrade to reveal" } = {}) {
  if (!carrier || typeof carrier !== "object") return carrier;

  const maskedCarrier = {
    ...carrier,
    phoneNumber: "",
    cellPhone: "",
    email: "",
    website: carrier.website || "",
    contactMasked: true,
    contactLockedReason: TRIAL_LIMIT_MESSAGE,
    contactRevealLabel: hiddenLabel
  };

  if (carrier.contactInfo && typeof carrier.contactInfo === "object") {
    maskedCarrier.contactInfo = {
      ...carrier.contactInfo,
      phone: "",
      cellPhone: "",
      email: "",
      contactMasked: true,
      contactLockedReason: TRIAL_LIMIT_MESSAGE
    };
  }

  return maskedCarrier;
}

export function maskTrialLeadContacts(lead = {}, { hiddenLabel = "Upgrade to reveal" } = {}) {
  return {
    ...lead,
    phone: "",
    email: "",
    phoneNumber: "",
    contactMasked: true,
    contactRevealLabel: hiddenLabel
  };
}
