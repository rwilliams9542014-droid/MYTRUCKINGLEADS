import { query } from "../config/db.js";
import {
  getDefaultTemplates,
  getOutreachUsage,
  listOutreachLogs,
  renderTemplate,
  sendBulkEmailOutreach,
  sendBulkSmsOutreach,
  sendEmailOutreach,
  sendSmsOutreach,
  suppressContact,
  verifyUnsubscribeToken
} from "../services/outreachService.js";

async function hydrateUser(user) {
  const result = await query(
    `SELECT id, name, first_name, last_name, email, phone, business_name,
            plan, role, subscription_status, subscription_expires_at,
            trial_ends_at, team_owner_user_id, team_member_role
     FROM users WHERE id = $1`,
    [user.id]
  );
  return { ...user, ...(result.rows[0] || {}) };
}

function normalizeLead(payload = {}) {
  const lead = payload.lead || payload.carrier || payload;
  return {
    ...lead,
    id: lead.id || payload.leadId || null,
    dotNumber: lead.dotNumber || lead.dot || lead.dot_number || payload.dotNumber || "",
    mcNumber: lead.mcNumber || lead.mc || lead.mc_number || "",
    carrierName: lead.carrierName || lead.name || lead.carrier_name || payload.carrierName || "",
    contactName: lead.contactName || lead.contact_name || "",
    email: lead.email || payload.to || "",
    phone: lead.phone || payload.to || "",
    renewalDate: lead.renewalDate || lead.renewalDisplay?.date || "",
    renewalDateSource: lead.renewalDateSource || lead.renewalDisplay?.label || ""
  };
}

function sendError(res, err) {
  res.status(err.status || 500).json({ error: err.message || "Outreach request failed." });
}

export async function getTemplates(req, res) {
  res.json({ templates: getDefaultTemplates() });
}

export async function getUsage(req, res) {
  try {
    res.json(await getOutreachUsage(await hydrateUser(req.user)));
  } catch (err) {
    sendError(res, err);
  }
}

export async function getLogs(req, res) {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    res.json({ logs: await listOutreachLogs(req.user, limit) });
  } catch (err) {
    sendError(res, err);
  }
}

export async function previewMessage(req, res) {
  try {
    const user = await hydrateUser(req.user);
    const lead = normalizeLead(req.body);
    const fields = {
      agencyName: user.business_name || "MyTruckingLeads",
      agentName: user.name || [user.first_name, user.last_name].filter(Boolean).join(" ") || "Your insurance agent",
      agentEmail: user.email || "",
      agentPhone: user.phone || "",
      ...lead,
      carrierName: lead.carrierName || lead.name || "",
      contactName: lead.contactName || lead.carrierName || lead.name || "",
      dotNumber: lead.dotNumber || lead.dot || "",
      mcNumber: lead.mcNumber || lead.mc || "",
      unsubscribeLink: "[unsubscribe link]"
    };
    res.json({
      subject: renderTemplate(req.body.subject || "", fields),
      body: renderTemplate(req.body.body || "", fields)
    });
  } catch (err) {
    sendError(res, err);
  }
}

export async function sendEmail(req, res) {
  try {
    const user = await hydrateUser(req.user);
    const result = await sendEmailOutreach({
      user,
      lead: normalizeLead(req.body),
      to: req.body.to,
      subject: req.body.subject,
      body: req.body.body
    });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
}

export async function sendSms(req, res) {
  try {
    const user = await hydrateUser(req.user);
    const result = await sendSmsOutreach({
      user,
      lead: normalizeLead(req.body),
      to: req.body.to,
      body: req.body.body
    });
    res.json(result);
  } catch (err) {
    sendError(res, err);
  }
}

export async function sendBulkEmail(req, res) {
  try {
    const user = await hydrateUser(req.user);
    const leads = Array.isArray(req.body.leads) ? req.body.leads.map(normalizeLead) : [];
    res.json(await sendBulkEmailOutreach({ user, leads, subject: req.body.subject, body: req.body.body }));
  } catch (err) {
    sendError(res, err);
  }
}

export async function sendBulkSms(req, res) {
  try {
    const user = await hydrateUser(req.user);
    const leads = Array.isArray(req.body.leads) ? req.body.leads.map(normalizeLead) : [];
    res.json(await sendBulkSmsOutreach({ user, leads, body: req.body.body }));
  } catch (err) {
    sendError(res, err);
  }
}

export async function optOutContact(req, res) {
  try {
    await suppressContact({
      channel: req.body.channel,
      email: req.body.email,
      phone: req.body.phone,
      reason: req.body.reason || "manual",
      source: "app"
    });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
}

export async function smsWebhook(req, res) {
  try {
    const body = String(req.body.Body || req.body.body || "").trim();
    const from = String(req.body.From || req.body.from || "").trim();
    if (/^(stop|stopall|unsubscribe|cancel|end|quit)$/i.test(body) && from) {
      await suppressContact({ channel: "sms", phone: from, reason: "sms_stop", source: "twilio_webhook" });
    }
    res.type("text/xml").send("<Response></Response>");
  } catch {
    res.type("text/xml").status(500).send("<Response></Response>");
  }
}

export async function unsubscribeEmail(req, res) {
  try {
    const token = req.params.token;
    const email = String(req.query.email || "").trim().toLowerCase();
    const userId = Number(req.query.uid);
    if (!email || !userId || !verifyUnsubscribeToken({ userId, email, token })) {
      return res.status(400).send("Unsubscribe link is invalid or expired.");
    }
    await suppressContact({ channel: "email", email, reason: "unsubscribe", source: "email_link" });
    res.send("You have been unsubscribed.");
  } catch {
    res.status(500).send("Unsubscribe could not be completed.");
  }
}
