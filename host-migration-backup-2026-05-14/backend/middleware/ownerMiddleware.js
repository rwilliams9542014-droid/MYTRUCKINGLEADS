import { query } from "../config/db.js";
import { isOwnerUser } from "../utils/ownerAccess.js";

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
    if (!isOwnerUser(user)) {
      return res.status(403).json({ error: "Owner access required" });
    }

    req.owner = user;
    next();
  } catch (err) {
    next(err);
  }
}
