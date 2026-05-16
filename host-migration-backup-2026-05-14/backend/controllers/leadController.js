import { query } from "../config/db.js";
import { getPlanAccessSummary, requirePaidPlan } from "../utils/planAccess.js";
import { getTrialUsage, incrementTrialUsage } from "../utils/trialAccess.js";
import { normalizeUSStateCode } from "../utils/usStates.js";

const LEAD_STATUSES = new Set([
  "New",
  "New Lead",
  "Called",
  "Quoted",
  "Follow Up",
  "Negotiation",
  "Won",
  "Lost"
]);

function normalizeLeadStatus(status) {
  if (!status || status === "New Lead") return "New";
  if (status === "Contacted") return "Called";
  return LEAD_STATUSES.has(status) ? status : null;
}

function extractNoteValue(notes = "", label) {
  const match = String(notes || "").match(new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\s+[A-Z][A-Za-z ]+:|$)`, "i"));
  return match?.[1]?.trim().replace(/[.。]+$/, "").trim() || "";
}

function enforceSavedLeadState(req, res, notes, explicitState = "") {
  const access = getPlanAccessSummary(req.user);
  if (!access.requiresSingleState) return true;

  const accountState = normalizeUSStateCode(req.user?.lead_state || req.user?.leadState);
  const leadState = normalizeUSStateCode(explicitState || extractNoteValue(notes, "State"));

  if (accountState && leadState && leadState !== accountState) {
    res.status(403).json({
      error: `${access.planName} is locked to ${accountState}. You can only save leads from that state.`,
      access
    });
    return false;
  }

  return true;
}

export async function getLeads(req, res, next) {
  try {
    if (!requirePaidPlan(req, res)) return;

    const userId = req.user.id;
    const trialAccess = res.locals.trialAccess || getTrialUsage(req.user);
    const result = await query(
      `SELECT id,
              carrier_name,
              dot_number,
              mc_number,
              dot_number AS dot,
              mc_number AS mc,
              status,
              last_contact,
              follow_up_date,
              insurance_expiration,
              notes,
              notes AS raw_notes
       FROM leads
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    res.json({
      trialAccess,
      leads: result.rows.map((lead) => ({
        ...lead,
        status: normalizeLeadStatus(lead.status) || lead.status || "New",
        state: extractNoteValue(lead.notes, "State"),
        phone: extractNoteValue(lead.notes, "Phone"),
        email: extractNoteValue(lead.notes, "Email"),
        cargo_hauled: extractNoteValue(lead.notes, "Cargo") || "Not listed"
      }))
    });
  } catch (err) {
    next(err);
  }
}

export async function createLead(req, res, next) {
  try {
    if (!requirePaidPlan(req, res)) return;

    const userId = req.user.id;
    const trialAccess = res.locals.trialAccess || getTrialUsage(req.user);
    const {
      carrier_name,
      dot,
      mc,
      dot_number,
      mc_number,
      state,
      hq_state,
      status,
      last_contact,
      follow_up_date,
      insurance_expiration,
      notes
    } = req.body;

    if (!carrier_name) {
      return res.status(400).json({ error: "carrier_name is required" });
    }

    if (!enforceSavedLeadState(req, res, notes, state || hq_state)) return;

    const access = getPlanAccessSummary(req.user);
    if (access.savedLeadLimit !== null) {
      const countResult = await query("SELECT COUNT(*)::int AS count FROM leads WHERE user_id = $1", [userId]);
      if (countResult.rows[0].count >= access.savedLeadLimit) {
        return res.status(403).json({
          error: `Upgrade to save more than ${access.savedLeadLimit} leads.`,
          access
        });
      }
    }

    const normalizedStatus = normalizeLeadStatus(status);
    if (!normalizedStatus) {
      return res.status(400).json({
          error: "Invalid lead status. Use New, Called, Quoted, Follow Up, Negotiation, Won, or Lost."
      });
    }

    const result = await query(
      `INSERT INTO leads (user_id, carrier_name, dot_number, mc_number, status, last_contact, follow_up_date, insurance_expiration, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        userId,
        carrier_name,
        dot_number || dot || null,
        mc_number || mc || null,
        normalizedStatus,
        last_contact || null,
        follow_up_date || null,
        insurance_expiration || null,
        notes || ""
      ]
    );

    let nextTrialAccess = trialAccess;
    if (trialAccess.active) {
      const updatedUser = await incrementTrialUsage(userId, "saved");
      if (updatedUser) {
        req.user.daily_saved_prospects = updatedUser.daily_saved_prospects;
        nextTrialAccess = getTrialUsage(updatedUser);
      }
    }

    res.status(201).json({ id: result.rows[0].id, trialAccess: nextTrialAccess });
  } catch (err) {
    next(err);
  }
}

export async function updateLead(req, res, next) {
  try {
    if (!requirePaidPlan(req, res)) return;

    const userId = req.user.id;
    const { id } = req.params;
    const allowedFields = ["status", "last_contact", "follow_up_date", "insurance_expiration", "notes"];
    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        if (field === "status") {
          const normalizedStatus = normalizeLeadStatus(req.body[field]);
          if (!normalizedStatus) {
            return res.status(400).json({
              error: "Invalid lead status. Use New, Called, Quoted, Follow Up, Negotiation, Won, or Lost."
            });
          }
          values.push(normalizedStatus);
        } else {
          values.push(req.body[field] === "" ? null : req.body[field]);
        }
        updates.push(`${field} = $${values.length}`);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No lead updates provided" });
    }

    values.push(id, userId);

    const result = await query(
      `UPDATE leads
       SET ${updates.join(", ")},
           updated_at = NOW()
       WHERE id = $${values.length - 1} AND user_id = $${values.length}
       RETURNING id`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function deleteLead(req, res, next) {
  try {
    if (!requirePaidPlan(req, res)) return;

    const userId = req.user.id;
    const { id } = req.params;

    await query(`DELETE FROM leads WHERE id = $1 AND user_id = $2`, [id, userId]);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
