import { ValidationError } from "../middleware/errorHandler.js";
import { normalizePlan } from "./planAccess.js";
import { normalizeUSStateCode } from "./usStates.js";

export const OWNER_PREVIEW_COOKIE = "owner_preview_access";

const PREVIEW_PLANS = new Set(["basic", "pro", "premium"]);
const PREVIEW_STATUSES = new Set(["active", "trialing", "past_due", "incomplete", "canceled", "unpaid"]);

function toBase64Url(value) {
  return Buffer.from(String(value || ""), "utf8").toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function previewCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  };
}

function previewExpiryForStatus(status) {
  const now = Date.now();
  if (status === "trialing") return new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString();
  if (["active", "past_due", "incomplete"].includes(status)) {
    return new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(now - 24 * 60 * 60 * 1000).toISOString();
}

export function normalizeOwnerPreviewInput(input = {}, fallbackUser = {}) {
  const plan = normalizePlan(input.plan || fallbackUser.plan || "premium");
  if (!PREVIEW_PLANS.has(plan)) {
    throw new ValidationError("Preview plan must be Starter, Pro, or Agency Unlimited.");
  }

  const subscriptionStatus = String(
    input.subscriptionStatus ||
    input.subscription_status ||
    fallbackUser.subscription_status ||
    "active"
  ).trim().toLowerCase();

  if (!PREVIEW_STATUSES.has(subscriptionStatus)) {
    throw new ValidationError("Preview subscription status is not supported.");
  }

  const fallbackLeadState = fallbackUser.lead_state || fallbackUser.leadState || "";
  const normalizedLeadState = normalizeUSStateCode(
    input.leadState ||
    input.lead_state ||
    fallbackLeadState
  );

  if (["basic", "pro"].includes(plan) && !normalizedLeadState) {
    throw new ValidationError("Starter and Pro previews require a valid two-letter lead state.");
  }

  return {
    plan,
    lead_state: plan === "premium" ? (normalizedLeadState || null) : normalizedLeadState,
    subscription_status: subscriptionStatus,
    subscription_expires_at: previewExpiryForStatus(subscriptionStatus),
    trial_ends_at: subscriptionStatus === "trialing" ? previewExpiryForStatus(subscriptionStatus) : null,
    saved_at: new Date().toISOString()
  };
}

export function setOwnerPreviewCookie(res, preview) {
  res.cookie(OWNER_PREVIEW_COOKIE, toBase64Url(JSON.stringify(preview)), previewCookieOptions());
}

export function clearOwnerPreviewCookie(res) {
  res.clearCookie(OWNER_PREVIEW_COOKIE, { path: "/" });
}

export function readOwnerPreviewCookie(req) {
  const raw = req?.cookies?.[OWNER_PREVIEW_COOKIE];
  if (!raw) return null;

  try {
    const parsed = JSON.parse(fromBase64Url(raw));
    if (!parsed || typeof parsed !== "object") return null;

    return normalizeOwnerPreviewInput(parsed, parsed);
  } catch (err) {
    console.warn("Ignoring invalid owner preview cookie:", err.message);
    return null;
  }
}

export function applyOwnerPreview(user = {}, preview = null) {
  if (!preview) return user;

  return {
    ...user,
    plan: preview.plan,
    lead_state: preview.lead_state,
    subscription_status: preview.subscription_status,
    subscription_expires_at: preview.subscription_expires_at,
    trial_ends_at: preview.trial_ends_at,
    owner_preview_active: true,
    owner_preview_plan: preview.plan,
    owner_preview_lead_state: preview.lead_state,
    owner_preview_subscription_status: preview.subscription_status,
    owner_preview_saved_at: preview.saved_at || new Date().toISOString(),
    owner_actual_plan: user.plan,
    owner_actual_lead_state: user.lead_state || null,
    owner_actual_subscription_status: user.subscription_status,
    owner_actual_subscription_expires_at: user.subscription_expires_at || null
  };
}
