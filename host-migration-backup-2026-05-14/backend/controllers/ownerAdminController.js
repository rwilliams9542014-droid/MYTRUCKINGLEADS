import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { query } from "../config/db.js";
import { connectMongo, getMongoUri, isMongoConnected } from "../config/mongo.js";
import Carrier from "../models/Carrier.js";
import {
  backfillInsuranceRenewalWindows,
  currentInsuranceFeedWarning,
  debugInsuranceRenewalSearch,
  importInsuranceFilingIntelligence,
  listInsuranceSourceHealth
} from "../services/insuranceFilingImportService.js";
import { cancelSubscriptionForUser, listStripeSignupRecords } from "../services/stripeService.js";
import { getLatestSubscriptionConsentForUser } from "../services/subscriptionConsentService.js";
import { isOwnerUser } from "../utils/ownerAccess.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function nowIso() {
  return new Date().toISOString();
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function maskId(value) {
  const text = String(value || "");
  if (!text) return null;
  if (text.length <= 8) return `${text.slice(0, 2)}...`;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

const REAL_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "canceled", "cancelled"]);
const NON_SUBSCRIBER_ACCOUNT_STATUSES = new Set(["pending_checkout", "inactive"]);
const INTERNAL_ROLES = new Set(["owner", "admin", "super_admin", "superadmin"]);
const INTERNAL_EMAIL_PATTERNS = [
  /^owner@/i,
  /^admin@/i,
  /^test[+._-]/i,
  /(^|[+._-])test([+._-]|@)/i,
  /(^|[+._-])demo([+._-]|@)/i,
  /(^|[+._-])fake([+._-]|@)/i,
  /(^|[+._-])sample([+._-]|@)/i,
  /@example\./i,
  /@test\./i,
  /@demo\./i
];
const INTERNAL_TEXT_PATTERN = /\b(test|demo|fake|sample)\b/i;

function normalizedLower(value) {
  return String(value || "").trim().toLowerCase();
}

function hasStripeBilling(row = {}) {
  return Boolean(row.stripe_subscription_id || row.stripe_customer_id);
}

function isInternalOrDemoSubscriber(row = {}) {
  const role = normalizedLower(row.role);
  const email = normalizedLower(row.email);
  const nameFields = [row.name, row.username, row.business_name, row.agency].filter(Boolean).join(" ");

  if (INTERNAL_ROLES.has(role) || isOwnerUser(row)) return true;
  if (email && INTERNAL_EMAIL_PATTERNS.some((pattern) => pattern.test(email))) return true;
  if (INTERNAL_TEXT_PATTERN.test(nameFields)) return true;
  return false;
}

function isRealSubscriber(row = {}) {
  const subscriptionStatus = normalizedLower(row.subscription_status);
  const accountStatus = normalizedLower(row.account_status);

  return (
    hasStripeBilling(row) &&
    REAL_SUBSCRIPTION_STATUSES.has(subscriptionStatus) &&
    !NON_SUBSCRIBER_ACCOUNT_STATUSES.has(accountStatus) &&
    !isInternalOrDemoSubscriber(row)
  );
}

function statusForUser(user = {}) {
  const accountStatus = String(user.account_status || "").toLowerCase();
  if (accountStatus === "frozen") return "Frozen";
  if (accountStatus === "suspended") return "Suspended";

  const status = String(user.subscription_status || "").toLowerCase();
  if (status === "trialing") return "Trial";
  if (status === "past_due") return "Past Due";
  if (status === "canceled" || status === "cancelled") return "Canceled";
  if (status === "incomplete") return "Incomplete";
  if (status === "active") return "Active";
  return status ? status.replace(/_/g, " ") : "Unknown";
}

function safeUser(row = {}) {
  const monthlyPrice = row.monthly_price == null ? null : Number(row.monthly_price);
  return {
    id: row.id,
    name: row.name || row.username || row.email || "Unknown",
    email: row.email || "",
    company: row.business_name || row.agency || "",
    plan: row.plan || "basic",
    status: statusForUser(row),
    subscriptionStatus: row.subscription_status || null,
    accountStatus: row.account_status || "active",
    trialEnds: row.trial_ends_at || null,
    currentPeriodEnds: row.subscription_expires_at || null,
    monthlyPrice,
    seats: row.seats || 1,
    lastLogin: row.last_login_at || null,
    leadsUsed: row.daily_saved_prospects ?? null,
    emailsSent: row.emails_sent ?? null,
    smsSent: row.sms_sent ?? null,
    exportsThisMonth: row.monthly_export_rows ?? null,
    createdDate: row.created_at || null,
    source: row.source || "local",
    hasAccess: row.account_status !== "frozen" && row.has_access !== false,
    stripeCustomerIdMasked: maskId(row.stripe_customer_id),
    stripeSubscriptionIdMasked: maskId(row.stripe_subscription_id),
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    frozenAt: row.frozen_at || null,
    frozenReason: row.frozen_reason || null
  };
}

function safeConsent(row = null) {
  if (!row) return null;
  return {
    accepted: Boolean(row.accepted_terms && row.accepted_privacy && row.accepted_subscription_agreement),
    acceptedAt: row.accepted_at || null,
    planId: row.plan_id || null,
    planName: row.plan_name || null,
    planPrice: row.plan_price == null ? null : Number(row.plan_price),
    billingInterval: row.billing_interval || null,
    trialDays: row.trial_days ?? null,
    trialStartAt: row.trial_start_at || null,
    trialEndAt: row.trial_end_at || null,
    firstBillingAt: row.first_billing_at || null,
    termsVersion: row.terms_version || null,
    privacyVersion: row.privacy_version || null,
    subscriptionAgreementVersion: row.subscription_agreement_version || null,
    stripeCustomerIdMasked: maskId(row.stripe_customer_id),
    stripeSubscriptionIdMasked: maskId(row.stripe_subscription_id),
    checkoutSessionIdMasked: maskId(row.checkout_session_id)
  };
}

function buildMetric(label, value, status = "healthy", detail = "", action = "") {
  return { label, value, status, detail, action };
}

function buildHealth(name, status, message, action = "View Details", lastChecked = nowIso()) {
  return { name, status, message, action, lastChecked };
}

async function safeQuery(sql, params = [], fallback = []) {
  try {
    return (await query(sql, params)).rows;
  } catch (err) {
    console.warn("Owner metric query skipped:", err.message);
    return fallback;
  }
}

async function loadLocalUsers(limit = 250) {
  const rows = await safeQuery(
    `SELECT u.id, u.name, u.username, u.email, u.business_name, u.plan, u.role,
            u.stripe_customer_id, u.stripe_subscription_id,
            u.subscription_status, u.subscription_expires_at, u.trial_ends_at,
            u.account_status, u.frozen_at, u.frozen_reason,
            u.daily_saved_prospects, u.monthly_export_rows, u.created_at, u.updated_at,
            NULL::timestamptz AS last_login_at,
            COALESCE(ou.emails_sent, 0)::int AS emails_sent,
            COALESCE(ou.sms_sent, 0)::int AS sms_sent,
            CASE
              WHEN lower(coalesce(u.subscription_status, '')) IN ('active', 'trialing')
                AND coalesce(u.account_status, 'active') <> 'frozen'
                AND (u.subscription_expires_at IS NULL OR u.subscription_expires_at > NOW())
              THEN true ELSE false
            END AS has_access
     FROM users u
     LEFT JOIN outreach_usage ou ON ou.user_id = u.id AND ou.month = to_char(NOW(), 'YYYY-MM')
     WHERE (u.stripe_subscription_id IS NOT NULL OR u.stripe_customer_id IS NOT NULL)
       AND lower(coalesce(u.subscription_status, '')) IN ('active', 'trialing', 'past_due', 'unpaid', 'canceled', 'cancelled')
       AND lower(coalesce(u.account_status, 'active')) NOT IN ('pending_checkout', 'inactive')
       AND lower(coalesce(u.role, '')) NOT IN ('owner', 'admin', 'super_admin', 'superadmin')
     ORDER BY u.created_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(500, limit))],
    []
  );
  return rows.map((row) => ({ ...row, source: "local" })).filter(isRealSubscriber);
}

async function loadSubscribers(limit = 250) {
  const [localRows, rawStripeRows] = await Promise.all([
    loadLocalUsers(limit),
    listStripeSignupRecords({ limit, backfillLocalUsers: false })
  ]);
  const stripeRows = rawStripeRows.filter(isRealSubscriber);

  const stripeBySubscription = new Map(
    stripeRows
      .filter((row) => row.stripe_subscription_id)
      .map((row) => [String(row.stripe_subscription_id), row])
  );
  const stripeByEmail = new Map(
    stripeRows
      .filter((row) => row.email)
      .map((row) => [String(row.email).toLowerCase(), row])
  );

  const merged = localRows.map((row) => {
    const stripeMatch =
      stripeBySubscription.get(String(row.stripe_subscription_id || "")) ||
      stripeByEmail.get(String(row.email || "").toLowerCase()) ||
      {};
    return safeUser({ ...stripeMatch, ...row, monthly_price: stripeMatch.monthly_price, seats: stripeMatch.seats });
  });

  const localEmails = new Set(localRows.map((row) => String(row.email || "").toLowerCase()).filter(Boolean));
  const localSubscriptions = new Set(localRows.map((row) => String(row.stripe_subscription_id || "")).filter(Boolean));
  const stripeOnly = stripeRows
    .filter((row) => {
      const email = String(row.email || "").toLowerCase();
      const subscriptionId = String(row.stripe_subscription_id || "");
      return (!email || !localEmails.has(email)) && (!subscriptionId || !localSubscriptions.has(subscriptionId));
    })
    .map((row) => safeUser({ ...row, account_status: "active", source: "stripe_only" }));

  return [...merged, ...stripeOnly].slice(0, limit);
}

async function loadRevenue() {
  const stripeRows = (await listStripeSignupRecords({ limit: 100, backfillLocalUsers: false })).filter(isRealSubscriber);
  const active = stripeRows.filter((row) => ["active", "trialing"].includes(String(row.subscription_status || "").toLowerCase()));
  const mrr = active.reduce((sum, row) => sum + Number(row.monthly_price || 0), 0);
  const failedRows = await safeQuery(
    `SELECT COUNT(*)::int AS count FROM stripe_webhook_events
     WHERE type = 'invoice.payment_failed' AND processed_at >= date_trunc('month', NOW())`,
    [],
    [{ count: 0 }]
  );
  const webhookRows = await safeQuery(
    `SELECT status, COUNT(*)::int AS count
     FROM stripe_webhook_events
     WHERE processed_at >= NOW() - INTERVAL '30 days'
     GROUP BY status`,
    [],
    []
  );

  const statusCounts = Object.fromEntries(webhookRows.map((row) => [row.status, Number(row.count || 0)]));
  return {
    source: active.length ? "Stripe subscriptions" : "No Stripe subscription totals available yet",
    mrr: active.length ? Number(mrr.toFixed(2)) : null,
    arr: active.length ? Number((mrr * 12).toFixed(2)) : null,
    revenueThisMonth: null,
    revenueLastMonth: null,
    newSubscriptionsThisMonth: stripeRows.filter((row) => {
      const created = Date.parse(row.created_at || "");
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      return Number.isFinite(created) && created >= start.getTime();
    }).length,
    cancellationsThisMonth: stripeRows.filter((row) => String(row.subscription_status || "").toLowerCase() === "canceled").length,
    churnRate: null,
    failedPayments: Number(failedRows[0]?.count || 0),
    pastDueAccounts: stripeRows.filter((row) => String(row.subscription_status || "").toLowerCase() === "past_due").length,
    averageRevenuePerAccount: active.length ? Number((mrr / active.length).toFixed(2)) : null,
    paymentHealth: {
      successfulPayments: statusCounts.processed ?? 0,
      failedPayments: statusCounts.failed ?? 0,
      pastDueSubscriptions: stripeRows.filter((row) => String(row.subscription_status || "").toLowerCase() === "past_due").length,
      webhookStatus: statusCounts.failed ? "Warning" : "Healthy"
    },
    monthlyTrend: [
      { label: "This month", value: active.length ? Number(mrr.toFixed(2)) : null },
      { label: "Last month", value: null },
      { label: "Prior", value: null }
    ]
  };
}

async function loadCarrierFreshness() {
  const configured = Boolean(getMongoUri());
  if (!configured) {
    return {
      configured,
      connected: false,
      totalCarriersCached: null,
      totalCarriersEnriched: null,
      failedEnrichmentCount: null,
      lastFmcsaCarrierLookup: null,
      lastMotusPublicDataImport: null,
      lastNewDotImport: null,
      lastRenewalRefresh: null,
      lastSafetySmsDataCheck: null,
      newDotImportedThisWeek: null,
      renewalLeadsAvailable: null
    };
  }

  await connectMongo().catch(() => null);
  if (!isMongoConnected()) {
    return { configured, connected: false };
  }

  const [total, enriched, failed, latestCarrier, latestMotus, latestNew, latestRenewal, latestSms, newWeek, renewals] =
    await Promise.all([
      Carrier.countDocuments({}).catch(() => null),
      Carrier.countDocuments({ lastFullEnrichedAt: { $ne: null } }).catch(() => null),
      Carrier.countDocuments({ enrichmentStatus: /failed/i }).catch(() => null),
      Carrier.findOne({}).sort({ lastUpdated: -1 }).select("lastUpdated").lean().catch(() => null),
      Carrier.findOne({ source: /Motus|Public/i }).sort({ firstImportedAt: -1, sourceLastSeenAt: -1 }).select("firstImportedAt sourceLastSeenAt").lean().catch(() => null),
      Carrier.findOne({ isNewLead: true }).sort({ newLeadSince: -1, firstImportedAt: -1 }).select("newLeadSince firstImportedAt").lean().catch(() => null),
      Carrier.findOne({ insuranceExpirationDate: { $ne: null } }).sort({ lastInsuranceEnrichedAt: -1, updatedAt: -1 }).select("lastInsuranceEnrichedAt updatedAt").lean().catch(() => null),
      Carrier.findOne({}).sort({ lastSmsEnrichedAt: -1 }).select("lastSmsEnrichedAt").lean().catch(() => null),
      Carrier.countDocuments({ isNewLead: true, newLeadSince: { $gte: new Date(Date.now() - 7 * 86400000) } }).catch(() => null),
      Carrier.countDocuments({ insuranceExpirationDate: { $gte: new Date(), $lte: new Date(Date.now() + 30 * 86400000) } }).catch(() => null)
    ]);

  return {
    configured,
    connected: true,
    totalCarriersCached: total,
    totalCarriersEnriched: enriched,
    failedEnrichmentCount: failed,
    lastFmcsaCarrierLookup: latestCarrier?.lastUpdated || null,
    lastMotusPublicDataImport: latestMotus?.firstImportedAt || latestMotus?.sourceLastSeenAt || null,
    lastNewDotImport: latestNew?.newLeadSince || latestNew?.firstImportedAt || null,
    lastRenewalRefresh: latestRenewal?.lastInsuranceEnrichedAt || latestRenewal?.updatedAt || null,
    lastSafetySmsDataCheck: latestSms?.lastSmsEnrichedAt || null,
    newDotImportedThisWeek: newWeek,
    renewalLeadsAvailable: renewals
  };
}

function freshnessStatus(dateValue, staleHours) {
  if (!dateValue) return "not_configured";
  const ageHours = (Date.now() - new Date(dateValue).getTime()) / 3600000;
  if (!Number.isFinite(ageHours)) return "warning";
  if (ageHours <= staleHours) return "healthy";
  if (ageHours <= staleHours * 2) return "warning";
  return "down";
}

async function loadActivity() {
  const searchRows = await safeQuery(
    `SELECT
       COUNT(*) FILTER (WHERE searched_at >= date_trunc('day', NOW()))::int AS searches_today,
       COUNT(*) FILTER (WHERE searched_at >= date_trunc('month', NOW()))::int AS searches_month
     FROM search_history`,
    [],
    [{ searches_today: null, searches_month: null }]
  );
  const leadRows = await safeQuery(
    `SELECT COUNT(*) FILTER (WHERE saved_at >= date_trunc('month', NOW()))::int AS saved_month FROM leads`,
    [],
    [{ saved_month: null }]
  );
  const outreachRows = await safeQuery(
    `SELECT
       COUNT(*) FILTER (WHERE channel = 'email' AND status = 'sent' AND sent_at >= date_trunc('month', NOW()))::int AS email_sent,
       COUNT(*) FILTER (WHERE channel = 'sms' AND status = 'sent' AND sent_at >= date_trunc('month', NOW()))::int AS sms_sent
     FROM outreach_logs`,
    [],
    [{ email_sent: null, sms_sent: null }]
  );
  const quoteRows = await safeQuery(
    `SELECT
       COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW()))::int AS quote_requests,
       COUNT(*) FILTER (WHERE purchased_at >= date_trunc('month', NOW()))::int AS sold
     FROM quote_requests`,
    [],
    [{ quote_requests: null, sold: null }]
  );

  const freshness = await loadCarrierFreshness();
  return {
    leadSearchesToday: searchRows[0]?.searches_today,
    leadSearchesThisMonth: searchRows[0]?.searches_month,
    newDotLeadsImported: freshness.newDotImportedThisWeek,
    renewalLeadsAvailable: freshness.renewalLeadsAvailable,
    carriersSavedToCrm: leadRows[0]?.saved_month,
    exportsThisMonth: null,
    copyEmailActions: null,
    emailOutreachSent: outreachRows[0]?.email_sent,
    smsOutreachSent: outreachRows[0]?.sms_sent,
    marketplaceLeadsSold: quoteRows[0]?.sold,
    quoteRequestsSubmitted: quoteRows[0]?.quote_requests
  };
}

async function logOwnerAction(ownerUserId, targetUserId, action, reason = "", metadata = {}) {
  await query(
    `INSERT INTO owner_action_logs (owner_user_id, target_user_id, action, reason, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
    [ownerUserId, targetUserId, action, reason || null, JSON.stringify(metadata || {})]
  );
}

async function loadActionHistory(targetUserId) {
  return safeQuery(
    `SELECT id, owner_user_id, target_user_id, action, reason, metadata, created_at
     FROM owner_action_logs
     WHERE target_user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [targetUserId],
    []
  );
}

async function loadAdminNotes(targetUserId) {
  return safeQuery(
    `SELECT id, owner_user_id, reason AS note, created_at
     FROM owner_action_logs
     WHERE target_user_id = $1 AND action = 'note'
     ORDER BY created_at DESC
     LIMIT 25`,
    [targetUserId],
    []
  );
}

async function platformStatus() {
  const [health, alerts] = await Promise.all([getOwnerHealthPayload(), getOwnerAlertsPayload()]);
  const critical = alerts.alerts.some((alert) => alert.severity === "critical");
  const warning = alerts.alerts.some((alert) => ["warning", "critical"].includes(alert.severity));
  return critical ? "Critical" : warning ? "Needs Attention" : "Platform Healthy";
}

async function getOwnerSummaryPayload() {
  const [subscribers, revenue, activity] = await Promise.all([
    loadSubscribers(250),
    loadRevenue(),
    loadActivity()
  ]);
  const thisMonthStart = new Date();
  thisMonthStart.setDate(1);
  thisMonthStart.setHours(0, 0, 0, 0);

  return {
    platformStatus: await platformStatus(),
    lastUpdated: nowIso(),
    metrics: [
      buildMetric("Active Subscribers", subscribers.filter((u) => u.status === "Active").length, "healthy"),
      buildMetric("Trial Users", subscribers.filter((u) => u.status === "Trial").length, "warning"),
      buildMetric("Monthly Recurring Revenue", revenue.mrr, revenue.mrr == null ? "not_tracked" : "healthy", revenue.source),
      buildMetric("Annual Recurring Revenue", revenue.arr, revenue.arr == null ? "not_tracked" : "healthy", revenue.source),
      buildMetric("Cancellations This Month", revenue.cancellationsThisMonth, "warning", "From available Stripe subscription status"),
      buildMetric("New Signups This Month", subscribers.filter((u) => Date.parse(u.createdDate || "") >= thisMonthStart.getTime()).length, "healthy"),
      buildMetric("Quote Requests This Month", activity.quoteRequestsSubmitted, activity.quoteRequestsSubmitted == null ? "not_tracked" : "healthy"),
      buildMetric("New DOT Leads Imported This Week", activity.newDotLeadsImported, activity.newDotLeadsImported == null ? "not_configured" : "healthy")
    ]
  };
}

async function getOwnerHealthPayload() {
  const started = Date.now();
  let databaseStatus = "healthy";
  let databaseMessage = "Connected";
  try {
    await query("SELECT 1");
    const elapsed = Date.now() - started;
    if (elapsed > 1000) {
      databaseStatus = "warning";
      databaseMessage = `Connected, but response was slow (${elapsed}ms)`;
    }
  } catch (err) {
    databaseStatus = "down";
    databaseMessage = "Database query failed";
  }

  const freshness = await loadCarrierFreshness();
  const uploadRoot = process.env.QUOTE_UPLOAD_DIR || path.join(__dirname, "..", "storage", "quote-uploads");
  let storageStatus = "healthy";
  let storageMessage = "Upload storage available";
  try {
    await fs.mkdir(uploadRoot, { recursive: true });
  } catch {
    storageStatus = "down";
    storageMessage = "Quote upload storage is not writable";
  }

  const insuranceSources = await listInsuranceSourceHealth().catch(() => []);
  const insuranceWarning = await currentInsuranceFeedWarning().catch(() => "");
  const insuranceChecks = insuranceSources.map((source) => buildHealth(
    `Insurance Source: ${source.source_name}`,
    source.status === "healthy" ? "healthy" : source.status === "frozen" ? "warning" : source.status || "warning",
    source.message || source.error_message || "Insurance source checked",
    source.safe_for_current_leads ? "Current source can be used for verified insurance intelligence" : "Treat as historical/estimated unless live verification succeeds"
  ));

  const checks = [
    buildHealth("API Health", "healthy", "API is responding"),
    buildHealth("Database Connection", databaseStatus, databaseMessage),
    buildHealth("FMCSA_WEBKEY Present", process.env.FMCSA_WEBKEY ? "healthy" : "not_configured", process.env.FMCSA_WEBKEY ? "Present" : "Missing"),
    buildHealth("FMCSA/QCMobile Live Lookup", process.env.FMCSA_WEBKEY ? "healthy" : "warning", process.env.FMCSA_WEBKEY ? "Configured for live lookup" : "FMCSA webkey missing"),
    buildHealth("Motus/Public Data Import Status", freshnessStatus(freshness.lastMotusPublicDataImport, 48), freshness.lastMotusPublicDataImport ? `Last import ${new Date(freshness.lastMotusPublicDataImport).toLocaleString()}` : "No Motus import timestamp found"),
    buildHealth("Stripe Connection", process.env.STRIPE_SECRET_KEY ? "healthy" : "not_configured", process.env.STRIPE_SECRET_KEY ? "Configured" : "Not configured"),
    buildHealth("Email Provider / Resend Status", process.env.RESEND_API_KEY ? "healthy" : "not_configured", process.env.RESEND_API_KEY ? "Configured" : "Not configured"),
    buildHealth("SMS Provider / Twilio Status", process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN ? "healthy" : "not_configured", process.env.TWILIO_ACCOUNT_SID ? "Configured" : "Not configured"),
    buildHealth("Quote Upload Storage", storageStatus, storageMessage),
    buildHealth("Lead Import Cron / Scheduled Job", process.env.CARRIER_CRON_ENABLED === "false" ? "warning" : "healthy", process.env.CARRIER_CRON_ENABLED === "false" ? "New DOT cron disabled" : `Daily schedule ${process.env.CARRIER_CRON_SCHEDULE || "0 2 * * *"}`),
    buildHealth("Last Successful New DOT Import", freshnessStatus(freshness.lastNewDotImport, 24), freshness.lastNewDotImport ? `Last import ${new Date(freshness.lastNewDotImport).toLocaleString()}` : "No New DOT import timestamp found"),
    buildHealth("Last Successful Renewal Data Refresh", freshnessStatus(freshness.lastRenewalRefresh, 35 * 24), freshness.lastRenewalRefresh ? `Last refresh ${new Date(freshness.lastRenewalRefresh).toLocaleString()}` : "No renewal refresh timestamp found"),
    ...(insuranceWarning ? [buildHealth("Insurance Cancellation Feed", "warning", insuranceWarning, "Review Insurance Data Sources")] : []),
    ...insuranceChecks
  ];

  return { lastUpdated: nowIso(), checks };
}

async function getOwnerAlertsPayload() {
  const [health, revenue] = await Promise.all([getOwnerHealthPayload(), loadRevenue()]);
  const alerts = [];

  for (const check of health.checks) {
    if (["down", "warning", "not_configured"].includes(check.status)) {
      alerts.push({
        severity: check.status === "down" ? "critical" : "warning",
        message: `${check.name}: ${check.message}`,
        timestamp: check.lastChecked,
        action: check.action
      });
    }
  }

  if (revenue.pastDueAccounts > 0) {
    alerts.push({
      severity: "warning",
      message: `${revenue.pastDueAccounts} account(s) are past due.`,
      timestamp: nowIso(),
      action: "Review Subscribers"
    });
  }

  return { alerts: alerts.slice(0, 20) };
}

export async function getOwnerSummary(req, res, next) {
  try {
    res.json(await getOwnerSummaryPayload());
  } catch (err) {
    next(err);
  }
}

export async function getOwnerHealth(req, res, next) {
  try {
    res.json(await getOwnerHealthPayload());
  } catch (err) {
    next(err);
  }
}

export async function getOwnerSubscribers(req, res, next) {
  try {
    res.json({ subscribers: await loadSubscribers(toInt(req.query.limit, 250)) });
  } catch (err) {
    next(err);
  }
}

export async function getOwnerSubscriber(req, res, next) {
  try {
    const userId = toInt(req.params.id, 0);
    const rows = await safeQuery(
      `SELECT u.*, COALESCE(ou.emails_sent, 0)::int AS emails_sent, COALESCE(ou.sms_sent, 0)::int AS sms_sent
       FROM users u
       LEFT JOIN outreach_usage ou ON ou.user_id = u.id AND ou.month = to_char(NOW(), 'YYYY-MM')
       WHERE u.id = $1`,
      [userId],
      []
    );
    if (!rows[0]) return res.status(404).json({ error: "Subscriber not found" });
    if (!isRealSubscriber(rows[0])) return res.status(404).json({ error: "Subscriber not found" });
    const subscriber = safeUser(rows[0]);
    const [notes, actionHistory, purchaseRows, quoteRows, consentRecord] = await Promise.all([
      loadAdminNotes(userId),
      loadActionHistory(userId),
      safeQuery("SELECT COUNT(*)::int AS count FROM lead_purchases WHERE user_id = $1", [userId], [{ count: null }]),
      safeQuery("SELECT COUNT(*)::int AS count FROM quote_requests WHERE assigned_user_id = $1 OR purchased_by = $1", [userId], [{ count: null }]),
      getLatestSubscriptionConsentForUser(userId).catch(() => null)
    ]);

    res.json({
      subscriber,
      usage: {
        leadSearchesThisMonth: null,
        exportsThisMonth: subscriber.exportsThisMonth,
        emailsSentThisMonth: subscriber.emailsSent,
        smsSentThisMonth: subscriber.smsSent,
        marketplaceLeadsPurchased: purchaseRows[0]?.count,
        quoteRequestsClaimed: quoteRows[0]?.count
      },
      adminNotes: notes,
      actionHistory,
      subscriptionConsent: safeConsent(consentRecord)
    });
  } catch (err) {
    next(err);
  }
}

export async function freezeOwnerSubscriber(req, res, next) {
  try {
    const userId = toInt(req.params.id, 0);
    const reason = String(req.body?.reason || "Frozen by owner").slice(0, 500);
    const result = await query(
      `UPDATE users
       SET account_status = 'frozen',
           frozen_at = NOW(),
           frozen_by = $2,
           frozen_reason = $3,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, email, account_status, frozen_at, frozen_reason`,
      [userId, req.owner.id, reason]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Subscriber not found" });
    await logOwnerAction(req.owner.id, userId, "freeze", reason);
    res.json({ subscriber: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function unfreezeOwnerSubscriber(req, res, next) {
  try {
    const userId = toInt(req.params.id, 0);
    const reason = String(req.body?.reason || "Unfrozen by owner").slice(0, 500);
    const result = await query(
      `UPDATE users
       SET account_status = 'active',
           frozen_at = NULL,
           frozen_by = NULL,
           frozen_reason = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, email, account_status`,
      [userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: "Subscriber not found" });
    await logOwnerAction(req.owner.id, userId, "unfreeze", reason);
    res.json({ subscriber: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

export async function cancelOwnerSubscriber(req, res, next) {
  try {
    const userId = toInt(req.params.id, 0);
    const reason = String(req.body?.reason || "Canceled by owner").slice(0, 500);
    const result = await cancelSubscriptionForUser(userId);
    await logOwnerAction(req.owner.id, userId, "cancel_subscription", reason, result);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function addOwnerSubscriberNote(req, res, next) {
  try {
    const userId = toInt(req.params.id, 0);
    const note = String(req.body?.note || "").trim();
    if (!note) return res.status(400).json({ error: "Note is required" });
    await logOwnerAction(req.owner.id, userId, "note", note.slice(0, 1000));
    res.json({ success: true, notes: await loadAdminNotes(userId) });
  } catch (err) {
    next(err);
  }
}

export async function getOwnerRevenue(req, res, next) {
  try {
    res.json(await loadRevenue());
  } catch (err) {
    next(err);
  }
}

export async function getOwnerActivity(req, res, next) {
  try {
    res.json(await loadActivity());
  } catch (err) {
    next(err);
  }
}

export async function getOwnerDataFreshness(req, res, next) {
  try {
    const freshness = await loadCarrierFreshness();
    const insuranceSources = await listInsuranceSourceHealth().catch(() => []);
    const insuranceWarning = await currentInsuranceFeedWarning().catch(() => "");
    res.json({
      ...freshness,
      insuranceSources,
      insuranceWarning,
      statuses: {
        lastFmcsaCarrierLookup: freshnessStatus(freshness.lastFmcsaCarrierLookup, 24),
        lastMotusPublicDataImport: freshnessStatus(freshness.lastMotusPublicDataImport, 48),
        lastNewDotImport: freshnessStatus(freshness.lastNewDotImport, 24),
        lastRenewalRefresh: freshnessStatus(freshness.lastRenewalRefresh, 35 * 24),
        lastSafetySmsDataCheck: freshnessStatus(freshness.lastSafetySmsDataCheck, 7 * 24)
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getOwnerInsuranceSourceHealth(req, res, next) {
  try {
    const sources = await listInsuranceSourceHealth();
    res.json({
      lastUpdated: nowIso(),
      warning: await currentInsuranceFeedWarning(),
      sources
    });
  } catch (err) {
    next(err);
  }
}

export async function runOwnerInsuranceImport(req, res, next) {
  try {
    const limit = Math.min(Math.max(toInt(req.body?.limit || req.query?.limit, Number(process.env.INSURANCE_FILING_IMPORT_LIMIT || 2500)), 1), 25000);
    const stats = await importInsuranceFilingIntelligence({ limit });
    res.json({
      success: true,
      message: "Insurance filing intelligence import completed.",
      warning: await currentInsuranceFeedWarning(),
      stats
    });
  } catch (err) {
    next(err);
  }
}

export async function runOwnerInsuranceBackfill(req, res, next) {
  try {
    const stats = await backfillInsuranceRenewalWindows();
    res.json({
      success: true,
      message: "Insurance renewal windows backfill completed.",
      warning: await currentInsuranceFeedWarning(),
      stats
    });
  } catch (err) {
    next(err);
  }
}

export async function getInsuranceRenewalDebug(req, res, next) {
  try {
    const report = await debugInsuranceRenewalSearch({
      start: req.query.start || req.query.from,
      end: req.query.end || req.query.to,
      state: req.query.state,
      requireContact: req.query.requireContact || req.query.require_contact || req.query.hasContact,
      activeAuthorityOnly: req.query.activeAuthorityOnly || req.query.active_authority_only,
      verifiedOnly: req.query.verifiedOnly || req.query.verified_only,
      estimatedOnly: req.query.estimatedOnly || req.query.estimated_only,
      includeHistoricalRecords: req.query.includeHistoricalRecords || req.query.include_historical_records,
      includeHistoricalEstimates: req.query.includeHistoricalEstimates || req.query.include_historical_estimates,
      insuranceCompany: req.query.insuranceCompany || req.query.insurance_company,
      minFleetSize: req.query.minFleetSize || req.query.min_fleet_size,
      maxFleetSize: req.query.maxFleetSize || req.query.max_fleet_size
    });
    res.json({
      success: true,
      generatedAt: nowIso(),
      ...report
    });
  } catch (err) {
    next(err);
  }
}

export async function getOwnerAlerts(req, res, next) {
  try {
    res.json(await getOwnerAlertsPayload());
  } catch (err) {
    next(err);
  }
}
