import { query } from "../config/db.js";

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

export async function ownerRequired(req, res, next) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const result = await query(
      `SELECT id, email, username, role
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "User not found" });
    }

    const user = result.rows[0];
    const ownerEmails = csvEnv("OWNER_EMAILS").concat(csvEnv("OWNER_EMAIL"));
    const isOwnerEmail = ownerEmails.includes(String(user.email || "").toLowerCase());
    const isOwnerUsername = ownerUsernames().includes(String(user.username || "").toLowerCase());

    if (!isOwnerEmail && !isOwnerUsername) {
      return res.status(403).json({ error: "Owner access required" });
    }

    req.owner = user;
    next();
  } catch (err) {
    next(err);
  }
}
