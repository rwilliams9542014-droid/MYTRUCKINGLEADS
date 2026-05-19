import { query } from "../config/db.js";
import { normalizePlan } from "./planAccess.js";

function normalizeRole(value) {
  const role = String(value || "").trim().toLowerCase();
  return role === "admin" ? "admin" : "member";
}

function normalizeBaseUser(user = {}) {
  return {
    ...user,
    plan: normalizePlan(user.plan),
    team_owner_user_id: user.team_owner_user_id || null,
    team_member_role: user.team_member_role ? normalizeRole(user.team_member_role) : null
  };
}

export function applyTeamOwnerAccess(user, owner) {
  const normalizedUser = normalizeBaseUser(user);
  if (!owner) return normalizedUser;

  return {
    ...normalizedUser,
    plan: normalizePlan(owner.plan || normalizedUser.plan),
    lead_state: owner.lead_state ?? normalizedUser.lead_state,
    subscription_status: owner.subscription_status ?? normalizedUser.subscription_status,
    subscription_expires_at: owner.subscription_expires_at ?? normalizedUser.subscription_expires_at,
    trial_ends_at: owner.trial_ends_at ?? normalizedUser.trial_ends_at,
    team_owner_name: owner.name || null,
    team_owner_email: owner.email || null,
    is_team_member: true
  };
}

async function loadOwnerAccount(ownerUserId) {
  const result = await query(
    `SELECT id, name, email, plan, lead_state, subscription_status, subscription_expires_at, trial_ends_at
     FROM users
     WHERE id = $1`,
    [ownerUserId]
  );

  return result.rows[0] || null;
}

export async function loadEffectiveTeamUser(user) {
  const normalizedUser = normalizeBaseUser(user);
  if (!normalizedUser.team_owner_user_id) {
    return {
      ...normalizedUser,
      is_team_member: false
    };
  }

  const owner = await loadOwnerAccount(normalizedUser.team_owner_user_id);
  return applyTeamOwnerAccess(normalizedUser, owner);
}
