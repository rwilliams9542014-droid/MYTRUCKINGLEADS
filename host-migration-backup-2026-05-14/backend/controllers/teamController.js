import { query } from "../config/db.js";
import { ValidationError } from "../middleware/errorHandler.js";
import { validateEmail, validateString } from "../utils/validators.js";
import { getPlanAccessSummary, requirePaidPlan } from "../utils/planAccess.js";

async function getTeamCount(ownerUserId) {
  const result = await query(
    `SELECT COUNT(*)::int AS member_count
     FROM team_members
     WHERE owner_user_id = $1
       AND status IN ('invited', 'active')`,
    [ownerUserId]
  );

  // The subscription owner counts as one login.
  return 1 + (result.rows[0]?.member_count || 0);
}

export async function getTeamMembers(req, res, next) {
  try {
    if (!requirePaidPlan(req, res)) return;

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

    const access = getPlanAccessSummary(req.user);
    const currentCount = await getTeamCount(req.user.id);

    if (access.userLimit !== null && currentCount >= access.userLimit) {
      return res.status(403).json({
        error: `Your ${access.plan} plan allows ${access.userLimit} login${access.userLimit === 1 ? "" : "s"}. Upgrade to add more users.`,
        access,
        usedLogins: currentCount
      });
    }

    const email = validateEmail(req.body.email);
    const name = req.body.name ? validateString(req.body.name, "Name", 2, 100) : null;
    const role = req.body.role === "admin" ? "admin" : "member";

    const result = await query(
      `INSERT INTO team_members (owner_user_id, email, name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (owner_user_id, email)
       DO UPDATE SET name = EXCLUDED.name,
                     role = EXCLUDED.role,
                     status = 'invited',
                     updated_at = NOW()
       RETURNING id, email, name, role, status, created_at`,
      [req.user.id, email, name, role]
    );

    res.status(201).json({
      member: result.rows[0],
      access,
      usedLogins: await getTeamCount(req.user.id)
    });
  } catch (err) {
    next(err);
  }
}

export async function removeTeamMember(req, res, next) {
  try {
    if (!requirePaidPlan(req, res)) return;

    const result = await query(
      `DELETE FROM team_members
       WHERE id = $1 AND owner_user_id = $2
       RETURNING id`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return next(new ValidationError("Team member not found"));
    }

    res.json({
      success: true,
      access: getPlanAccessSummary(req.user),
      usedLogins: await getTeamCount(req.user.id)
    });
  } catch (err) {
    next(err);
  }
}
