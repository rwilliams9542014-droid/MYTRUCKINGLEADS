import jwt from "jsonwebtoken";
import { AuthenticationError } from "./errorHandler.js";
import { query } from "../config/db.js";
import { normalizePlan } from "../utils/planAccess.js";
import { syncUserSubscriptionFromStripe } from "../services/stripeService.js";
import { applyTrialResponse, hydrateTrialAccessUser } from "../utils/trialAccess.js";

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
    `SELECT id, plan, lead_state, role, subscription_status, subscription_expires_at,
            trial_ends_at, daily_profile_views, daily_contact_views,
            daily_saved_prospects, last_usage_reset_at,
            monthly_export_rows, monthly_export_reset_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    return null;
  }

  let user = userResult.rows[0];
  const status = String(user.subscription_status || "").toLowerCase();
  if (!["active", "trialing"].includes(status)) {
    user = await syncUserSubscriptionFromStripe(user.id) || user;
  }

  const normalizedPlan = normalizePlan(user.plan);
  if (user.plan !== normalizedPlan) {
    await query("UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2", [normalizedPlan, user.id]);
    user.plan = normalizedPlan;
  } else {
    user.plan = normalizedPlan;
  }

  return hydrateTrialAccessUser(user);
}

function assignRequestUser(req, res, user) {
  req.user = {
    id: user.id,
    plan: user.plan,
    lead_state: user.lead_state,
    role: user.role,
    subscription_status: user.subscription_status,
    subscription_expires_at: user.subscription_expires_at,
    trial_ends_at: user.trial_ends_at,
    daily_profile_views: user.daily_profile_views,
    daily_contact_views: user.daily_contact_views,
    daily_saved_prospects: user.daily_saved_prospects,
    last_usage_reset_at: user.last_usage_reset_at,
    monthly_export_rows: user.monthly_export_rows,
    monthly_export_reset_at: user.monthly_export_reset_at
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
