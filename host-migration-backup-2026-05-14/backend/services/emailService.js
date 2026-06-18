/**
 * Email Service
 * 
 * Handles sending subscription confirmation and failure emails
 * Uses Nodemailer to send emails via SMTP
 * 
 * Environment variables required:
 * - SMTP_HOST: SMTP server hostname (e.g., smtp.gmail.com)
 * - SMTP_PORT: SMTP port (e.g., 587)
 * - SMTP_USER: Email address for authentication
 * - SMTP_PASS: Email password or app-specific password
 * - SMTP_FROM: Email address to show as sender
 * - APP_NAME: Application name (for email templates)
 * - APP_URL: Base URL for email links
 * 
 * Example .env for Gmail:
 * SMTP_HOST=smtp.gmail.com
 * SMTP_PORT=587
 * SMTP_USER=your-email@gmail.com
 * SMTP_PASS=your-app-specific-password
 * SMTP_FROM=noreply@mytruckingleads.com
 * APP_NAME=MyTruckingLeads
 * APP_URL=https://yourdomain.com
 */

import nodemailer from "nodemailer";

// Create transporter once at startup
let transporter = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function initializeTransporter() {
  if (transporter) return transporter;

  const provider = getEmailProvider();
  if (provider === "resend") {
    const resendFrom = getSenderAddress("resend");
    if (!resendFrom) {
      console.warn("Email service is configured for Resend, but no sender address is set.");
      console.warn("Set RESEND_FROM_EMAIL or EMAIL_FROM to enable email delivery.");
      return null;
    }

    transporter = {
      async sendMail({ to, subject, html, text, replyTo = null, headers = null }) {
        const result = await sendViaResend({
          from: resendFrom,
          to,
          subject,
          html,
          text,
          replyTo,
          headers
        });

        if (!result.success) {
          throw new Error(result.message || "Resend email failed");
        }

        return {
          messageId: result.messageId || null,
          response: result.message || "Resend email queued"
        };
      },
      async verify() {
        return true;
      }
    };

    console.log("Email service ready via Resend");
    return transporter;
  }

  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpConnectHost = process.env.SMTP_RESOLVED_HOST || smtpHost;
  const smtpTlsServerName = process.env.SMTP_TLS_SERVERNAME || smtpHost;
  const smtpFamily = process.env.SMTP_ADDRESS_FAMILY
    ? parsePositiveInt(process.env.SMTP_ADDRESS_FAMILY, 4)
    : 4;

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
    console.warn("⚠️  Email service not configured. Emails will not be sent.");
    console.warn("Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS environment variables to enable emails.");
    return null;
  }

  try {
    transporter = nodemailer.createTransport({
      host: smtpConnectHost,
      port: parseInt(smtpPort),
      secure: parseInt(smtpPort) === 465, // Use TLS for port 465, STARTTLS for others
      family: smtpFamily,
      connectionTimeout: parsePositiveInt(process.env.SMTP_CONNECTION_TIMEOUT_MS, 15000),
      greetingTimeout: parsePositiveInt(process.env.SMTP_GREETING_TIMEOUT_MS, 15000),
      socketTimeout: parsePositiveInt(process.env.SMTP_SOCKET_TIMEOUT_MS, 20000),
      tls: {
        servername: smtpTlsServerName
      },
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    // Verify connection
    transporter.verify((err, success) => {
      if (err) {
        console.error("❌ Email configuration error:", err.message);
        transporter = null;
      } else if (success) {
        console.log("✅ Email service ready");
      }
    });

    return transporter;
  } catch (err) {
    console.error("❌ Failed to initialize email transporter:", err.message);
    return null;
  }
}

function hasResendConfig() {
  return Boolean(String(process.env.RESEND_API_KEY || "").trim());
}

function hasSmtpConfig() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getEmailProvider() {
  const preferred = String(process.env.EMAIL_PROVIDER || "auto").trim().toLowerCase();

  if (preferred === "resend") {
    return hasResendConfig() ? "resend" : null;
  }

  if (preferred === "smtp") {
    return hasSmtpConfig() ? "smtp" : null;
  }

  if (hasResendConfig()) return "resend";
  if (hasSmtpConfig()) return "smtp";
  return null;
}

function formatFromAddress(email, name = "") {
  const normalizedEmail = String(email || "").trim();
  if (!normalizedEmail) return "";
  if (normalizedEmail.includes("<") && normalizedEmail.includes(">")) return normalizedEmail;

  const normalizedName = String(name || "").trim();
  return normalizedName ? `${normalizedName} <${normalizedEmail}>` : normalizedEmail;
}

function getSenderAddress(provider) {
  if (provider === "resend") {
    const fromEmail = String(process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || "").trim();
    const fromName = String(process.env.RESEND_FROM_NAME || process.env.APP_NAME || "MyTruckingLeads").trim();
    return formatFromAddress(fromEmail, fromName);
  }

  const fromEmail = String(process.env.SMTP_FROM || process.env.SMTP_USER || process.env.EMAIL_FROM || "").trim();
  const fromName = String(process.env.SMTP_FROM_NAME || process.env.APP_NAME || "").trim();
  return formatFromAddress(fromEmail, fromName);
}

function parseProviderResponse(rawText) {
  if (!rawText) return null;

  try {
    return JSON.parse(rawText);
  } catch (err) {
    return { message: rawText };
  }
}

async function sendViaResend({ from, to, subject, html, text, replyTo = null, headers = null }) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    return { success: false, message: "Resend API key is not configured" };
  }

  const payload = {
    from,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text
  };

  if (replyTo) {
    payload.reply_to = Array.isArray(replyTo) ? replyTo : [replyTo];
  }

  if (headers && Object.keys(headers).length) {
    payload.headers = headers;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const rawText = await response.text();
    const data = parseProviderResponse(rawText);
    const errorMessage = data?.error?.message || data?.message || rawText || `HTTP ${response.status}`;

    if (!response.ok) {
      return {
        success: false,
        message: `Resend error: ${errorMessage}`
      };
    }

    return {
      success: true,
      provider: "resend",
      messageId: data?.id || null,
      message: data?.id ? `Resend email queued (${data.id})` : "Resend email queued"
    };
  } catch (err) {
    return {
      success: false,
      message: `Error: ${err.message}`
    };
  }
}

async function sendViaSmtp({ from, to, subject, html, text, replyTo = null, headers = null }) {
  const transport = initializeTransporter();
  if (!transport) {
    return { success: false, message: "Email service not configured" };
  }

  try {
    const result = await transport.sendMail({
      from,
      to,
      subject,
      html,
      text,
      ...(replyTo ? { replyTo } : {}),
      ...(headers && Object.keys(headers).length ? { headers } : {})
    });

    return {
      success: true,
      provider: "smtp",
      messageId: result.messageId || null,
      message: result.messageId ? `SMTP email sent (${result.messageId})` : "SMTP email sent"
    };
  } catch (err) {
    return {
      success: false,
      message: `Error: ${err.message}`
    };
  }
}

export async function sendEmailMessage({ to, subject, html, text, replyTo = null, headers = null }) {
  const provider = getEmailProvider();
  if (!provider) {
    return { success: false, message: "Email service not configured" };
  }

  const from = getSenderAddress(provider);
  if (!from) {
    return {
      success: false,
      message: provider === "resend"
        ? "Resend is configured, but RESEND_FROM_EMAIL is missing"
        : "Email service is configured, but no sender address is set"
    };
  }

  if (provider === "resend") {
    return sendViaResend({ from, to, subject, html, text, replyTo, headers });
  }

  return sendViaSmtp({ from, to, subject, html, text, replyTo, headers });
}

// HTML Email Templates
const emailTemplates = {
  subscriptionConfirmation: (userName, plan, renewalDate, appName, appUrl) => {
    const planDetails = {
      basic: { price: "$149.99/month after a 3-day trial", features: ["1 included state", "Renewal leads up to 60 days out", "New DOT leads from the last 30 days", "Carrier intelligence", "Kanban and table CRM views", "Lead Desk CSV exports up to 100/day and 1,000/month"] },
      pro: { price: "$149.99/month after a 3-day trial", features: ["1 included state", "Additional states at $49.99/month each", "Additional users at $19.99/month each", "Renewal leads up to 60 days out", "New DOT leads from the last 30 days", "Carrier intelligence", "Kanban and table CRM views", "Lead Desk CSV exports up to 100/day and 1,000/month"] },
      premium: { price: "$149.99/month after a 3-day trial", features: ["1 included state", "Renewal leads up to 60 days out", "New DOT leads from the last 30 days", "Carrier intelligence", "Kanban and table CRM views", "Lead Desk CSV exports up to 100/day and 1,000/month"] }
    };

    const details = planDetails[plan] || planDetails.basic;

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .plan-box { background: white; padding: 20px; margin: 20px 0; border-left: 4px solid #667eea; border-radius: 4px; }
            .plan-name { font-size: 24px; font-weight: bold; color: #667eea; text-transform: capitalize; }
            .plan-price { font-size: 18px; color: #666; margin: 10px 0; }
            .features { list-style: none; padding: 0; }
            .features li { padding: 8px 0; color: #666; }
            .features li:before { content: "✓ "; color: #667eea; font-weight: bold; margin-right: 8px; }
            .renewal-info { background: #e8f4f8; padding: 15px; border-radius: 4px; margin: 20px 0; color: #0066cc; }
            .button { background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; }
            .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to ${appName}!</h1>
              <p>Your subscription is active</p>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              
              <p>Thank you for subscribing to ${appName}! Your ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan is now active and ready to use.</p>
              
              <div class="plan-box">
                <div class="plan-name">${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan</div>
                <div class="plan-price">${details.price}</div>
                <ul class="features">
                  ${details.features.map(f => `<li>${f}</li>`).join("")}
                </ul>
              </div>
              
              <div class="renewal-info">
                <strong>Next billing date:</strong> ${renewalDate}
              </div>
              
              <p>You can now access all features of your plan immediately.</p>
              
              <a href="${appUrl}/app-dashboard.html" class="button">Go to Dashboard</a>
              
              <p>If you have any questions, reply to this email or visit our support center.</p>
              
              <p>Best regards,<br><strong>${appName} Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  },

  paymentFailed: (userName, plan, reason, appName, appUrl) => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #ff6b6b; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .alert-box { background: #ffe0e0; padding: 15px; border-left: 4px solid #ff6b6b; border-radius: 4px; margin: 20px 0; color: #c92a2a; }
            .button { background: #ff6b6b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0; }
            .button-secondary { background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 0 10px 0 0; }
            .footer { text-align: center; color: #999; font-size: 12px; margin-top: 20px; border-top: 1px solid #ddd; padding-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payment Failed</h1>
              <p>We need your attention</p>
            </div>
            <div class="content">
              <p>Hi ${userName},</p>
              
              <div class="alert-box">
                <strong>⚠️ Payment Declined</strong><br>
                Your payment for the ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan could not be processed.
              </div>
              
              <p><strong>Reason:</strong> ${reason || "Please check your payment details and try again."}</p>
              
              <p>To keep your ${plan} plan active, please update your payment method:</p>
              
              <a href="${appUrl}/app-dashboard.html" class="button">Update Payment Method</a>
              
              <p>If you continue to experience issues, please <a href="mailto:support@${appName.toLowerCase().replace(/\\s/g, "")}.com">contact support</a>.</p>
              
              <p><strong>Note:</strong> Your access may be limited until payment is resolved.</p>
              
              <p>Best regards,<br><strong>${appName} Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  },

  teamInvite: ({ inviteeName, ownerName, agencyName, planName, inviteUrl, expiresLabel, appName }) => {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #1f2933; }
            .container { max-width: 620px; margin: 0 auto; padding: 24px; }
            .header { background: #123f7a; color: white; padding: 28px; border-radius: 10px 10px 0 0; text-align: center; }
            .content { background: #f6f9fc; padding: 30px; border-radius: 0 0 10px 10px; }
            .card { background: white; border: 1px solid #d9e2ec; border-radius: 10px; padding: 20px; margin: 20px 0; }
            .button { background: #1f6feb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; }
            .meta { color: #52606d; font-size: 14px; }
            .footer { color: #7b8794; font-size: 12px; margin-top: 20px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0 0 8px;">You were invited to ${escapeHtml(appName)}</h1>
              <p style="margin: 0;">Create your login to join ${escapeHtml(agencyName || ownerName || appName)}.</p>
            </div>
            <div class="content">
              <p>Hi ${escapeHtml(inviteeName || "there")},</p>
              <p>${escapeHtml(ownerName || "An account owner")} invited you to join the ${escapeHtml(planName || "Agency Unlimited")} workspace on ${escapeHtml(appName)}.</p>

              <div class="card">
                <div><strong>Agency:</strong> ${escapeHtml(agencyName || ownerName || appName)}</div>
                <div><strong>Account owner:</strong> ${escapeHtml(ownerName || "Account owner")}</div>
                <div><strong>Access:</strong> ${escapeHtml(planName || "Team access")}</div>
                <div><strong>Invite expires:</strong> ${escapeHtml(expiresLabel)}</div>
              </div>

              <p>Use the button below to create your username and password:</p>
              <p><a class="button" href="${escapeHtml(inviteUrl)}">Create team login</a></p>
              <p class="meta">If the button does not work, copy and paste this link into your browser:</p>
              <p class="meta"><a href="${escapeHtml(inviteUrl)}">${escapeHtml(inviteUrl)}</a></p>

              <p>If you were not expecting this invite, you can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ${escapeHtml(appName)}. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
};

/**
 * Send subscription confirmation email
 */
export async function sendSubscriptionConfirmation({ email, userName, plan, renewalDate }) {
  const transport = initializeTransporter();
  if (!transport) {
    console.warn(`⚠️  Email not sent to ${email} (service not configured)`);
    return false;
  }

  try {
    const appName = process.env.APP_NAME || "MyTruckingLeads";
    const appUrl = process.env.APP_URL || "https://mytruckingleads.com";
    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;

    const htmlContent = emailTemplates.subscriptionConfirmation(
      userName,
      plan,
      renewalDate,
      appName,
      appUrl
    );

    const result = await transport.sendMail({
      from: fromEmail,
      to: email,
      subject: `Welcome! Your ${plan} subscription is active - ${appName}`,
      html: htmlContent,
      text: `Welcome! Your ${plan} subscription is active. Next billing date: ${renewalDate}`
    });

    console.log(`✅ Subscription confirmation sent to ${email} (Message ID: ${result.messageId})`);
    return true;
  } catch (err) {
    console.error(`❌ Error sending confirmation to ${email}:`, err.message);
    return false;
  }
}

export async function sendTrialStartedEmail({ email, userName, planName, trialEndAt, planPrice, billingInterval = "monthly" }) {
  const appName = process.env.APP_NAME || "MyTruckingLeads";
  const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || "https://www.mytruckingleads.com";
  const trialEndLabel = trialEndAt ? new Date(trialEndAt).toLocaleDateString("en-US") : "the end of your trial";
  const priceLabel = planPrice == null ? "your selected plan price" : `$${Number(planPrice).toLocaleString()}`;
  const subject = `Your ${appName} free trial has started`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
      <h2>Your free trial has started</h2>
      <p>Hello ${escapeHtml(userName || "there")},</p>
      <p>Your ${escapeHtml(planName || "selected")} plan trial is active until ${escapeHtml(trialEndLabel)}.</p>
      <p>After the trial, your subscription will automatically renew at ${escapeHtml(priceLabel)} per ${escapeHtml(billingInterval)} unless you cancel before the trial ends.</p>
      <p>You can cancel from your account billing page: <a href="${escapeHtml(`${appUrl}/settings`)}">${escapeHtml(`${appUrl}/settings`)}</a></p>
      <p>If you need help, reply to this email or contact support.</p>
    </div>
  `;
  const text = [
    `Your ${appName} free trial has started.`,
    `Plan: ${planName || "selected plan"}`,
    `Trial ends: ${trialEndLabel}`,
    `After the trial: ${priceLabel} per ${billingInterval}`,
    `Cancel before the trial ends from ${appUrl}/settings to avoid future charges.`
  ].join("\n");

  const result = await sendEmailMessage({ to: email, subject, html, text });
  if (!result.success) {
    console.warn(`Email provider not configured. Trial started email not sent to ${email}.`);
  }
  return result;
}

/**
 * Send payment failed email
 */
export async function sendPaymentFailedNotification({ email, userName, plan, reason }) {
  const transport = initializeTransporter();
  if (!transport) {
    console.warn(`⚠️  Email not sent to ${email} (service not configured)`);
    return false;
  }

  try {
    const appName = process.env.APP_NAME || "MyTruckingLeads";
    const appUrl = process.env.APP_URL || "https://mytruckingleads.com";
    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;

    const htmlContent = emailTemplates.paymentFailed(
      userName,
      plan,
      reason,
      appName,
      appUrl
    );

    const result = await transport.sendMail({
      from: fromEmail,
      to: email,
      subject: `Payment Failed - Action Required - ${appName}`,
      html: htmlContent,
      text: `Your payment for the ${plan} plan failed. Reason: ${reason || "Unknown"}. Please update your payment method.`
    });

    console.log(`✅ Payment failure notification sent to ${email} (Message ID: ${result.messageId})`);
    return true;
  } catch (err) {
    console.error(`❌ Error sending payment failed notification to ${email}:`, err.message);
    return false;
  }
}

/**
 * Send test email (for verification)
 */
export async function sendTestEmail(testEmail) {
  const transport = initializeTransporter();
  if (!transport) {
    return { success: false, message: "Email service not configured" };
  }

  try {
    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
    const appName = process.env.APP_NAME || "MyTruckingLeads";

    const result = await transport.sendMail({
      from: fromEmail,
      to: testEmail,
      subject: `Test Email - ${appName}`,
      html: `<h2>This is a test email from ${appName}</h2><p>If you received this, your email configuration is working correctly!</p>`
    });

    return { 
      success: true, 
      message: `Test email sent successfully (ID: ${result.messageId})` 
    };
  } catch (err) {
    return { 
      success: false, 
      message: `Error: ${err.message}` 
    };
  }
}

export async function sendTeamInviteEmail({
  toEmail,
  inviteeName,
  ownerName,
  agencyName,
  planName,
  inviteUrl,
  expiresAt
}) {
  const transport = initializeTransporter();
  if (!transport) {
    console.warn(`Email not sent to ${toEmail} (service not configured)`);
    return false;
  }

  try {
    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
    const appName = process.env.APP_NAME || "MyTruckingLeads";
    const expiresLabel = expiresAt
      ? new Date(expiresAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
      : "7 days";

    const html = emailTemplates.teamInvite({
      inviteeName,
      ownerName,
      agencyName,
      planName,
      inviteUrl,
      expiresLabel,
      appName
    });

    const text = [
      `${ownerName || "An account owner"} invited you to join ${agencyName || appName} on ${appName}.`,
      `Create your login here: ${inviteUrl}`,
      `Invite expires: ${expiresLabel}`
    ].join("\n");

    const result = await transport.sendMail({
      from: fromEmail,
      to: toEmail,
      subject: `Create your ${appName} team login`,
      html,
      text
    });

    console.log(`Invite email sent to ${toEmail} (Message ID: ${result.messageId})`);
    return true;
  } catch (err) {
    console.error(`Error sending team invite to ${toEmail}:`, err.message);
    return false;
  }
}

export async function sendContactRequestEmail({
  toEmail,
  name,
  email,
  phone = "",
  agency = "",
  message,
  submittedAt,
  sourcePage = ""
}) {
  const transport = initializeTransporter();
  if (!transport) {
    return { success: false, message: "Email service not configured" };
  }

  try {
    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
    const appName = process.env.APP_NAME || "MyTruckingLeads";
    const submittedLabel = submittedAt ? new Date(submittedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Unknown";
    const escapedMessage = String(message || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #172033; line-height: 1.6;">
        <h2 style="margin-bottom: 12px;">New Contact Request</h2>
        <p style="margin-top: 0;">A new website contact request was submitted on ${appName}.</p>
        <table style="border-collapse: collapse; width: 100%; max-width: 720px; margin: 18px 0;">
          <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Name</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${name}</td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Email</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;"><a href="mailto:${email}">${email}</a></td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Phone</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${phone || "Not provided"}</td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Agency</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${agency || "Not provided"}</td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Submitted</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${submittedLabel}</td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Source</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${sourcePage || "Website contact form"}</td></tr>
        </table>
        <div style="padding: 16px; border: 1px solid #dbe4f0; border-radius: 12px; background: #f8fbff;">
          <div style="font-weight: 700; margin-bottom: 8px;">Message</div>
          <div>${escapedMessage}</div>
        </div>
      </div>
    `;

    const text = [
      "New Contact Request",
      `Name: ${name}`,
      `Email: ${email}`,
      `Phone: ${phone || "Not provided"}`,
      `Agency: ${agency || "Not provided"}`,
      `Submitted: ${submittedLabel}`,
      `Source: ${sourcePage || "Website contact form"}`,
      "",
      "Message:",
      message
    ].join("\n");

    const result = await transport.sendMail({
      from: fromEmail,
      to: toEmail,
      replyTo: email,
      subject: `New contact request from ${name} - ${appName}`,
      html,
      text
    });

    return {
      success: true,
      message: `Contact request sent successfully (ID: ${result.messageId})`
    };
  } catch (err) {
    return {
      success: false,
      message: `Error: ${err.message}`
    };
  }
}

function formatPrivacyRequestType(requestType = "") {
  switch (String(requestType || "").trim().toLowerCase()) {
    case "access":
      return "Access / know what data you have";
    case "correction":
      return "Correction / update my information";
    case "export":
      return "Export / copy of my information";
    case "deletion":
      return "Deletion / remove my information";
    case "opt_out":
      return "Opt out of marketing / tracking";
    default:
      return "Other privacy request";
  }
}

export async function sendPrivacyRequestEmail({
  toEmail,
  requestType,
  name,
  email,
  accountEmail = "",
  location = "",
  details,
  submittedAt,
  sourcePage = ""
}) {
  const transport = initializeTransporter();
  if (!transport) {
    return { success: false, message: "Email service not configured" };
  }

  try {
    const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.RESEND_FROM_EMAIL;
    const appName = process.env.APP_NAME || "MyTruckingLeads";
    const submittedLabel = submittedAt ? new Date(submittedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "Unknown";
    const requestLabel = formatPrivacyRequestType(requestType);
    const escapedDetails = escapeHtml(details).replace(/\n/g, "<br>");

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #172033; line-height: 1.6;">
        <h2 style="margin-bottom: 12px;">New Privacy Request</h2>
        <p style="margin-top: 0;">A privacy request was submitted on ${escapeHtml(appName)}.</p>
        <table style="border-collapse: collapse; width: 100%; max-width: 760px; margin: 18px 0;">
          <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Request type</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(requestLabel)}</td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Name</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(name)}</td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Reply email</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Account email</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${accountEmail ? `<a href="mailto:${escapeHtml(accountEmail)}">${escapeHtml(accountEmail)}</a>` : "Not provided"}</td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">State / country</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(location || "Not provided")}</td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Submitted</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(submittedLabel)}</td></tr>
          <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Source</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(sourcePage || "Website privacy request form")}</td></tr>
        </table>
        <div style="padding: 16px; border: 1px solid #dbe4f0; border-radius: 12px; background: #f8fbff;">
          <div style="font-weight: 700; margin-bottom: 8px;">Request details</div>
          <div>${escapedDetails}</div>
        </div>
      </div>
    `;

    const text = [
      "New Privacy Request",
      `Request type: ${requestLabel}`,
      `Name: ${name}`,
      `Reply email: ${email}`,
      `Account email: ${accountEmail || "Not provided"}`,
      `State / country: ${location || "Not provided"}`,
      `Submitted: ${submittedLabel}`,
      `Source: ${sourcePage || "Website privacy request form"}`,
      "",
      "Request details:",
      details
    ].join("\n");

    const result = await transport.sendMail({
      from: fromEmail,
      to: toEmail,
      replyTo: accountEmail || email,
      subject: `Privacy request: ${requestLabel} - ${name} - ${appName}`,
      html,
      text
    });

    return {
      success: true,
      message: `Privacy request sent successfully (ID: ${result.messageId})`
    };
  } catch (err) {
    return {
      success: false,
      message: `Error: ${err.message}`
    };
  }
}

export async function sendMarketplaceAdminLeadEmail({
  toEmail,
  quoteRequest
}) {
  const appName = process.env.APP_NAME || "MyTruckingLeads";
  const appUrl = process.env.APP_URL || "https://www.mytruckingleads.com";
  const subject = `New marketplace quote request: ${quoteRequest.company_name} - ${appName}`;
  const submittedLabel = quoteRequest.created_at
    ? new Date(quoteRequest.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : "Just now";

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #172033; line-height: 1.6;">
      <h2 style="margin-bottom: 12px;">New Quote Request Marketplace Lead</h2>
      <p style="margin-top: 0;">A new trucking insurance quote request was submitted on ${escapeHtml(appName)}.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 760px; margin: 18px 0;">
        <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Company</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(quoteRequest.company_name)}</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Lead tier</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(quoteRequest.lead_tier)}</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Lead score</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(quoteRequest.lead_score)}</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Fleet size</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(quoteRequest.power_units || 0)} power units</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">State</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(quoteRequest.primary_state || "Multi-state")}</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Renewal date</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(quoteRequest.renewal_date || "Not provided")}</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Documents</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(quoteRequest.document_count || 0)} uploaded (${escapeHtml(quoteRequest.document_completion_percent || 0)}% complete)</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Submitted</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(submittedLabel)}</td></tr>
      </table>
      <p><a href="${escapeHtml(`${appUrl}/admin-leads.html`)}">Open admin lead management</a></p>
    </div>
  `;

  const text = [
    "New Quote Request Marketplace Lead",
    `Company: ${quoteRequest.company_name}`,
    `Lead tier: ${quoteRequest.lead_tier}`,
    `Lead score: ${quoteRequest.lead_score}`,
    `Fleet size: ${quoteRequest.power_units || 0} power units`,
    `State: ${quoteRequest.primary_state || "Multi-state"}`,
    `Renewal date: ${quoteRequest.renewal_date || "Not provided"}`,
    `Documents: ${quoteRequest.document_count || 0} uploaded (${quoteRequest.document_completion_percent || 0}% complete)`,
    `Submitted: ${submittedLabel}`,
    `Admin: ${appUrl}/admin-leads.html`
  ].join("\n");

  return sendEmailMessage({ to: toEmail, subject, html, text });
}

export async function sendMarketplaceGoldLeadAlertEmail({
  toEmail,
  recipientName,
  quoteRequest
}) {
  const appName = process.env.APP_NAME || "MyTruckingLeads";
  const appUrl = process.env.APP_URL || "https://www.mytruckingleads.com";
  const subject = `New Gold trucking lead available - ${appName}`;

  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #172033; line-height: 1.6;">
      <h2 style="margin-bottom: 12px;">New Gold Lead Available</h2>
      <p>Hi ${escapeHtml(recipientName || "there")},</p>
      <p>A new Gold trucking insurance lead is now available in the marketplace.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 760px; margin: 18px 0;">
        <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Lead score</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(quoteRequest.lead_score)}</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Fleet size</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(quoteRequest.power_units || 0)} power units</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">State</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(quoteRequest.primary_state || "Multi-state")}</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Cargo</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(quoteRequest.cargo_hauled || "Not provided")}</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Renewal date</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(quoteRequest.renewal_date || "Not provided")}</td></tr>
        <tr><td style="padding: 8px 12px; border: 1px solid #dbe4f0; font-weight: 700;">Documents</td><td style="padding: 8px 12px; border: 1px solid #dbe4f0;">${escapeHtml(quoteRequest.document_count || 0)} uploaded (${escapeHtml(quoteRequest.document_completion_percent || 0)}% complete)</td></tr>
      </table>
      <p><a href="${escapeHtml(`${appUrl}/lead-marketplace.html`)}">Open the lead marketplace</a></p>
    </div>
  `;

  const text = [
    `Hi ${recipientName || "there"},`,
    "",
    "A new Gold trucking insurance lead is available in the marketplace.",
    `Lead score: ${quoteRequest.lead_score}`,
    `Fleet size: ${quoteRequest.power_units || 0} power units`,
    `State: ${quoteRequest.primary_state || "Multi-state"}`,
    `Cargo: ${quoteRequest.cargo_hauled || "Not provided"}`,
    `Renewal date: ${quoteRequest.renewal_date || "Not provided"}`,
    `Documents: ${quoteRequest.document_count || 0} uploaded (${quoteRequest.document_completion_percent || 0}% complete)`,
    "",
    `${appUrl}/lead-marketplace.html`
  ].join("\n");

  return sendEmailMessage({ to: toEmail, subject, html, text });
}
