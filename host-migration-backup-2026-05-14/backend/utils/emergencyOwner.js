import bcrypt from "bcryptjs";

function configuredLogin() {
  return String(process.env.EMERGENCY_OWNER_LOGIN || process.env.OWNER_EMAIL || process.env.OWNER_USERNAME || "")
    .trim()
    .toLowerCase();
}

function configuredPassword() {
  return String(process.env.EMERGENCY_OWNER_PASSWORD || "").trim();
}

export function emergencyOwnerEnabled() {
  return Boolean(configuredLogin() && configuredPassword() && process.env.JWT_SECRET);
}

export async function verifyEmergencyOwnerLogin(loginValue, password) {
  if (!emergencyOwnerEnabled()) return null;
  const normalizedLogin = String(loginValue || "").trim().toLowerCase();
  if (!normalizedLogin || normalizedLogin !== configuredLogin()) return null;

  const expected = configuredPassword();
  const matches = expected.startsWith("$2")
    ? await bcrypt.compare(String(password || ""), expected)
    : String(password || "") === expected;

  return matches ? emergencyOwnerUser(normalizedLogin) : null;
}

export function emergencyOwnerUser(loginValue = configuredLogin()) {
  const login = String(loginValue || configuredLogin()).trim().toLowerCase();
  const email = login.includes("@") ? login : (process.env.OWNER_EMAIL || login);
  const username = login.includes("@") ? "admin" : login;
  return {
    id: "owner-emergency",
    name: "Owner",
    first_name: "Owner",
    last_name: "",
    username,
    email,
    phone: "",
    business_name: "MyTruckingLeads",
    lead_state: "FL",
    lead_states: ["FL"],
    role: "owner",
    plan: "producer-pro",
    account_status: "active",
    subscription_status: "active",
    subscription_expires_at: null,
    trial_ends_at: null,
    daily_profile_views: 0,
    daily_contact_views: 0,
    daily_saved_prospects: 0,
    last_usage_reset_at: null,
    monthly_export_rows: 0,
    monthly_export_reset_at: null,
    daily_export_rows: 0,
    daily_export_reset_at: null,
    team_owner_user_id: null,
    team_member_role: null
  };
}
