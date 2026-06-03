import jwt from "jsonwebtoken";
import { AuthenticationError } from "./errorHandler.js";
import { query } from "../config/db.js";
import { normalizePlan } from "../utils/planAccess.js";
import { syncUserSubscriptionFromStripe } from "../services/stripeService.js";
import { applyTrialResponse, hydrateTrialAccessUser } from "../utils/trialAccess.js";
import { loadEffectiveTeamUser } from "../utils/teamAccounts.js";
import { isOwnerUser } from "../utils/ownerAccess.js";
import { applyOwnerPreview, readOwnerPreviewCookie } from "../utils/ownerPreview.js";

// Extract token from the httpOnly cookie first, then fall back to Authorization.
function extractToken(req) {
  if (req.cookies && req.cookies.auth_token) {
    return req.cookies.auth_token;
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return null;
}

async function loadUserForRequest(userId) {
  const userResult = await query(
    `SELECT id, plan, lead_state, lead_states, role, subscription_status, subscription_expires_at,
            account_status, frozen_at, frozen_by, frozen_reason,
            trial_ends_at, daily_profile_views, daily_contact_views,
            daily_saved_prospects, last_usage_reset_at,
            monthly_export_rows, monthly_export_reset_at, daily_export_rows, daily_export_reset_at,
            team_owner_user_id, team_member_role
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    return null;
  }

  let user = userResult.rows[0];
  const syncUserId = user.team_owner_user_id || user.id;
  const status = String(user.subscription_status || "").toLowerCase();
  if (!["active", "trialing"].includes(status)) {
    if (syncUserId === user.id) {
      user = await syncUserSubscriptionFromStripe(user.id) || user;
    } else {
      await syncUserSubscriptionFromStripe(syncUserId).catch(() => null);
      const refreshedUser = await query(
        `SELECT id, plan, lead_state, lead_states, role, subscription_status, subscription_expires_at,
                account_status, frozen_at, frozen_by, frozen_reason,
                trial_ends_at, daily_profile_views, daily_contact_views,
                daily_saved_prospects, last_usage_reset_at,
                monthly_export_rows, monthly_export_reset_at, daily_export_rows, daily_export_reset_at,
                team_owner_user_id, team_member_role
         FROM users
         WHERE id = $1`,
        [userId]
      );
      user = refreshedUser.rows[0] || user;
    }
  }

  const normalizedPlan = normalizePlan(user.plan);
  if (user.plan !== normalizedPlan) {
    await query("UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2", [normalizedPlan, user.id]);
    user.plan = normalizedPlan;
  } else {
    user.plan = normalizedPlan;
  }

  let effectiveUser = await loadEffectiveTeamUser(user);
  effectiveUser = await hydrateTrialAccessUser(effectiveUser);

  if (String(effectiveUser.account_status || user.account_status || "").toLowerCase() === "frozen") {
    throw new AuthenticationError("Your account is currently frozen. Please contact support.");
  }

  if (isOwnerUser(user)) {
    effectiveUser = applyOwnerPreview(effectiveUser, readOwnerPreviewCookie(req));
  }

  return effectiveUser;
}

function assignRequestUser(req, res, user) {
  req.user = {
    id: user.id,
    plan: user.plan,
    lead_state: user.lead_state,
    lead_states: user.lead_states,
    role: user.role,
    subscription_status: user.subscription_status,
    subscription_expires_at: user.subscription_expires_at,
    account_status: user.account_status || "active",
    frozen_at: user.frozen_at || null,
    frozen_by: user.frozen_by || null,
    frozen_reason: user.frozen_reason || null,
    trial_ends_at: user.trial_ends_at,
    daily_profile_views: user.daily_profile_views,
    daily_contact_views: user.daily_contact_views,
    daily_saved_prospects: user.daily_saved_prospects,
    last_usage_reset_at: user.last_usage_reset_at,
    monthly_export_rows: user.monthly_export_rows,
    monthly_export_reset_at: user.monthly_export_reset_at,
    daily_export_rows: user.daily_export_rows,
    daily_export_reset_at: user.daily_export_reset_at,
    team_owner_user_id: user.team_owner_user_id,
    team_member_role: user.team_member_role,
    is_team_member: user.is_team_member,
    owner_preview_active: user.owner_preview_active || false,
    owner_preview_plan: user.owner_preview_plan || null,
    owner_preview_lead_state: user.owner_preview_lead_state || null,
    owner_preview_subscription_status: user.owner_preview_subscription_status || null,
    owner_preview_saved_at: user.owner_preview_saved_at || null,
    owner_actual_plan: user.owner_actual_plan || null,
    owner_actual_lead_state: user.owner_actual_lead_state || null,
    owner_actual_subscription_status: user.owner_actual_subscription_status || null,
    owner_actual_subscription_expires_at: user.owner_actual_subscription_expires_at || null
  };
  applyTrialResponse(res, req.user);
}

async function authenticateRequest(req, res, { allowAnonymous = false } = {}) {
  const token = extractToken(req);

  if (!token) {
    if (allowAnonymous) return null;
    if (req.originalUrl?.startsWith("/api/")) {
      throw new AuthenticationError("Missing authentication token");
    }
    return false;
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (allowAnonymous) return null;
    if (err.name === "TokenExpiredError") {
      throw new AuthenticationError("Token has expired");
    }
    throw new AuthenticationError("Invalid token");
  }

  const user = await loadUserForRequest(payload.sub);
  if (!user) {
    if (allowAnonymous) return null;
    throw new AuthenticationError("User not found");
  }

  assignRequestUser(req, res, user);
  return user;
}

export async function authRequired(req, res, next) {
  try {
    const authenticated = await authenticateRequest(req, res);
    if (authenticated === false) {
      return res.redirect("/login.html");
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Middleware to check if user is authenticated (for page protection)
export async function requireAuth(req, res, next) {
  try {
    const authenticated = await authenticateRequest(req, res);
    if (authenticated === false) {
      return res.redirect("/login.html");
    }
    next();
  } catch (err) {
    res.redirect("/login.html");
  }
}

export async function authOptional(req, res, next) {
  try {
    await authenticateRequest(req, res, { allowAnonymous: true });
    next();
  } catch (err) {
    next(err);
  }
}
