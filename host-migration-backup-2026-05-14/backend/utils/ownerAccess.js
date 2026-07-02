function csvEnv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function ownerUsernames() {
  const configured = csvEnv("OWNER_USERNAMES").concat(csvEnv("OWNER_USERNAME"));
  return configured.length ? configured : ["admin"];
}

export function ownerEmails() {
  return csvEnv("OWNER_EMAILS").concat(csvEnv("OWNER_EMAIL"));
}

export function isOwnerUser(user = {}) {
  const role = String(user.role || "").toLowerCase();
  return (
    ["admin", "super_admin", "superadmin", "owner_admin", "platform_owner"].includes(role) ||
    ownerEmails().includes(String(user.email || "").toLowerCase()) ||
    ownerUsernames().includes(String(user.username || "").toLowerCase())
  );
}
