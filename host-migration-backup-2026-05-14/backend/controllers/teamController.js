import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { query } from "../config/db.js";
import { ValidationError, ConflictError } from "../middleware/errorHandler.js";
import { sendTeamInviteEmail } from "../services/emailService.js";
import { getPlanAccessSummary, hasActiveSubscription, normalizePlan, requirePaidPlan } from "../utils/planAccess.js";
import { loadEffectiveTeamUser } from "../utils/teamAccounts.js";
import { validateEmail, validatePassword, validatePhone, validateString, validateUsername } from "../utils/validators.js";

const INVITE_EXPIRY_DAYS = 7;

function setAuthCookie(res, token) {
  const isProduction = process.env.NODE_ENV === "production";
  res.cookie("auth_token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

function normalizeRole(value) {
  return String(value || "").trim().toLowerCase() === "admin" ? "admin" : "member";
}

function validateInviteToken(token) {
  const normalized = String(token || "").trim();
  if (!/^[a-z0-9_-]{20,255}$/i.test(normalized)) {
    throw new ValidationError("Invalid invitation link");
  }
  return normalized;
}

function getInviteExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + INVITE_EXPIRY_DAYS);
  return date;
}

function getAppBaseUrl(req) {
  const configured = String(process.env.APP_URL || process.env.FRONTEND_URL || "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "https";
  return `${protocol}://${req.get("host")}`;
}

function buildInviteUrl(req, token) {
  return `${getAppBaseUrl(req)}/signup.html?invite=${encodeURIComponent(token)}`;
}

function canOwnerUseTeamLogins(owner) {
  return normalizePlan(owner?.plan) === "premium" && hasActiveSubscription(owner);
}

function requireTeamOwner(req, res) {
  if (req.user?.team_owner_user_id) {
    res.status(403).json({
      error: "Only the subscription owner can manage team logins."
    });
    return false;
  }

  return true;
}

async function getTeamCount(ownerUserId) {
  const result = await query(
    `SELECT COUNT(*)::int AS member_count
     FROM team_members
     WHERE owner_user_id = $1
       AND status IN ('invited', 'active')`,
    [ownerUserId]
  );

  return 1 + (result.rows[0]?.member_count || 0);
}

async function loadOwnerAccount(ownerUserId) {
  const result = await query(
    `SELECT id, name, email, business_name, plan, lead_state, subscription_status,
            subscription_expires_at, trial_ends_at
     FROM users
     WHERE id = $1`,
    [ownerUserId]
  );

  return result.rows[0] || null;
}

async function loadTeamInviteRecord(token) {
  const result = await query(
    `SELECT tm.id, tm.owner_user_id, tm.email, tm.name, tm.role, tm.status, tm.linked_user_id,
            tm.invite_token, tm.invite_expires_at, tm.accepted_at, tm.created_at, tm.updated_at,
            owner.name AS owner_name, owner.email AS owner_email, owner.business_name AS owner_business_name,
            owner.plan AS owner_plan, owner.lead_state AS owner_lead_state,
            owner.subscription_status AS owner_subscription_status,
            owner.subscription_expires_at AS owner_subscription_expires_at,
            owner.trial_ends_at AS owner_trial_ends_at
     FROM team_members tm
     JOIN users owner ON owner.id = tm.owner_user_id
     WHERE tm.invite_token = $1`,
    [token]
  );

  return result.rows[0] || null;
}

function buildInviteResponse(invite) {
  const owner = {
    plan: invite.owner_plan,
    subscription_status: invite.owner_subscription_status
  };
  const access = getPlanAccessSummary(owner);

  return {
    token: invite.invite_token,
    email: invite.email,
    name: invite.name,
    role: normalizeRole(invite.role),
    status: invite.status,
    plan: normalizePlan(invite.owner_plan),
    expiresAt: invite.invite_expires_at,
    ownerName: invite.owner_name,
    ownerEmail: invite.owner_email,
    agencyName: invite.owner_business_name || invite.owner_name,
    planName: access.planName
  };
}

function ensureInviteIsUsable(invite) {
  if (!invite) {
    throw new ValidationError("This invitation is no longer available.");
  }

  if (invite.status !== "invited") {
    throw new ConflictError("This invitation has already been used.");
  }

  if (invite.invite_expires_at && new Date(invite.invite_expires_at).getTime() <= Date.now()) {
    throw new ValidationError("This invitation has expired. Ask the account owner to send a new one.");
  }

  if (!canOwnerUseTeamLogins({
    plan: invite.owner_plan,
    subscription_status: invite.owner_subscription_status
  })) {
    throw new ValidationError("This invitation is no longer valid because the Agency Unlimited plan is not active.");
  }
}

export async function getTeamMembers(req, res, next) {
  try {
    if (!requirePaidPlan(req, res)) return;
    if (!requireTeamOwner(req, res)) return;

    const result = await query(
      `SELECT id, email, name, role, status, created_at
       FROM team_members
       WHERE owner_user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({
      access: getPlanAccessSummary(req.user),
      usedLogins: await getTeamCount(req.user.id),
      members: result.rows
    });
  } catch (err) {
    next(err);
  }
}

export async function inviteTeamMember(req, res, next) {
  try {
    if (!requirePaidPlan(req, res)) return;
    if (!requireTeamOwner(req, res)) return;

    const access = getPlanAccessSummary(req.user);
    if (access.userLimit !== null) {
      return res.status(403).json({
        error: "Upgrade to Agency Unlimited to add team logins.",
        access,
        usedLogins: await getTeamCount(req.user.id)
      });
    }

    const email = validateEmail(req.body.email);
    const name = req.body.name ? validateString(req.body.name, "Name", 2, 100) : null;
    const role = normalizeRole(req.body.role);

    if (email === String(req.user.email || "").toLowerCase()) {
      return next(new ValidationError("Use a different email address for invited team logins."));
    }

    const existingMember = await query(
      `SELECT id, status, linked_user_id
       FROM team_members
       WHERE owner_user_id = $1 AND email = $2`,
      [req.user.id, email]
    );

    if (existingMember.rows[0]?.status === "active" && existingMember.rows[0]?.linked_user_id) {
      return next(new ConflictError("That team member already has an active login."));
    }

    const existingUser = await query(
      `SELECT id
       FROM users
       WHERE email = $1`,
      [email]
    );

    if (existingUser.rows.length > 0) {
      return next(new ConflictError("An account already exists with that email address."));
    }

    const token = crypto.randomBytes(24).toString("base64url");
    const expiresAt = getInviteExpiryDate();

    const result = await query(
      `INSERT INTO team_members (
         owner_user_id, email, name, role, status,
         invite_token, invite_expires_at, linked_user_id, accepted_at
       )
       VALUES ($1, $2, $3, $4, 'invited', $5, $6, NULL, NULL)
       ON CONFLICT (owner_user_id, email)
       DO UPDATE SET name = EXCLUDED.name,
                     role = EXCLUDED.role,
                     status = 'invited',
                     invite_token = EXCLUDED.invite_token,
                     invite_expires_at = EXCLUDED.invite_expires_at,
                     linked_user_id = NULL,
                     accepted_at = NULL,
                     updated_at = NOW()
       RETURNING id, email, name, role, status, created_at, invite_token, invite_expires_at`,
      [req.user.id, email, name, role, token, expiresAt.toISOString()]
    );

    const member = result.rows[0];
    const owner = await loadOwnerAccount(req.user.id);
    const inviteUrl = buildInviteUrl(req, token);
    const ownerAccess = getPlanAccessSummary(owner || req.user);
    const emailSent = await sendTeamInviteEmail({
      toEmail: email,
      inviteeName: name,
      ownerName: owner?.name || req.user.name,
      agencyName: owner?.business_name || owner?.name || req.user.name,
      planName: ownerAccess.planName,
      inviteUrl,
      expiresAt
    });

    const payload = {
      member,
      access,
      usedLogins: await getTeamCount(req.user.id),
      inviteUrl,
      emailSent
    };

    if (!emailSent) {
      return res.status(202).json({
        ...payload,
        warning: "Invite created, but the email could not be sent. Share the invite link directly while email delivery is being checked."
      });
    }

    res.status(201).json({
      ...payload,
      message: "Invitation email sent."
    });
  } catch (err) {
    next(err);
  }
}

export async function getTeamInvite(req, res, next) {
  try {
    const token = validateInviteToken(req.params.token);
    const invite = await loadTeamInviteRecord(token);
    ensureInviteIsUsable(invite);

    res.json({
      invite: buildInviteResponse(invite)
    });
  } catch (err) {
    next(err);
  }
}

export async function acceptTeamInvite(req, res, next) {
  try {
    const token = validateInviteToken(req.body.token);
    const invite = await loadTeamInviteRecord(token);
    ensureInviteIsUsable(invite);

    const firstName = validateString(req.body.firstName, "First name", 2, 80);
    const lastName = validateString(req.body.lastName, "Last name", 2, 80);
    const username = validateUsername(req.body.username);
    const password = validatePassword(req.body.password);
    const phone = validatePhone(req.body.phone);
    const email = validateEmail(req.body.email);

    if (email !== invite.email) {
      return next(new ValidationError("This invitation must be accepted with the invited email address."));
    }

    const existing = await query(
      `SELECT id, email, username
       FROM users
       WHERE email = $1 OR lower(username) = $2`,
      [email, username]
    );

    if (existing.rows.some((user) => user.email === email)) {
      return next(new ConflictError("An account already exists with that email address."));
    }
    if (existing.rows.some((user) => String(user.username || "").toLowerCase() === username)) {
      return next(new ConflictError("Username already in use"));
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const fullName = `${firstName} ${lastName}`;
    let createdUser = null;

    try {
      const createdUserResult = await query(
        `INSERT INTO users (
           name, first_name, last_name, username, email, phone, business_name,
           password_hash, plan, lead_state, subscription_status, subscription_expires_at,
           trial_ends_at, team_owner_user_id, team_member_role, role,
           daily_profile_views, daily_contact_views, daily_saved_prospects,
           monthly_export_rows, monthly_export_reset_at, last_usage_reset_at
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12,
           $13, $14, $15, 'member',
           0, 0, 0,
           0, NOW(), NOW()
         )
         RETURNING id, name, first_name, last_name, username, email, phone, business_name,
                   lead_state, role, plan, subscription_status, subscription_expires_at,
                   trial_ends_at, daily_profile_views, daily_contact_views, daily_saved_prospects,
                   last_usage_reset_at, monthly_export_rows, monthly_export_reset_at,
                   team_owner_user_id, team_member_role`,
        [
          fullName,
          firstName,
          lastName,
          username,
          email,
          phone,
          invite.owner_business_name || null,
          passwordHash,
          normalizePlan(invite.owner_plan),
          invite.owner_lead_state || null,
          invite.owner_subscription_status,
          invite.owner_subscription_expires_at,
          invite.owner_trial_ends_at,
          invite.owner_user_id,
          normalizeRole(invite.role)
        ]
      );

      createdUser = createdUserResult.rows[0];

      const updateInviteResult = await query(
        `UPDATE team_members
         SET linked_user_id = $1,
             status = 'active',
             accepted_at = NOW(),
             invite_token = NULL,
             invite_expires_at = NULL,
             updated_at = NOW()
         WHERE id = $2
           AND owner_user_id = $3
           AND invite_token = $4
           AND status = 'invited'
         RETURNING id`,
        [createdUser.id, invite.id, invite.owner_user_id, token]
      );

      if (updateInviteResult.rows.length === 0) {
        await query("DELETE FROM users WHERE id = $1", [createdUser.id]).catch(() => {});
        return next(new ConflictError("This invitation was already used. Ask the account owner to send a new one."));
      }
    } catch (err) {
      if (createdUser?.id) {
        await query("DELETE FROM users WHERE id = $1", [createdUser.id]).catch(() => {});
      }
      throw err;
    }

    const effectiveUser = await loadEffectiveTeamUser(createdUser);
    const access = getPlanAccessSummary({
      ...effectiveUser,
      subscription_status: effectiveUser.subscription_status
    });
    const authToken = jwt.sign({ sub: createdUser.id }, process.env.JWT_SECRET, {
      expiresIn: "7d"
    });

    setAuthCookie(res, authToken);

    res.status(201).json({
      message: "Team login created successfully.",
      user: {
        id: effectiveUser.id,
        name: effectiveUser.name,
        firstName: effectiveUser.first_name,
        lastName: effectiveUser.last_name,
        username: effectiveUser.username,
        email: effectiveUser.email,
        phone: effectiveUser.phone,
        businessName: effectiveUser.business_name,
        leadState: effectiveUser.lead_state,
        role: effectiveUser.role,
        plan: normalizePlan(effectiveUser.plan) === "premium" ? "agency" : normalizePlan(effectiveUser.plan),
        subscription_status: effectiveUser.subscription_status,
        subscriptionStatus: effectiveUser.subscription_status,
        isTeamMember: true,
        teamOwnerUserId: effectiveUser.team_owner_user_id || null,
        teamOwnerName: effectiveUser.team_owner_name || null,
        teamOwnerEmail: effectiveUser.team_owner_email || null,
        teamMemberRole: effectiveUser.team_member_role || null,
        subscription_expires_at: effectiveUser.subscription_expires_at,
        trialEndsAt: effectiveUser.trial_ends_at || effectiveUser.subscription_expires_at || null,
        monthlyExportRows: access.monthlyExportsUsed,
        monthlyExportLimit: access.monthlyExportLimit,
        monthlyExportsRemaining: access.monthlyExportRemaining,
        canUseTextMessaging: access.canUseTextMessaging,
        access
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function removeTeamMember(req, res, next) {
  try {
    if (!requirePaidPlan(req, res)) return;
    if (!requireTeamOwner(req, res)) return;

    const existing = await query(
      `SELECT id, linked_user_id
       FROM team_members
       WHERE id = $1 AND owner_user_id = $2`,
      [req.params.id, req.user.id]
    );

    if (existing.rows.length === 0) {
      return next(new ValidationError("Team member not found"));
    }

    const linkedUserId = existing.rows[0].linked_user_id;
    if (linkedUserId) {
      await query(
        `UPDATE users
         SET team_owner_user_id = NULL,
             team_member_role = NULL,
             subscription_status = 'inactive',
             subscription_expires_at = NULL,
             trial_ends_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [linkedUserId]
      );
    }

    await query(
      `DELETE FROM team_members
       WHERE id = $1 AND owner_user_id = $2`,
      [req.params.id, req.user.id]
    );

    res.json({
      success: true,
      access: getPlanAccessSummary(req.user),
      usedLogins: await getTeamCount(req.user.id)
    });
  } catch (err) {
    next(err);
  }
}
