import { query } from "../config/db.js";
import { ValidationError } from "../middleware/errorHandler.js";
import { normalizePlan } from "../utils/planAccess.js";
import {
  clearOwnerPreviewCookie,
  normalizeOwnerPreviewInput,
  setOwnerPreviewCookie
} from "../utils/ownerPreview.js";
import { listStripeSignupRecords, syncUserSubscriptionFromStripe } from "../services/stripeService.js";

const CONTACT_REQUEST_STATUSES = new Set(["new", "reviewed", "resolved"]);

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

function normalizedPlanCase(columnName = "plan") {
  return `CASE
    WHEN lower(coalesce(${columnName}, '')) = 'starter' THEN 'basic'
    WHEN lower(coalesce(${columnName}, '')) = 'agency' THEN 'premium'
    WHEN lower(coalesce(${columnName}, '')) = '' THEN 'basic'
    ELSE lower(coalesce(${columnName}, 'basic'))
  END`;
}

function normalizePlanFilter(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text || text === "all") return "";
  const plan = normalizePlan(text);
  return ["basic", "pro", "premium"].includes(plan) ? plan : "";
}

function normalizeContactRequestStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!CONTACT_REQUEST_STATUSES.has(normalized)) {
    throw new ValidationError("Contact request status must be new, reviewed, or resolved.");
  }
  return normalized;
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

function normalizeStoredPlan(plan) {
  return normalizePlan(plan || "basic");
}

async function loadWebhookHealthData() {
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

  return {
    summary: summary.rows,
    recent: recent.rows,
    failures: failures.rows
  };
}

async function loadOverviewMetrics() {
  const summaryResult = await query(
    `SELECT
       COUNT(*)::int AS total_users,
       COUNT(*) FILTER (
         WHERE lower(coalesce(subscription_status, '')) IN ('active', 'trialing')
           AND (subscription_expires_at IS NULL OR subscription_expires_at > NOW())
       )::int AS access_enabled_users,
       COUNT(*) FILTER (WHERE lower(coalesce(subscription_status, '')) = 'active')::int AS active_subscriptions,
       COUNT(*) FILTER (WHERE lower(coalesce(subscription_status, '')) = 'trialing')::int AS trial_subscriptions,
       COUNT(*) FILTER (WHERE lower(coalesce(subscription_status, '')) IN ('past_due', 'incomplete', 'unpaid'))::int AS attention_subscriptions,
       COUNT(*) FILTER (
         WHERE lower(coalesce(subscription_status, '')) IN ('active', 'trialing')
           AND subscription_expires_at IS NOT NULL
           AND subscription_expires_at <= NOW() + INTERVAL '14 days'
       )::int AS expiring_soon,
       COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS new_signups_30d
     FROM users`
  );

  const planBreakdownResult = await query(
    `SELECT
       ${normalizedPlanCase("plan")} AS plan,
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE lower(coalesce(subscription_status, '')) = 'active')::int AS active,
       COUNT(*) FILTER (WHERE lower(coalesce(subscription_status, '')) = 'trialing')::int AS trialing,
       COUNT(*) FILTER (WHERE lower(coalesce(subscription_status, '')) IN ('past_due', 'incomplete', 'unpaid'))::int AS attention
     FROM users
     GROUP BY 1
     ORDER BY CASE ${normalizedPlanCase("plan")}
       WHEN 'premium' THEN 1
       WHEN 'pro' THEN 2
       ELSE 3
     END`
  );

  return {
    metrics: summaryResult.rows[0] || {
      total_users: 0,
      access_enabled_users: 0,
      active_subscriptions: 0,
      trial_subscriptions: 0,
      attention_subscriptions: 0,
      expiring_soon: 0,
      new_signups_30d: 0
    },
    planBreakdown: planBreakdownResult.rows
  };
}

async function loadContactRequestSummary(limit = 12) {
  const [countsResult, recentResult] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'new')::int AS new_count,
         COUNT(*) FILTER (WHERE status = 'reviewed')::int AS reviewed_count,
         COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_count,
         COUNT(*) FILTER (WHERE email_delivery_status <> 'sent')::int AS delivery_issue_count
       FROM contact_requests`
    ),
    query(
      `SELECT id, name, email, phone, agency, message, source_page,
              status, email_delivery_status, email_delivery_message,
              submitted_at, reviewed_at, reviewed_by_user_id
       FROM contact_requests
       ORDER BY submitted_at DESC
       LIMIT $1`,
      [limit]
    )
  ]);

  return {
    counts: countsResult.rows[0] || {
      total: 0,
      new_count: 0,
      reviewed_count: 0,
      resolved_count: 0,
      delivery_issue_count: 0
    },
    recent: recentResult.rows
  };
}

export async function listUsers(req, res, next) {
  try {
    const limit = toPositiveInt(req.query.limit, 100, 250);
    const search = normalizeSearch(req.query.search);
    const searchText = normalizeSearchText(req.query.search);
    const status = String(req.query.status || "").trim().toLowerCase();
    const planFilter = normalizePlanFilter(req.query.plan);
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

    if (planFilter) {
      params.push(planFilter);
      where.push(`${normalizedPlanCase("plan")} = $${params.length}`);
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

      if (planFilter && normalizeStoredPlan(user.plan) !== planFilter) {
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

export async function getOwnerOverview(req, res, next) {
  try {
    const [overview, contactRequests, webhook] = await Promise.all([
      loadOverviewMetrics(),
      loadContactRequestSummary(),
      loadWebhookHealthData()
    ]);

    res.json({
      metrics: {
        ...overview.metrics,
        new_contact_requests: contactRequests.counts.new_count,
        open_contact_requests: Number(contactRequests.counts.new_count || 0) + Number(contactRequests.counts.reviewed_count || 0)
      },
      planBreakdown: overview.planBreakdown,
      contactRequests,
      webhook
    });
  } catch (err) {
    next(err);
  }
}

export async function getWebhookHealth(req, res, next) {
  try {
    res.json(await loadWebhookHealthData());
  } catch (err) {
    next(err);
  }
}

export async function updateContactRequestStatus(req, res, next) {
  try {
    const requestId = Number.parseInt(req.params.id, 10);
    if (!Number.isFinite(requestId) || requestId <= 0) {
      return res.status(400).json({ error: "Valid contact request id required" });
    }

    const status = normalizeContactRequestStatus(req.body?.status);
    const result = await query(
      `UPDATE contact_requests
       SET status = $1,
           reviewed_at = CASE WHEN $1 = 'new' THEN NULL ELSE NOW() END,
           reviewed_by_user_id = CASE WHEN $1 = 'new' THEN NULL ELSE $2 END,
           updated_at = NOW()
       WHERE id = $3
       RETURNING id, name, email, phone, agency, message, source_page,
                 status, email_delivery_status, email_delivery_message,
                 submitted_at, reviewed_at, reviewed_by_user_id`,
      [status, req.user.id, requestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Contact request not found" });
    }

    res.json({ contactRequest: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function setOwnerPreviewSession(req, res, next) {
  try {
    const fallbackUser = {
      plan: req.user.owner_actual_plan || req.user.plan,
      lead_state: req.user.owner_actual_lead_state || req.user.lead_state,
      subscription_status: req.user.owner_actual_subscription_status || req.user.subscription_status
    };
    const preview = normalizeOwnerPreviewInput(req.body || {}, fallbackUser);
    setOwnerPreviewCookie(res, preview);

    res.json({
      preview: {
        active: true,
        ...preview
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function clearOwnerPreviewSession(req, res) {
  clearOwnerPreviewCookie(res);
  res.json({ preview: { active: false } });
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
