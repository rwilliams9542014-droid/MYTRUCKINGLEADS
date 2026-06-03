import { query } from "../config/db.js";
import {
  sendMarketplaceAdminLeadEmail,
  sendMarketplaceGoldLeadAlertEmail
} from "./emailService.js";

function csvEnv(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function queryable(client) {
  return client && typeof client.query === "function" ? client : { query };
}

async function createNotificationRecord(client, {
  userId,
  quoteRequestId = null,
  eventType,
  channel = "in_app",
  title,
  message,
  metadata = {},
  deliveryStatus = "queued",
  emailedAt = null,
  sentAt = null
}) {
  const db = queryable(client);
  const result = await db.query(
    `INSERT INTO marketplace_notifications (
       user_id, quote_request_id, event_type, channel, title, message,
       metadata, delivery_status, emailed_at, sent_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
     RETURNING id, user_id, quote_request_id, event_type, channel, title, message,
               metadata, delivery_status, emailed_at, sent_at, read_at, created_at`,
    [
      userId,
      quoteRequestId,
      eventType,
      channel,
      title,
      message,
      JSON.stringify(metadata || {}),
      deliveryStatus,
      emailedAt,
      sentAt
    ]
  );

  return result.rows[0];
}

async function getOwnerUsers() {
  const configuredEmails = csvEnv("MARKETPLACE_ADMIN_EMAILS")
    .concat(csvEnv("OWNER_EMAILS"))
    .concat(csvEnv("OWNER_EMAIL"));
  const configuredUsernames = csvEnv("OWNER_USERNAMES").concat(csvEnv("OWNER_USERNAME"));

  const result = await query(
    `SELECT id, email, name, username
     FROM users
     WHERE (
       lower(COALESCE(email, '')) = ANY($1::text[])
       OR lower(COALESCE(username, '')) = ANY($2::text[])
     )`,
    [
      configuredEmails.map((value) => value.toLowerCase()),
      configuredUsernames.map((value) => value.toLowerCase())
    ]
  );

  return result.rows;
}

async function getPriorityMarketplaceUsers() {
  const result = await query(
    `SELECT id, email, name, plan, subscription_status
     FROM users
     WHERE plan IN ('pro', 'premium')
       AND subscription_status IN ('active', 'trialing')
       AND email IS NOT NULL`,
    []
  );

  return result.rows;
}

async function getEliteMarketplaceUsers() {
  const result = await query(
    `SELECT id, email, name, plan, subscription_status
     FROM users
     WHERE plan = 'premium'
       AND subscription_status IN ('active', 'trialing')
       AND email IS NOT NULL`,
    []
  );

  return result.rows;
}

export async function notifyAdminOfNewQuoteRequest(quoteRequest, client = null) {
  const owners = await getOwnerUsers();
  const fallbackEmail = String(
    process.env.MARKETPLACE_ADMIN_EMAIL ||
    process.env.CONTACT_REQUEST_TO ||
    "mytruckingleads@gmail.com"
  ).trim();

  for (const owner of owners) {
    await createNotificationRecord(client, {
      userId: owner.id,
      quoteRequestId: quoteRequest.id,
      eventType: "marketplace.new_quote_request",
      title: "New quote request submitted",
      message: `${quoteRequest.company_name} requested trucking insurance quotes.`,
      metadata: {
        leadTier: quoteRequest.lead_tier,
        leadScore: quoteRequest.lead_score,
        primaryState: quoteRequest.primary_state
      },
      deliveryStatus: "delivered",
      sentAt: new Date().toISOString()
    });
  }

  await sendMarketplaceAdminLeadEmail({
    toEmail: fallbackEmail,
    quoteRequest
  });
}

export async function notifyPrioritySubscribersOfLead(quoteRequest, client = null) {
  const users = await getPriorityMarketplaceUsers();
  const title = `${quoteRequest.lead_tier} marketplace lead available`;
  const message = `${quoteRequest.primary_state || "Multi-state"} lead from ${quoteRequest.power_units || 0} power units is available in the marketplace.`;

  for (const user of users) {
    await createNotificationRecord(client, {
      userId: user.id,
      quoteRequestId: quoteRequest.id,
      eventType: "marketplace.priority_lead",
      title,
      message,
      metadata: {
        leadTier: quoteRequest.lead_tier,
        leadScore: quoteRequest.lead_score,
        price: quoteRequest.lead_price
      },
      deliveryStatus: "delivered",
      sentAt: new Date().toISOString()
    });
  }
}

export async function notifyEliteUsersOfGoldLead(quoteRequest, client = null) {
  if (String(quoteRequest.lead_tier || "").toLowerCase() !== "gold") {
    return;
  }

  const eliteUsers = await getEliteMarketplaceUsers();
  const sentAt = new Date().toISOString();

  for (const user of eliteUsers) {
    await createNotificationRecord(client, {
      userId: user.id,
      quoteRequestId: quoteRequest.id,
      eventType: "marketplace.gold_lead_alert",
      title: "New Gold lead available",
      message: `${quoteRequest.company_name} is a new Gold lead with ${quoteRequest.document_completion_percent}% document completion.`,
      metadata: {
        leadTier: quoteRequest.lead_tier,
        leadScore: quoteRequest.lead_score,
        price: quoteRequest.lead_price
      },
      deliveryStatus: "delivered",
      sentAt
    });

    await sendMarketplaceGoldLeadAlertEmail({
      toEmail: user.email,
      recipientName: user.name || user.email,
      quoteRequest
    });
  }
}

export async function recordPurchaseNotification({ userId, quoteRequestId, title, message, metadata = {} }, client = null) {
  return createNotificationRecord(client, {
    userId,
    quoteRequestId,
    eventType: "marketplace.purchase_complete",
    title,
    message,
    metadata,
    deliveryStatus: "delivered",
    sentAt: new Date().toISOString()
  });
}

export async function getMarketplaceNotificationsForUser(userId, limit = 25) {
  const result = await query(
    `SELECT id, quote_request_id, event_type, channel, title, message,
            metadata, delivery_status, emailed_at, sent_at, read_at, created_at
     FROM marketplace_notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return result.rows;
}

export async function markMarketplaceNotificationRead(userId, notificationId) {
  const result = await query(
    `UPDATE marketplace_notifications
     SET read_at = COALESCE(read_at, NOW())
     WHERE id = $1 AND user_id = $2
     RETURNING id, read_at`,
    [notificationId, userId]
  );

  return result.rows[0] || null;
}

export const MARKETPLACE_NOTIFICATION_CHANNELS = Object.freeze({
  IN_APP: "in_app",
  EMAIL: "email",
  SMS: "sms"
});
