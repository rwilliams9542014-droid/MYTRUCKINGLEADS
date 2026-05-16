const PLAN_ALIASES = {
  starter: "basic",
  agency: "premium"
};

const RENEWAL_WINDOWS = {
  basic: 30,
  pro: 365,
  premium: 365
};

export const PLAN_DETAILS = {
  basic: {
    name: "Starter",
    price: 79,
    annualPrice: 790,
    trialDays: 3,
    description: "Solo producer plan with one state, new DOT leads, basic renewals, carrier profiles, FMCSA data, basic CRM, limited exports, and 30-day lead history."
  },
  pro: {
    name: "Pro",
    price: 199,
    annualPrice: 1990,
    trialDays: 3,
    description: "Full one-state SaaS workspace with unlimited lead searches, renewal intelligence, FMCSA/SMS, licensing and insurance, CRM pipeline, exports, advanced filters, cargo filters, follow-up tracking, lead freshness, and 90-day lead history."
  },
  premium: {
    name: "Agency Unlimited",
    price: 499,
    annualPrice: 4990,
    trialDays: 3,
    description: "Agency plan with every Pro feature plus multiple users, team CRM, shared pipeline, unlimited exports, future API access, alerts, integrations, and premium support."
  }
};

const USER_LIMITS = {
  basic: 1,
  pro: 1,
  premium: null
};

const LEAD_HISTORY_DAYS = {
  basic: 30,
  pro: 90,
  premium: null
};

const SAVED_LEAD_LIMITS = {
  basic: 50,
  pro: 500,
  premium: null
};

export function normalizePlan(plan) {
  const value = String(plan || "basic").toLowerCase();
  return PLAN_ALIASES[value] || value;
}

export function getUserPlan(user) {
  return normalizePlan(user?.plan);
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
  return ["basic", "pro", "premium"].includes(plan) && hasActiveSubscription(user);
}

export function isPremiumPlan(user) {
  return getUserPlan(user) === "premium" && hasActiveSubscription(user);
}

export function getRenewalWindowDays(user) {
  if (!isPaidPlan(user)) return 0;
  return RENEWAL_WINDOWS[getUserPlan(user)] || 0;
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

  return {
    plan,
    leadState,
    renewalWindowDays,
    planName: PLAN_DETAILS[plan]?.name || "New DOT Leads",
    monthlyPrice: PLAN_DETAILS[plan]?.price || 0,
    annualPrice: PLAN_DETAILS[plan]?.annualPrice || 0,
    trialDays: PLAN_DETAILS[plan]?.trialDays || 0,
    leadHistoryDays: Object.prototype.hasOwnProperty.call(LEAD_HISTORY_DAYS, plan) ? LEAD_HISTORY_DAYS[plan] : 0,
    canUseCrm: isPaidPlan(user),
    canViewContacts: isPaidPlan(user),
    canUseNewVentures: isPaidPlan(user),
    canUseRenewalLeads: isPaidPlan(user),
    canUseAdvancedFilters: ["pro", "premium"].includes(plan) && hasActiveSubscription(user),
    canExportCsv: isPaidPlan(user),
    canUseMarketInsights: isPremiumPlan(user),
    canUseCarrierIntelligenceAssistant: isPremiumPlan(user),
    requiresSingleState: ["basic", "pro"].includes(plan),
    canSearchAllStates: isPremiumPlan(user),
    userLimit: Object.prototype.hasOwnProperty.call(USER_LIMITS, plan) ? USER_LIMITS[plan] : 1,
    savedLeadLimit: Object.prototype.hasOwnProperty.call(SAVED_LEAD_LIMITS, plan) ? SAVED_LEAD_LIMITS[plan] : 0
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
      error: "Upgrade to Agency Unlimited to use service lead tools.",
      access: getPlanAccessSummary(req.user)
    });
    return false;
  }
  return true;
}
