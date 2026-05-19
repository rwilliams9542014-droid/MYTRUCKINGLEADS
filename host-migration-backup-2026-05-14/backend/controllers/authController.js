import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "../config/db.js";
import { createCheckoutSession, syncUserSubscriptionFromStripe } from "../services/stripeService.js";
import { validateEmail, validateLeadState, validatePassword, validatePhone, validatePlan, validateString, validateUsername } from "../utils/validators.js";
import { ValidationError, ConflictError, AuthenticationError } from "../middleware/errorHandler.js";
import { getTrialUsage } from "../utils/trialAccess.js";
import { getPlanAccessSummary } from "../utils/planAccess.js";
import { loadEffectiveTeamUser } from "../utils/teamAccounts.js";

function effectiveSubscriptionStatus(user) {
  if (process.env.LOCAL_DEV_FREE_ACCESS === "true" && process.env.NODE_ENV !== "production") {
    return user.subscription_status || "active";
  }

  return user.subscription_status;
}

function csvEnv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function ownerUsernames() {
  const configured = csvEnv("OWNER_USERNAMES").concat(csvEnv("OWNER_USERNAME"));
  return configured.length ? configured : ["admin"];
}

function isOwnerUser(user) {
  const ownerEmails = csvEnv("OWNER_EMAILS").concat(csvEnv("OWNER_EMAIL"));

  return (
    ownerEmails.includes(String(user.email || "").toLowerCase()) ||
    ownerUsernames().includes(String(user.username || "").toLowerCase())
  );
}

function publicPlan(plan, subscriptionStatus) {
  const normalizedPlan = String(plan || "").toLowerCase();
  if (normalizedPlan === "basic") return "starter";
  if (normalizedPlan === "premium") return "agency";
  if (normalizedPlan === "trial") return "trial";
  if (!normalizedPlan && String(subscriptionStatus || "").toLowerCase() === "trialing") return "trial";
  return normalizedPlan || "starter";
}

function publicUser(user) {
  const trialAccess = getTrialUsage(user);
  const subscriptionStatus = effectiveSubscriptionStatus(user);
  const access = getPlanAccessSummary({
    ...user,
    subscription_status: subscriptionStatus
  });
  return {
    id: user.id,
    name: user.name,
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username,
    email: user.email,
    phone: user.phone,
    businessName: user.business_name,
    leadState: user.lead_state,
    role: user.role,
    isOwner: isOwnerUser(user),
    plan: publicPlan(user.plan, subscriptionStatus),
    stripe_subscription_id: user.stripe_subscription_id,
    subscription_status: subscriptionStatus,
    subscriptionStatus,
    isTeamMember: Boolean(user.is_team_member || user.team_owner_user_id),
    teamOwnerUserId: user.team_owner_user_id || null,
    teamOwnerName: user.team_owner_name || null,
    teamOwnerEmail: user.team_owner_email || null,
    teamMemberRole: user.team_member_role || null,
    subscription_expires_at: user.subscription_expires_at,
    trialEndsAt: user.trial_ends_at || user.subscription_expires_at || null,
    dailyProfileViews: user.daily_profile_views || 0,
    dailyContactViews: user.daily_contact_views || 0,
    dailySavedProspects: user.daily_saved_prospects || 0,
    monthlyExportRows: access.monthlyExportsUsed,
    monthlyExportResetAt: user.monthly_export_reset_at || null,
    monthlyExportLimit: access.monthlyExportLimit,
    monthlyExportsRemaining: access.monthlyExportRemaining,
    canUseTextMessaging: access.canUseTextMessaging,
    lastUsageResetAt: user.last_usage_reset_at || null,
    trialAccess,
    access
  };
}

function setAuthCookie(res, token) {
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("auth_token", token, {
    httpOnly: true,
    secure: isProduction, // Only send over HTTPS in production
    sameSite: isProduction ? "none" : "lax", // Required for cross-site cookies in production
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/"
  });
}

function clearAuthCookie(res) {
  res.clearCookie("auth_token", { path: "/" });
}

export async function signup(req, res, next) {
  try {
    const {
      firstName,
      lastName,
      username,
      email,
      phone,
      businessName,
      billingAddressLine1,
      billingAddressLine2,
      billingCity,
      billingState,
      billingPostalCode,
      billingCountry,
      leadState,
      password,
      plan
    } = req.body;

    // Validate inputs
    const validatedFirstName = validateString(firstName, "First name", 2, 80);
    const validatedLastName = validateString(lastName, "Last name", 2, 80);
    const validatedName = `${validatedFirstName} ${validatedLastName}`;
    const validatedUsername = validateUsername(username);
    const validatedEmail = validateEmail(email);
    const validatedPhone = validatePhone(phone);
    const validatedBusinessName = businessName ? validateString(businessName, "Business name", 2, 140) : null;
    const validatedBillingAddressLine1 = validateString(billingAddressLine1, "Billing address", 3, 180);
    const validatedBillingAddressLine2 = billingAddressLine2 ? validateString(billingAddressLine2, "Billing address line 2", 1, 120) : null;
    const validatedBillingCity = validateString(billingCity, "Billing city", 2, 100);
    const validatedBillingState = validateString(billingState, "Billing state", 2, 80);
    const validatedBillingPostalCode = validateString(billingPostalCode, "Billing ZIP/postal code", 3, 20);
    const validatedBillingCountry = validateString(billingCountry || "US", "Billing country", 2, 80);
    const validatedPassword = validatePassword(password);
    const validatedPlan = validatePlan(plan || "basic");
    const validatedLeadState = ["basic", "starter", "pro"].includes(validatedPlan)
      ? validateLeadState(leadState)
      : (leadState ? validateLeadState(leadState) : null);

    // Check if email or username exists
    const existing = await query(
      "SELECT id, email, username FROM users WHERE email = $1 OR lower(username) = $2",
      [validatedEmail, validatedUsername]
    );
    if (existing.rows.length > 0) {
      const matchedEmail = existing.rows.some(user => user.email === validatedEmail);
      const matchedUsername = existing.rows.some(user => String(user.username || "").toLowerCase() === validatedUsername);
      if (matchedUsername) return next(new ConflictError("Username already in use"));
      if (matchedEmail) return next(new ConflictError("Email already in use"));
      return next(new ConflictError("Account already exists"));
    }

    // Hash password
    const hash = await bcrypt.hash(validatedPassword, 12);

    // Create user
    const result = await query(
      `INSERT INTO users (
         name, first_name, last_name, username, email, phone, business_name,
         billing_address_line1, billing_address_line2, billing_city, billing_state,
         billing_postal_code, billing_country, password_hash, plan,
         lead_state, subscription_status, subscription_expires_at,
         trial_ends_at, daily_profile_views, daily_contact_views,
         daily_saved_prospects, last_usage_reset_at,
         monthly_export_rows, monthly_export_reset_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'incomplete', NULL, NULL, 0, 0, 0, NOW(), 0, NOW())
       RETURNING id, name, first_name, last_name, username, email, phone, business_name, lead_state, role, plan, subscription_status, subscription_expires_at,
                 trial_ends_at, daily_profile_views, daily_contact_views, daily_saved_prospects, last_usage_reset_at,
                 monthly_export_rows, monthly_export_reset_at, created_at`,
      [
        validatedName,
        validatedFirstName,
        validatedLastName,
        validatedUsername,
        validatedEmail,
        validatedPhone,
        validatedBusinessName,
        validatedBillingAddressLine1,
        validatedBillingAddressLine2,
        validatedBillingCity,
        validatedBillingState,
        validatedBillingPostalCode,
        validatedBillingCountry,
        hash,
        validatedPlan,
        validatedLeadState
      ]
    );

    const user = result.rows[0];
    const checkoutSession = await createCheckoutSession({
      plan: validatedPlan,
      customerEmail: validatedEmail,
      userId: user.id,
      billingCycle: "monthly"
    });

    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });

    // Set httpOnly cookie
    setAuthCookie(res, token);

    res.status(201).json({
      user: publicUser(user),
      checkoutUrl: checkoutSession.url,
      checkoutSessionId: checkoutSession.id
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, username, login, identifier, password } = req.body;
    const loginValue = String(username || login || identifier || email || "").trim();

    // Validate inputs
    if (!loginValue) {
      return next(new ValidationError("Username or email is required"));
    }
    if (!password || typeof password !== "string") {
      return next(new ValidationError("Password is required"));
    }

    // Find user
    const isEmailLogin = loginValue.includes("@");
    const loginLookup = isEmailLogin ? validateEmail(loginValue) : validateUsername(loginValue);
    const result = await query(
      `SELECT id, name, first_name, last_name, username, email, phone, business_name, lead_state, role, password_hash,
              plan, stripe_subscription_id, subscription_status, subscription_expires_at,
              trial_ends_at, daily_profile_views, daily_contact_views, daily_saved_prospects, last_usage_reset_at,
              monthly_export_rows, monthly_export_reset_at,
              team_owner_user_id, team_member_role
       FROM users
       WHERE ${isEmailLogin ? "email = $1" : "lower(username) = $1"}`,
      [loginLookup]
    );
    
    if (result.rows.length === 0) {
      return next(new AuthenticationError("Invalid username or password"));
    }

    const user = result.rows[0];
    
    // Verify password
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return next(new AuthenticationError("Invalid username or password"));
    }

    // Generate token
    const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });

    // Set httpOnly cookie
    setAuthCookie(res, token);

    const effectiveUser = await loadEffectiveTeamUser(user);

    res.json({
      user: publicUser(effectiveUser)
    });
    } catch (err) {
    next(err);
  }
}

export async function logout(req, res) {
  clearAuthCookie(res);
  res.json({ message: "Logged out successfully" });
}

export async function getCurrentUser(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const currentStatus = String(req.user.subscription_status || "").toLowerCase();
    if (!["active", "trialing"].includes(currentStatus)) {
      await syncUserSubscriptionFromStripe(req.user.team_owner_user_id || req.user.id);
    }

    const userResult = await query(
      `SELECT id, name, first_name, last_name, username, email, phone, business_name, lead_state, role, plan, stripe_subscription_id, subscription_status, subscription_expires_at,
              trial_ends_at, daily_profile_views, daily_contact_views, daily_saved_prospects, last_usage_reset_at,
              monthly_export_rows, monthly_export_reset_at,
              team_owner_user_id, team_member_role
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const effectiveUser = await loadEffectiveTeamUser(userResult.rows[0]);
    res.json({ user: publicUser(effectiveUser) });
  } catch (err) {
    next(err);
  }
}
