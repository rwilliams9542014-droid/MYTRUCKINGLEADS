import { query } from "../config/db.js";
import { listStripeSignupRecords, syncUserSubscriptionFromStripe } from "../services/stripeService.js";

function toPositiveInt(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function normalizeSearch(value) {
  const text = String(value || "").trim();
  return text ? `%${text.toLowerCase()}%` : null;
}

function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase();
}

function hasAccessForUser(user) {
  const normalizedStatus = String(user.subscription_status || "").toLowerCase();
  if (!["active", "trialing"].includes(normalizedStatus)) return false;
  if (!user.subscription_expires_at) return true;

  const expiresAt = new Date(user.subscription_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function matchesStripeSearch(user, searchText) {
  if (!searchText) return true;

  const haystack = [
    user.name,
    user.email,
    user.username,
    user.business_name,
    user.stripe_subscription_id,
    user.stripe_customer_id
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return haystack.includes(searchText);
}

function createdAtValue(user) {
  const timestamp = Date.parse(user.created_at || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export async function listUsers(req, res, next) {
  try {
    const limit = toPositiveInt(req.query.limit, 100, 250);
    const search = normalizeSearch(req.query.search);
    const searchText = normalizeSearchText(req.query.search);
    const status = String(req.query.status || "").trim().toLowerCase();
    const stripeUsers = await listStripeSignupRecords({ limit, backfillLocalUsers: true });
    const params = [];
    const where = [];

    if (search) {
      params.push(search);
      where.push(
        `(lower(coalesce(name, '')) LIKE $${params.length}
          OR lower(coalesce(email, '')) LIKE $${params.length}
          OR lower(coalesce(username, '')) LIKE $${params.length}
          OR lower(coalesce(business_name, '')) LIKE $${params.length})`
      );
    }

    if (status) {
      params.push(status);
      where.push("lower(coalesce(subscription_status, '')) = $" + params.length);
    }

    params.push(limit);

    const users = await query(
      `SELECT id, name, first_name, last_name, username, email, phone, business_name,
              plan, lead_state, role, stripe_customer_id, stripe_subscription_id,
              subscription_status, subscription_expires_at, created_at, updated_at,
              CASE
                WHEN lower(coalesce(subscription_status, '')) IN ('active', 'trialing')
                  AND (subscription_expires_at IS NULL OR subscription_expires_at > NOW())
                THEN true
                ELSE false
              END AS has_access
       FROM users
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );

    const localUsers = users.rows.map((user) => ({
      ...user,
      is_local_user: true,
      source: "local",
      sync_issue: null
    }));

    const localUserIds = new Set(localUsers.map((user) => String(user.id)));
    const localEmails = new Set(
      localUsers
        .map((user) => String(user.email || "").toLowerCase())
        .filter(Boolean)
    );
    const localSubscriptionIds = new Set(
      localUsers
        .map((user) => String(user.stripe_subscription_id || ""))
        .filter(Boolean)
    );

    const stripeOnlyUsers = stripeUsers.filter((user) => {
      const hasMatchingId = user.id && localUserIds.has(String(user.id));
      const hasMatchingEmail = user.email && localEmails.has(String(user.email).toLowerCase());
      const hasMatchingSubscription =
        user.stripe_subscription_id && localSubscriptionIds.has(String(user.stripe_subscription_id));

      if (hasMatchingId || hasMatchingEmail || hasMatchingSubscription) {
        return false;
      }

      if (status && String(user.subscription_status || "").toLowerCase() !== status) {
        return false;
      }

      return matchesStripeSearch(user, searchText);
    });

    const combinedUsers = [...localUsers, ...stripeOnlyUsers]
      .map((user) => ({
        ...user,
        has_access: typeof user.has_access === "boolean" ? user.has_access : hasAccessForUser(user)
      }))
      .sort((a, b) => createdAtValue(b) - createdAtValue(a))
      .slice(0, limit);

    res.json({ users: combinedUsers });
  } catch (err) {
    next(err);
  }
}

export async function getWebhookHealth(req, res, next) {
  try {
    const [summary, recent, failures] = await Promise.all([
      query(
        `SELECT status, COUNT(*)::int AS count
         FROM stripe_webhook_events
         WHERE processed_at >= NOW() - INTERVAL '7 days'
         GROUP BY status
         ORDER BY status`
      ),
      query(
        `SELECT id, type, status, livemode, message, processed_at, created_at
         FROM stripe_webhook_events
         ORDER BY processed_at DESC
         LIMIT 25`
      ),
      query(
        `SELECT id, type, status, message, processed_at
         FROM stripe_webhook_events
         WHERE status = 'failed'
         ORDER BY processed_at DESC
         LIMIT 10`
      )
    ]);

    res.json({
      summary: summary.rows,
      recent: recent.rows,
      failures: failures.rows
    });
  } catch (err) {
    next(err);
  }
}

export async function syncUserStripe(req, res, next) {
  try {
    const userId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(userId) || userId <= 0) {
      return res.status(400).json({ error: "Valid user id required" });
    }

    await syncUserSubscriptionFromStripe(userId);

    const result = await query(
      `SELECT id, name, username, email, plan, lead_state, role, stripe_customer_id,
              stripe_subscription_id, subscription_status, subscription_expires_at,
              created_at, updated_at
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    next(err);
  }
}
