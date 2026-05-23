import { query } from "../config/db.js";

function toInt(value) {
  return Number.parseInt(value, 10) || 0;
}

function extractNoteValue(notes = "", label) {
  const match = String(notes || "").match(new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\s+[A-Z][A-Za-z ]+:|$)`, "i"));
  return match?.[1]?.trim().replace(/[.ã€‚]+$/, "").trim() || "";
}

function normalizeStatus(status = "") {
  if (!status || status === "New Lead") return "New";
  if (status === "Called") return "Contacted";
  return status;
}

function getLeadType(lead) {
  if (lead.is_new_entrant) return "New DOT";
  if (lead.is_insurance_expiring || lead.insurance_expiration) return "Renewal";
  return "Carrier";
}

function getRatingScore(rating = "") {
  const normalized = String(rating || "").toLowerCase();
  if (normalized.includes("satisfactory")) return 92;
  if (normalized.includes("conditional")) return 74;
  if (normalized.includes("unsatisfactory")) return 48;
  return 84;
}

function normalizeRating(rating = "") {
  const normalized = String(rating || "").toLowerCase();
  if (normalized.includes("conditional")) return "Conditional";
  if (normalized.includes("unsatisfactory")) return "Unsatisfactory";
  return "Satisfactory";
}

function daysUntil(value) {
  if (!value) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((date - today) / 86400000));
}

export async function getProducerDashboardSummary(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const [
      recentResult,
      metricResult,
      renewalResult,
      safetyResult,
      pipelineResult,
      newDotResult
    ] = await Promise.all([
      query(
        `SELECT id,
                carrier_name,
                dot_number,
                mc_number,
                status,
                insurance_expiration,
                is_new_entrant,
                is_insurance_expiring,
                notes,
                created_at,
                saved_at
         FROM leads
         WHERE user_id = $1
         ORDER BY COALESCE(updated_at, created_at, saved_at) DESC
         LIMIT 8`,
        [userId]
      ),
      query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (
                  WHERE status NOT IN ('Won', 'Lost')
                )::int AS active,
                COUNT(*) FILTER (
                  WHERE status = 'Won'
                    AND updated_at >= date_trunc('month', CURRENT_DATE)
                )::int AS converted_this_month,
                COUNT(*) FILTER (
                  WHERE insurance_expiration BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
                )::int AS renewal_opportunities
         FROM leads
         WHERE user_id = $1`,
        [userId]
      ),
      query(
        `SELECT carrier_name,
                dot_number,
                insurance_expiration
         FROM leads
         WHERE user_id = $1
           AND insurance_expiration IS NOT NULL
           AND insurance_expiration >= CURRENT_DATE
         ORDER BY insurance_expiration ASC
         LIMIT 5`,
        [userId]
      ),
      query(
        `SELECT COALESCE(c.carrier_name, l.carrier_name) AS carrier_name,
                COALESCE(c.dot_number, l.dot_number) AS dot_number,
                COALESCE(c.safety_rating, 'Satisfactory') AS safety_rating
         FROM leads l
         LEFT JOIN carriers c ON c.dot_number = l.dot_number
         WHERE l.user_id = $1
           AND l.dot_number IS NOT NULL
         ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC
         LIMIT 5`,
        [userId]
      ),
      query(
        `SELECT status, COUNT(*)::int AS count
         FROM leads
         WHERE user_id = $1
         GROUP BY status`,
        [userId]
      ),
      query(
        `SELECT COUNT(*)::int AS count
         FROM carriers
         WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`
      )
    ]);

    const metrics = metricResult.rows[0] || {};
    const pipelineCounts = {
      newLeads: 0,
      contacted: 0,
      quoted: 0,
      proposalSent: 0,
      won: 0
    };

    for (const row of pipelineResult.rows) {
      const status = normalizeStatus(row.status);
      if (status === "New") pipelineCounts.newLeads += toInt(row.count);
      if (status === "Contacted") pipelineCounts.contacted += toInt(row.count);
      if (status === "Quoted") pipelineCounts.quoted += toInt(row.count);
      if (status === "Proposal Sent" || status === "Follow Up" || status === "Negotiation") {
        pipelineCounts.proposalSent += toInt(row.count);
      }
      if (status === "Won") pipelineCounts.won += toInt(row.count);
    }

    const recentLeads = recentResult.rows.map((lead) => ({
      companyName: lead.carrier_name,
      dotNumber: lead.dot_number,
      mcNumber: lead.mc_number,
      type: getLeadType(lead),
      state: extractNoteValue(lead.notes, "State") || "US",
      dateAdded: lead.created_at || lead.saved_at,
      status: normalizeStatus(lead.status)
    }));

    res.json({
      newDotLeads: {
        value: toInt(newDotResult.rows[0]?.count),
        change: "+0%"
      },
      renewalOpportunities: {
        value: toInt(metrics.renewal_opportunities),
        change: "+0%"
      },
      activeLeads: {
        value: toInt(metrics.active || metrics.total),
        change: "+0%"
      },
      convertedThisMonth: {
        value: toInt(metrics.converted_this_month),
        change: "+0%"
      },
      recentLeads,
      dotNumbers: recentLeads
        .filter((lead) => lead.dotNumber)
        .slice(0, 6)
        .map((lead) => ({
          dotNumber: lead.dotNumber,
          carrierName: lead.companyName,
          location: lead.state === "US" ? "United States" : lead.state
        })),
      upcomingRenewals: renewalResult.rows.map((lead) => ({
        carrierName: lead.carrier_name,
        dotNumber: lead.dot_number,
        renewalDate: lead.insurance_expiration,
        daysRemaining: daysUntil(lead.insurance_expiration)
      })),
      safetyScores: safetyResult.rows.map((carrier) => ({
        carrierName: carrier.carrier_name,
        dotNumber: carrier.dot_number,
        score: getRatingScore(carrier.safety_rating),
        rating: normalizeRating(carrier.safety_rating)
      })),
      pipeline: pipelineCounts
    });
  } catch (err) {
    next(err);
  }
}
