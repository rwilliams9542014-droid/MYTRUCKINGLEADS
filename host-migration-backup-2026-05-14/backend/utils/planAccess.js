const PLAN_ALIASES = {
  basic: "pro",
  starter: "pro",
  agency: "pro",
  premium: "pro",
  growth: "pro",
  professional: "pro"
};

const RENEWAL_WINDOWS = {
  pro: 60
};

const MONTHLY_EXPORT_LIMITS = {
  pro: null
};

const DAILY_EXPORT_LIMITS = {
  pro: null
};

export const PLAN_DETAILS = {
  pro: {
    name: "Producer Pro",
    price: 149.99,
    annualPrice: 1499.90,
    trialDays: 3,
    description: "Simple trucking lead workspace with one included state, renewal opportunities up to 60 days out, New DOT lead history up to 30 days back, carrier intelligence, CRM, and CSV exports. Additional states are $49.99/month each and additional users are $19.99/month each."
  }
};

const USER_LIMITS = {
  pro: 1
};

const LEAD_HISTORY_DAYS = {
  pro: 30
};

const SAVED_LEAD_LIMITS = {
  pro: null
};

const MARKETPLACE_FREE_LEAD_CREDITS = {
  pro: 0
};

const MARKETPLACE_LEAD_PRICING = {
  pro: { Bronze: 20, Silver: 40, Gold: "75-100" }
};

const MONTHLY_EMAIL_LIMITS = {
  pro: 500
};

const MONTHLY_SMS_LIMITS = {
  pro: 250
};

const TRIAL_RENEWAL_WINDOW_DAYS = 15;
const TRIAL_LEAD_HISTORY_DAYS = 15;
const TRIAL_DAILY_EXPORT_LIMIT = 10;

export function normalizePlan(plan) {
  const value = String(plan || "pro").toLowerCase();
  return PLAN_ALIASES[value] || value;
}

export function getUserPlan(user) {
  return normalizePlan(user?.plan);
}

function monthKey(dateLike) {
  const parsed = new Date(dateLike || Date.now());
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}`;
}

function dayKey(dateLike) {
  const parsed = new Date(dateLike || Date.now());
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

export function hasActiveSubscription(user) {
  const status = String(user?.subscription_status || "").toLowerCase();
  if (process.env.LOCAL_DEV_FREE_ACCESS === "true" && process.env.NODE_ENV !== "production") {
    return true;
  }
  return ["active", "trialing"].includes(status);
}

export function isPaidPlan(user) {
  const plan = getUserPlan(user);
  return plan === "pro" && hasActiveSubscription(user);
}

export function isPremiumPlan(user) {
  return false;
}

export function isActiveTrial(user = {}) {
  return String(user?.subscription_status || user?.subscriptionStatus || "").toLowerCase() === "trialing";
}

export function canUseTextMessaging(user) {
  return false;
}

export function canSendEmail(user) {
  return getUserPlan(user) === "pro" && hasActiveSubscription(user);
}

export function canSendSms(user) {
  return false;
}

export function canUseBulkMessaging(user) {
  return false;
}

export function getMonthlyEmailLimit(user) {
  const plan = getUserPlan(user);
  return Object.prototype.hasOwnProperty.call(MONTHLY_EMAIL_LIMITS, plan) ? MONTHLY_EMAIL_LIMITS[plan] : 0;
}

export function getMonthlySmsLimit(user) {
  const plan = getUserPlan(user);
  return Object.prototype.hasOwnProperty.call(MONTHLY_SMS_LIMITS, plan) ? MONTHLY_SMS_LIMITS[plan] : 0;
}

export function getMonthlyExportLimit(user) {
  if (isActiveTrial(user)) return null;
  const plan = getUserPlan(user);
  return Object.prototype.hasOwnProperty.call(MONTHLY_EXPORT_LIMITS, plan)
    ? MONTHLY_EXPORT_LIMITS[plan]
    : 0;
}

export function getDailyExportLimit(user) {
  if (isActiveTrial(user)) return TRIAL_DAILY_EXPORT_LIMIT;
  const plan = getUserPlan(user);
  return Object.prototype.hasOwnProperty.call(DAILY_EXPORT_LIMITS, plan)
    ? DAILY_EXPORT_LIMITS[plan]
    : 0;
}

export function getMonthlyExportUsage(user, now = new Date()) {
  const limit = getMonthlyExportLimit(user);
  const rawUsed = Number.parseInt(user?.monthly_export_rows ?? user?.monthlyExportRows ?? 0, 10);
  const rawResetAt = user?.monthly_export_reset_at ?? user?.monthlyExportResetAt ?? null;
  const usedThisMonth = monthKey(rawResetAt) === monthKey(now)
    ? Math.max(0, Number.isFinite(rawUsed) ? rawUsed : 0)
    : 0;

  return {
    used: usedThisMonth,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - usedThisMonth),
    resetAt: rawResetAt,
    unlimited: limit === null
  };
}

export function getDailyExportUsage(user, now = new Date()) {
  const limit = getDailyExportLimit(user);
  const rawUsed = Number.parseInt(user?.daily_export_rows ?? user?.dailyExportRows ?? 0, 10);
  const rawResetAt = user?.daily_export_reset_at ?? user?.dailyExportResetAt ?? null;
  const usedToday = dayKey(rawResetAt) === dayKey(now)
    ? Math.max(0, Number.isFinite(rawUsed) ? rawUsed : 0)
    : 0;

  return {
    used: usedToday,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - usedToday),
    resetAt: rawResetAt,
    unlimited: limit === null
  };
}

export function getRenewalWindowDays(user) {
  if (!isPaidPlan(user)) return 0;
  if (isActiveTrial(user)) return TRIAL_RENEWAL_WINDOW_DAYS;
  return RENEWAL_WINDOWS[getUserPlan(user)] || 0;
}

export function getLeadHistoryDays(user) {
  if (!isPaidPlan(user)) return 0;
  if (isActiveTrial(user)) return TRIAL_LEAD_HISTORY_DAYS;
  const plan = getUserPlan(user);
  return Object.prototype.hasOwnProperty.call(LEAD_HISTORY_DAYS, plan) ? LEAD_HISTORY_DAYS[plan] : 0;
}

export function getRenewalWindowEndDate(user) {
  const days = getRenewalWindowDays(user);
  if (!days) return null;

  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getPlanAccessSummary(user) {
  const plan = getUserPlan(user);
  const renewalWindowDays = getRenewalWindowDays(user);
  const leadState = String(user?.lead_state || user?.leadState || "").toUpperCase() || null;
  const rawLeadStates = user?.lead_states || user?.leadStates || [];
  const leadStates = Array.isArray(rawLeadStates)
    ? rawLeadStates.map((state) => String(state || "").toUpperCase()).filter(Boolean)
    : String(rawLeadStates || "").split(",").map((state) => state.trim().toUpperCase()).filter(Boolean);
  const exportUsage = getMonthlyExportUsage(user);
  const dailyExportUsage = getDailyExportUsage(user);
  const subscriptionActive = hasActiveSubscription(user);

  return {
    plan,
    leadState,
    leadStates,
    renewalWindowDays,
    planName: PLAN_DETAILS[plan]?.name || "Producer Pro",
    monthlyPrice: PLAN_DETAILS[plan]?.price || 0,
    annualPrice: PLAN_DETAILS[plan]?.annualPrice || 0,
    trialDays: PLAN_DETAILS[plan]?.trialDays || 0,
    leadHistoryDays: getLeadHistoryDays(user),
    canUseCrm: isPaidPlan(user),
    canViewContacts: isPaidPlan(user),
    canUseTextMessaging: canUseTextMessaging(user),
    canSendEmail: canSendEmail(user),
    canSendSms: canSendSms(user),
    bulkEmailAllowed: canSendEmail(user),
    bulkSmsAllowed: canUseBulkMessaging(user),
    monthlyEmailLimit: getMonthlyEmailLimit(user),
    monthlySmsLimit: getMonthlySmsLimit(user),
    canUseNewVentures: isPaidPlan(user),
    canUseRenewalLeads: isPaidPlan(user),
    canUseAdvancedFilters: plan === "pro" && hasActiveSubscription(user),
    canExportCsv: isPaidPlan(user),
    monthlyExportLimit: exportUsage.limit,
    monthlyExportsUsed: exportUsage.used,
    monthlyExportRemaining: exportUsage.remaining,
    dailyExportLimit: dailyExportUsage.limit,
    dailyExportsUsed: dailyExportUsage.used,
    dailyExportRemaining: dailyExportUsage.remaining,
    canUseMarketInsights: false,
    canUseCarrierIntelligenceAssistant: false,
    requiresSingleState: false,
    canSearchAllStates: false,
    userLimit: Object.prototype.hasOwnProperty.call(USER_LIMITS, plan) ? USER_LIMITS[plan] : 1,
    savedLeadLimit: Object.prototype.hasOwnProperty.call(SAVED_LEAD_LIMITS, plan) ? SAVED_LEAD_LIMITS[plan] : 0,
    canAccessLeadMarketplace: isPaidPlan(user),
    canPurchaseMarketplaceLeads: isPaidPlan(user),
    marketplaceFreeLeadCreditsPerMonth: MARKETPLACE_FREE_LEAD_CREDITS[plan] ?? 0,
    marketplaceLeadPricing: MARKETPLACE_LEAD_PRICING[plan] || MARKETPLACE_LEAD_PRICING.pro,
    receivesPriorityLeadNotifications: plan === "pro" && subscriptionActive,
    receivesEliteGoldLeadAlerts: false,
    additionalStatePrice: 49.99,
    additionalUserPrice: 19.99
  };
}

export function requirePaidPlan(req, res) {
  if (!isPaidPlan(req.user)) {
    res.status(403).json({
      error: "Choose a lead plan to use trucking lead tools.",
      access: getPlanAccessSummary(req.user)
    });
    return false;
  }
  return true;
}

export function requirePremiumPlan(req, res) {
  if (!isPremiumPlan(req.user)) {
    res.status(403).json({
      error: "This feature is not included in the current Producer Pro workspace.",
      access: getPlanAccessSummary(req.user)
    });
    return false;
  }
  return true;
}
