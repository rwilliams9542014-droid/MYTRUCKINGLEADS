import { query } from "../config/db.js";
import { ValidationError } from "../middleware/errorHandler.js";
import { PLAN_DETAILS, normalizePlan } from "../utils/planAccess.js";

export const TERMS_VERSION = "2026-06-03";
export const PRIVACY_VERSION = "2026-06-03";
export const SUBSCRIPTION_AGREEMENT_VERSION = "2026-06-03";

export function requireSubscriptionConsent(input = {}) {
  if (
    input.acceptedTerms !== true ||
    input.acceptedPrivacy !== true ||
    input.acceptedSubscriptionAgreement !== true
  ) {
    throw new ValidationError("Subscription agreement acceptance is required.");
  }
}

export function getSubscriptionConsentTerms(planInput, billingCycleInput = "monthly") {
  const planId = normalizePlan(planInput || "basic");
  const billingInterval = String(billingCycleInput || "monthly").toLowerCase() === "annual" ? "annual" : "monthly";
  const plan = PLAN_DETAILS[planId];

  if (!plan) {
    throw new ValidationError("Plan billing details are unavailable. Please try again.");
  }

  const price = billingInterval === "annual" ? plan.annualPrice : plan.price;
  if (!Number.isFinite(Number(price)) || Number(price) <= 0 || !Number.isFinite(Number(plan.trialDays))) {
    throw new ValidationError("Plan billing details are unavailable. Please try again.");
  }

  const trialStartAt = new Date();
  const trialEndAt = new Date(trialStartAt.getTime() + Number(plan.trialDays) * 24 * 60 * 60 * 1000);

  return {
    planId,
    planName: plan.name,
    planPrice: Number(price),
    billingInterval,
    trialDays: Number(plan.trialDays),
    trialStartAt: trialStartAt.toISOString(),
    trialEndAt: trialEndAt.toISOString(),
    firstBillingAt: trialEndAt.toISOString(),
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    subscriptionAgreementVersion: SUBSCRIPTION_AGREEMENT_VERSION
  };
}

export function consentMetadata(consent = {}) {
  return {
    consentId: consent.id ? String(consent.id) : "",
    termsVersion: consent.terms_version || consent.termsVersion || TERMS_VERSION,
    subscriptionAgreementVersion:
      consent.subscription_agreement_version ||
      consent.subscriptionAgreementVersion ||
      SUBSCRIPTION_AGREEMENT_VERSION,
    acceptedAt: consent.accepted_at || consent.acceptedAt || new Date().toISOString(),
    trialDays: String(consent.trial_days ?? consent.trialDays ?? "")
  };
}

export async function recordSubscriptionConsent({
  userId,
  email,
  plan,
  billingCycle = "monthly",
  consent = {},
  req
}) {
  requireSubscriptionConsent(consent);
  const terms = getSubscriptionConsentTerms(plan, billingCycle);
  const acceptedAt = new Date().toISOString();
  const ipAddress =
    req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req?.ip ||
    req?.socket?.remoteAddress ||
    null;
  const userAgent = req?.headers?.["user-agent"] ? String(req.headers["user-agent"]).slice(0, 1000) : null;

  const result = await query(
    `INSERT INTO subscription_consents (
       user_id, email, plan_id, plan_name, plan_price, billing_interval,
       trial_days, trial_start_at, trial_end_at, first_billing_at,
       terms_version, privacy_version, subscription_agreement_version,
       accepted_terms, accepted_privacy, accepted_subscription_agreement,
       accepted_at, ip_address, user_agent, created_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10,
       $11, $12, $13,
       true, true, true,
       $14, $15, $16, NOW()
     )
     RETURNING *`,
    [
      userId,
      String(email || "").trim().toLowerCase(),
      terms.planId,
      terms.planName,
      terms.planPrice,
      terms.billingInterval,
      terms.trialDays,
      terms.trialStartAt,
      terms.trialEndAt,
      terms.firstBillingAt,
      terms.termsVersion,
      terms.privacyVersion,
      terms.subscriptionAgreementVersion,
      acceptedAt,
      ipAddress,
      userAgent
    ]
  );

  return result.rows[0];
}

export async function attachCheckoutSessionToConsent(consentId, checkoutSessionId) {
  if (!consentId || !checkoutSessionId) return null;
  const result = await query(
    `UPDATE subscription_consents
     SET checkout_session_id = $2
     WHERE id = $1
     RETURNING *`,
    [consentId, checkoutSessionId]
  );
  return result.rows[0] || null;
}

export async function attachStripeIdsToConsent({ consentId, userId, stripeCustomerId, stripeSubscriptionId, checkoutSessionId }) {
  const conditions = [];
  const values = [];

  if (consentId) {
    values.push(Number(consentId));
    conditions.push(`id = $${values.length}`);
  } else if (checkoutSessionId) {
    values.push(checkoutSessionId);
    conditions.push(`checkout_session_id = $${values.length}`);
  } else if (userId) {
    values.push(Number(userId));
    conditions.push(`user_id = $${values.length}`);
  }

  if (!conditions.length) return null;

  values.push(stripeCustomerId || null);
  const customerIndex = values.length;
  values.push(stripeSubscriptionId || null);
  const subscriptionIndex = values.length;

  const result = await query(
    `UPDATE subscription_consents
     SET stripe_customer_id = COALESCE($${customerIndex}, stripe_customer_id),
         stripe_subscription_id = COALESCE($${subscriptionIndex}, stripe_subscription_id)
     WHERE ${conditions.join(" AND ")}
     RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

export async function getLatestSubscriptionConsentForUser(userId) {
  const result = await query(
    `SELECT id, user_id, email, plan_id, plan_name, plan_price, billing_interval,
            trial_days, trial_start_at, trial_end_at, first_billing_at,
            terms_version, privacy_version, subscription_agreement_version,
            accepted_terms, accepted_privacy, accepted_subscription_agreement,
            accepted_at, stripe_customer_id, stripe_subscription_id, checkout_session_id,
            created_at
     FROM subscription_consents
     WHERE user_id = $1
     ORDER BY accepted_at DESC
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}
