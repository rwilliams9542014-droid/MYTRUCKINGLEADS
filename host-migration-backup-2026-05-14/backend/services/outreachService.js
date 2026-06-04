import crypto from "crypto";
import { query } from "../config/db.js";
import { sendEmailMessage } from "./emailService.js";
import {
  canSendEmail,
  canSendSms,
  canUseBulkMessaging,
  getMonthlyEmailLimit,
  getMonthlySmsLimit,
  getPlanAccessSummary,
  getUserPlan
} from "../utils/planAccess.js";

const DEFAULT_TEMPLATES = [
  {
    id: "new-dot-quote-request-email",
    channel: "email",
    name: "New DOT Lead Quote Request",
    subject: "Commercial Trucking Coverage Help",
    body: `Hello {{carrierName}},

I saw your DOT #{{dotNumber}} and wanted to see if you need help reviewing commercial trucking coverage.

To quote accurately, we usually need:
- Driver list
- Vehicle list
- Cargo hauled
- Current coverage if already insured
- Loss runs if available

If you would like help, reply to this email and we can get started.

Thank you,
{{agentName}}

To stop receiving emails, click here:
{{unsubscribeLink}}`
  },
  {
    id: "renewal-opportunity-quote-request-email",
    channel: "email",
    name: "Renewal Opportunity Quote Request",
    subject: "Upcoming Trucking Coverage Review",
    body: `Hello {{carrierName}},

I'm reaching out because your trucking coverage may be coming up for review.

To quote accurately, we usually need:
- Current policy declarations page
- Driver list
- Vehicle list
- Loss runs
- IFTA reports if available
- Cargo hauled details

If you would like help comparing options, reply to this email and we can get started.

Thank you,
{{agentName}}

To stop receiving emails, click here:
{{unsubscribeLink}}`
  },
  {
    id: "general-carrier-outreach-email",
    channel: "email",
    name: "General Carrier Outreach",
    subject: "Quick Trucking Coverage Question",
    body: `Hello {{carrierName}},

I wanted to see if you would like help reviewing options for your commercial trucking coverage.

Your DOT information shows:
DOT #: {{dotNumber}}
Power Units: {{powerUnits}}
Cargo Hauled: {{cargoHauled}}

If you would like a quote, reply to this email and I can let you know what information is needed.

Thank you,
{{agentName}}

To stop receiving emails, click here:
{{unsubscribeLink}}`
  },
  {
    id: "renewal-sms",
    channel: "sms",
    name: "Renewal SMS",
    subject: "",
    body: "Hi {{contactName}}, this is {{agentName}} with {{agencyName}}. Can I help quote trucking coverage for {{carrierName}} around {{renewalDate}}? Reply STOP to opt out."
  },
  {
    id: "new-dot-sms",
    channel: "sms",
    name: "New DOT SMS",
    subject: "",
    body: "Hi {{contactName}}, this is {{agentName}} with {{agencyName}}. Need help with commercial trucking coverage for {{carrierName}}? Reply STOP to opt out."
  }
];

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function clean(value) {
  return String(value || "").trim();
}

function cleanFallback(value) {
  const text = clean(value);
  return text || "Not available";
}

function normalizePhone(value) {
  return clean(value).replace(/[^\d+]/g, "");
}

function selectSmsPhone(lead = {}, explicitPhone = "") {
  if (explicitPhone) return normalizePhone(explicitPhone);
  const contactNumbers = Array.isArray(lead.contactNumbers) ? lead.contactNumbers : [];
  const nonFax = contactNumbers.filter((entry) => String(entry?.type || entry?.label || "").toLowerCase() !== "fax");
  const mobile = nonFax.find((entry) => /mobile|cell/i.test(`${entry?.type || ""} ${entry?.label || ""}`));
  const business = nonFax.find((entry) => /business|contact|primary|secondary|unknown/i.test(`${entry?.type || ""} ${entry?.label || ""}`));
  return normalizePhone(mobile?.number || business?.number || lead.phone || "");
}

function userDisplay(user = {}) {
  return {
    agencyName: clean(user.business_name || user.businessName || "MyTruckingLeads"),
    agentName: clean(user.name || [user.first_name, user.last_name].filter(Boolean).join(" ") || "Your insurance agent"),
    agentEmail: clean(user.email),
    agentPhone: clean(user.phone)
  };
}

function unsubscribeToken({ userId, email }) {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || "mytruckingleads";
  return crypto
    .createHmac("sha256", secret)
    .update(`${userId}:${String(email || "").toLowerCase()}`)
    .digest("hex");
}

function unsubscribeLink({ userId, email }) {
  if (!email) return "";
  const appUrl = String(process.env.APP_BASE_URL || process.env.APP_URL || process.env.FRONTEND_URL || "https://www.mytruckingleads.com").replace(/\/$/, "");
  return `${appUrl}/unsubscribe/${unsubscribeToken({ userId, email })}?email=${encodeURIComponent(email)}&uid=${encodeURIComponent(userId)}`;
}

export function verifyUnsubscribeToken({ userId, email, token }) {
  if (!userId || !email || !token) return false;
  return unsubscribeToken({ userId, email }) === token;
}

export function getDefaultTemplates() {
  return DEFAULT_TEMPLATES;
}

export function renderTemplate(template, fields = {}) {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) => cleanFallback(fields[key]));
}

function replyToForUser(user = {}) {
  return clean(user.reply_email || user.replyEmail || user.email || process.env.DEFAULT_REPLY_TO_EMAIL);
}

function assertEmailConfigured(replyTo) {
  const provider = clean(process.env.EMAIL_PROVIDER || "resend").toLowerCase();
  if (!replyTo) {
    throw Object.assign(new Error("Reply email is required before sending outreach."), { status: 400 });
  }
  if (provider !== "resend") {
    throw Object.assign(new Error("Email sending is not configured yet."), { status: 503 });
  }
  if (!clean(process.env.RESEND_API_KEY)) {
    throw Object.assign(new Error("Email sending is not configured yet."), { status: 503 });
  }
  if (!clean(process.env.RESEND_FROM_EMAIL)) {
    throw Object.assign(new Error("Sender email is not configured yet."), { status: 503 });
  }
}

async function usageForUser(userId) {
  const month = monthKey();
  const result = await query(
    `INSERT INTO outreach_usage (user_id, month)
     VALUES ($1, $2)
     ON CONFLICT (user_id, month) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [userId, month]
  );
  return result.rows[0];
}

export async function getOutreachUsage(user) {
  const usage = await usageForUser(user.id);
  return {
    planAccess: getPlanAccessSummary(user),
    month: usage.month,
    emailsSent: Number(usage.emails_sent || 0),
    smsSent: Number(usage.sms_sent || 0),
    monthlyEmailLimit: getMonthlyEmailLimit(user),
    monthlySmsLimit: getMonthlySmsLimit(user)
  };
}

export function assertOutreachAccess(user, channel, count = 1, { bulk = false } = {}) {
  const canSend = channel === "email" ? canSendEmail(user) : canSendSms(user);
  if (!canSend) {
    const err = new Error("Email and text outreach is available on Pro and Elite plans.");
    err.status = 403;
    throw err;
  }

  if (bulk && channel !== "email" && !canUseBulkMessaging(user)) {
    const err = new Error("Bulk outreach is available on the top plan.");
    err.status = 403;
    throw err;
  }

  const limit = channel === "email" ? getMonthlyEmailLimit(user) : getMonthlySmsLimit(user);
  if (count > limit && limit !== null) {
    const err = new Error("Monthly outreach limit exceeded.");
    err.status = 403;
    throw err;
  }
}

async function assertUsageAvailable(user, channel, count) {
  const usage = await usageForUser(user.id);
  const sent = channel === "email" ? Number(usage.emails_sent || 0) : Number(usage.sms_sent || 0);
  const limit = channel === "email" ? getMonthlyEmailLimit(user) : getMonthlySmsLimit(user);
  if (limit !== null && sent + count > limit) {
    const err = new Error("Monthly outreach limit exceeded.");
    err.status = 403;
    throw err;
  }
  return usage;
}

async function isSuppressed({ channel, email, phone }) {
  const result = await query(
    `SELECT id FROM message_suppression_list
     WHERE channel = $1
       AND (($2::text IS NOT NULL AND lower(email) = lower($2))
         OR ($3::text IS NOT NULL AND phone = $3))
     LIMIT 1`,
    [channel, email || null, phone || null]
  );
  return result.rows.length > 0;
}

export async function suppressContact({ channel, email, phone, reason = "opt_out", source = "manual" }) {
  const normalizedChannel = channel === "sms" ? "sms" : "email";
  const normalizedEmail = clean(email).toLowerCase() || null;
  const normalizedPhone = normalizedChannel === "sms" ? normalizePhone(phone) || null : null;
  const existing = await query(
    `SELECT id FROM message_suppression_list
     WHERE channel = $1
       AND COALESCE(lower(email), '') = COALESCE(lower($2::text), '')
       AND COALESCE(phone, '') = COALESCE($3::text, '')
     LIMIT 1`,
    [normalizedChannel, normalizedEmail, normalizedPhone]
  );
  if (existing.rows[0]) {
    await query(
      `UPDATE message_suppression_list
       SET reason = $2, source = $3, opted_out_at = NOW()
       WHERE id = $1`,
      [existing.rows[0].id, reason, source]
    );
    return;
  }
  await query(
    `INSERT INTO message_suppression_list (channel, email, phone, reason, source, opted_out_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [normalizedChannel, normalizedEmail, normalizedPhone, reason, source]
  );
}

async function incrementUsage(userId, channel, amount = 1) {
  const column = channel === "email" ? "emails_sent" : "sms_sent";
  await query(
    `UPDATE outreach_usage SET ${column} = ${column} + $3, updated_at = NOW()
     WHERE user_id = $1 AND month = $2`,
    [userId, monthKey(), amount]
  );
}

async function logOutreach({ userId, channel, lead, recipientEmail, recipientPhone, subject, body, status, provider = "", providerMessageId = "", errorMessage = "", replyTo = "" }) {
  const dotNumber = lead?.dotNumber || lead?.dot || lead?.dot_number || null;
  const bodyPreview = clean(body).slice(0, 500);
  await query(
    `INSERT INTO outreach_logs (
       user_id, channel, lead_id, carrier_dot, carrier_name, recipient_email,
       recipient_phone, dot_number, subject, body_preview, message_preview, provider,
       reply_to, status, provider_message_id, error_message, sent_at, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW())`,
    [
      userId,
      channel,
      lead?.id || null,
      dotNumber,
      lead?.carrierName || lead?.name || "",
      recipientEmail || null,
      recipientPhone || null,
      dotNumber,
      subject || "",
      bodyPreview,
      bodyPreview,
      provider || "",
      replyTo || "",
      status,
      providerMessageId || "",
      errorMessage || ""
    ]
  );
}

async function sendTwilioSms({ to, body }) {
  const sid = clean(process.env.TWILIO_ACCOUNT_SID);
  const token = clean(process.env.TWILIO_AUTH_TOKEN);
  const from = clean(process.env.TWILIO_PHONE_NUMBER);
  if (!sid || !token || !from) {
    return { success: false, message: "SMS provider is not configured yet." };
  }

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({ To: to, From: from, Body: body })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { success: false, message: data?.message || "SMS provider rejected the message." };
  }
  return { success: true, messageId: data?.sid || "" };
}

export async function sendEmailOutreach({ user, lead = {}, to, subject, body }) {
  const recipientEmail = clean(to || lead.email);
  const replyTo = replyToForUser(user);
  assertOutreachAccess(user, "email");
  if (!recipientEmail) {
    await logOutreach({
      userId: user.id,
      channel: "email",
      lead,
      recipientEmail: null,
      subject,
      body,
      status: "skipped_no_email",
      errorMessage: "Carrier has no email address.",
      replyTo
    });
    return {
      sent: 0,
      skipped: 1,
      skippedNoEmail: 1,
      suppressed: 0,
      failed: 0,
      status: "skipped_no_email",
      carrierName: lead.carrierName || lead.name || "",
      dotNumber: lead.dotNumber || lead.dot || ""
    };
  }
  try {
    assertEmailConfigured(replyTo);
  } catch (err) {
    await logOutreach({
      userId: user.id,
      channel: "email",
      lead,
      recipientEmail,
      subject,
      body,
      status: "failed",
      errorMessage: err.message,
      replyTo
    });
    throw err;
  }
  await assertUsageAvailable(user, "email", 1);
  if (await isSuppressed({ channel: "email", email: recipientEmail })) {
    await logOutreach({ userId: user.id, channel: "email", lead, recipientEmail, subject, body, status: "suppressed", errorMessage: "Recipient opted out.", replyTo });
    return {
      skipped: 1,
      skippedNoEmail: 0,
      suppressed: 1,
      sent: 0,
      failed: 0,
      status: "suppressed",
      message: "Recipient is opted out.",
      carrierName: lead.carrierName || lead.name || "",
      dotNumber: lead.dotNumber || lead.dot || "",
      email: recipientEmail
    };
  }

  const fields = {
    ...userDisplay(user),
    ...lead,
    carrierName: lead.carrierName || lead.name || "",
    contactName: lead.contactName || lead.carrierName || lead.name || "",
    dotNumber: lead.dotNumber || lead.dot || "",
    mcNumber: lead.mcNumber || lead.mc || "",
    phone: lead.phone || "",
    email: recipientEmail,
    state: lead.state || "",
    renewalDate: lead.renewalDate || "",
    cargoHauled: Array.isArray(lead.cargoHauled) ? lead.cargoHauled.join(", ") : (lead.cargoHauled || lead.cargo || ""),
    powerUnits: lead.powerUnits || lead.trucks || "",
    drivers: lead.drivers || "",
    leadType: lead.leadType || "",
    unsubscribeLink: unsubscribeLink({ userId: user.id, email: recipientEmail })
  };
  const renderedSubject = renderTemplate(subject, fields);
  const renderedBody = renderTemplate(body, fields);
  const html = `<div style="font-family:Arial,sans-serif;white-space:pre-wrap">${renderedBody.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`;
  const result = await sendEmailMessage({ to: recipientEmail, subject: renderedSubject, html, text: renderedBody, replyTo });

  if (!result.success) {
    await logOutreach({ userId: user.id, channel: "email", lead, recipientEmail, subject: renderedSubject, body: renderedBody, status: "failed", provider: result.provider || "resend", errorMessage: result.message, replyTo });
    throw Object.assign(new Error(result.message || "Email provider failed."), { status: 503 });
  }

  await incrementUsage(user.id, "email", 1);
  await logOutreach({ userId: user.id, channel: "email", lead, recipientEmail, subject: renderedSubject, body: renderedBody, status: "sent", provider: result.provider || "resend", providerMessageId: result.messageId, replyTo });
  return {
    sent: 1,
    skipped: 0,
    skippedNoEmail: 0,
    suppressed: 0,
    failed: 0,
    status: "sent",
    providerMessageId: result.messageId || "",
    carrierName: lead.carrierName || lead.name || "",
    dotNumber: lead.dotNumber || lead.dot || "",
    email: recipientEmail,
    replyTo
  };
}

export async function sendSmsOutreach({ user, lead = {}, to, body }) {
  const recipientPhone = selectSmsPhone(lead, to);
  assertOutreachAccess(user, "sms");
  await assertUsageAvailable(user, "sms", 1);
  if (!recipientPhone) throw Object.assign(new Error("Recipient phone number is required."), { status: 400 });
  if (await isSuppressed({ channel: "sms", phone: recipientPhone })) {
    await logOutreach({ userId: user.id, channel: "sms", lead, recipientPhone, body, status: "skipped", errorMessage: "Recipient opted out." });
    return { skipped: 1, sent: 0, message: "Recipient is opted out." };
  }

  const fields = {
    ...userDisplay(user),
    ...lead,
    carrierName: lead.carrierName || lead.name || "",
    contactName: lead.contactName || lead.carrierName || lead.name || "",
    dotNumber: lead.dotNumber || lead.dot || "",
    mcNumber: lead.mcNumber || lead.mc || ""
  };
  let renderedBody = renderTemplate(body, fields);
  if (!/reply stop/i.test(renderedBody)) renderedBody = `${renderedBody.trim()} Reply STOP to opt out.`;
  const result = await sendTwilioSms({ to: recipientPhone, body: renderedBody });

  if (!result.success) {
    await logOutreach({ userId: user.id, channel: "sms", lead, recipientPhone, body: renderedBody, status: "failed", errorMessage: result.message });
    throw Object.assign(new Error(result.message || "SMS provider failed."), { status: 503 });
  }

  await incrementUsage(user.id, "sms", 1);
  await logOutreach({ userId: user.id, channel: "sms", lead, recipientPhone, body: renderedBody, status: "sent", providerMessageId: result.messageId });
  return { sent: 1, skipped: 0, providerMessageId: result.messageId || "" };
}

export async function sendBulkEmailOutreach({ user, leads = [], subject, body }) {
  assertOutreachAccess(user, "email", leads.length, { bulk: true });
  const plan = getUserPlan(user);
  const perBatchLimit = plan === "premium" ? 500 : 50;
  if (leads.length > perBatchLimit) {
    throw Object.assign(new Error(`Email selected leads is limited to ${perBatchLimit} carriers per send on your plan.`), { status: 403 });
  }
  const results = [];
  for (const lead of leads) {
    try {
      results.push(await sendEmailOutreach({ user, lead, to: lead.email, subject, body }));
    } catch (err) {
      const failure = {
        sent: 0,
        skipped: 0,
        skippedNoEmail: 0,
        suppressed: 0,
        failed: 1,
        status: "failed",
        carrierName: lead.carrierName || lead.name || "",
        dotNumber: lead.dotNumber || lead.dot || "",
        email: lead.email || "",
        error: err.message
      };
      results.push(failure);
    }
  }
  return {
    sent: results.reduce((sum, item) => sum + Number(item.sent || 0), 0),
    skipped: results.reduce((sum, item) => sum + Number(item.skipped || 0), 0),
    skippedNoEmail: results.reduce((sum, item) => sum + Number(item.skippedNoEmail || 0), 0),
    suppressed: results.reduce((sum, item) => sum + Number(item.suppressed || 0), 0),
    failed: results.reduce((sum, item) => sum + Number(item.failed || (item.error ? 1 : 0)), 0),
    results
  };
}

export async function sendBulkSmsOutreach({ user, leads = [], body }) {
  assertOutreachAccess(user, "sms", leads.length, { bulk: true });
  await assertUsageAvailable(user, "sms", leads.length);
  const results = [];
  for (const lead of leads) {
    try {
      results.push(await sendSmsOutreach({ user, lead, body }));
    } catch (err) {
      results.push({ sent: 0, skipped: 0, error: err.message });
    }
  }
  return {
    sent: results.reduce((sum, item) => sum + Number(item.sent || 0), 0),
    skipped: results.reduce((sum, item) => sum + Number(item.skipped || 0), 0),
    failed: results.filter((item) => item.error).length,
    results
  };
}

export async function listOutreachLogs(user, limit = 50) {
  const result = await query(
    `SELECT * FROM outreach_logs WHERE user_id = $1 ORDER BY sent_at DESC LIMIT $2`,
    [user.id, limit]
  );
  return result.rows;
}
