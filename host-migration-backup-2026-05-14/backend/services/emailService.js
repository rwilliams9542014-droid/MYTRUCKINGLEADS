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

async function sendEmailMessage({ to, subject, html, text, replyTo = null, headers = null }) {
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
      basic: { price: "$79/month after a 3-day trial", features: ["1 user", "1 state", "New DOT leads", "Basic renewal access", "Carrier profile and FMCSA data", "Basic CRM", "Limited exports", "30-day lead history"] },
      pro: { price: "$199/month after a 3-day trial", features: ["1 state", "Unlimited lead searches", "Renewal intelligence", "FMCSA/SMS", "Licensing and insurance", "CRM pipeline", "Exports", "Advanced and cargo filters", "Follow-up tracking", "90-day lead history"] },
      premium: { price: "$499/month after a 3-day trial", features: ["Everything in Pro", "Multiple users", "Team CRM", "Shared pipeline", "Unlimited exports", "Future API access", "Future alerts and integrations", "Premium support"] }
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
