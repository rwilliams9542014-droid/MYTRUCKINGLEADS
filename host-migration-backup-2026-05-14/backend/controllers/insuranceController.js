import { query } from "../config/db.js";
import { AuthenticationError } from "../middleware/errorHandler.js";
import {
  getPlanAccessSummary,
  getRenewalWindowDays,
  getRenewalWindowEndDate,
  requirePaidPlan
} from "../utils/planAccess.js";

function addDaysDateString(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function integerOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

// Get carriers with insurance expiring in the plan renewal window
export async function getExpiringInsurance(req, res, next) {
  try {
    if (!req.user?.id) {
      return next(new AuthenticationError("User not authenticated"));
    }
    if (!requirePaidPlan(req, res)) return;

    const userId = req.user.id;
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const windowDays = getRenewalWindowDays(req.user);
    const windowEnd = getRenewalWindowEndDate(req.user);
    const thirtyDaysLater = addDaysDateString(30);
    const sixtyDaysLater = addDaysDateString(60);
    const requestedFrom = dateOrNull(req.query.from || req.query.renewalFrom || req.query.startDate) || today;
    const requestedTo = dateOrNull(req.query.to || req.query.renewalTo || req.query.endDate) || windowEnd;
    const state = req.query.state ? String(req.query.state).trim().toUpperCase() : "";
    const minFleetSize = integerOrNull(req.query.minFleetSize);
    const maxFleetSize = integerOrNull(req.query.maxFleetSize);
    const authorityStatus = req.query.authorityStatus ? String(req.query.authorityStatus).trim() : "";
    const insuranceStatus = req.query.insuranceStatus ? String(req.query.insuranceStatus).trim() : "";

    if (requestedTo > windowEnd) {
      return res.status(403).json({
        error: `Upgrade to search renewals more than ${windowDays} days in advance.`,
        access: {
          ...getPlanAccessSummary(req.user),
          renewalWindowEndsAt: windowEnd,
          renewalWindowDays: windowDays
        }
      });
    }

    const where = [
      "l.user_id = $1",
      "l.insurance_expiration IS NOT NULL",
      "l.insurance_expiration >= $5",
      "l.insurance_expiration <= $6"
    ];
    const values = [
      userId,
      today,
      thirtyDaysLater,
      sixtyDaysLater,
      requestedFrom,
      requestedTo
    ];

    function addCondition(sql, value) {
      values.push(value);
      where.push(sql.replace("?", `$${values.length}`));
    }

    if (state) addCondition("UPPER(c.hq_state) = ?", state);
    if (minFleetSize !== null) addCondition("COALESCE(c.vehicle_count, 0) >= ?", minFleetSize);
    if (maxFleetSize !== null) addCondition("COALESCE(c.vehicle_count, 0) <= ?", maxFleetSize);
    if (authorityStatus) addCondition("c.authority_status ILIKE ?", `%${authorityStatus}%`);

    const result = await query(
      `SELECT 
        l.id,
        l.carrier_name,
        l.dot_number,
        l.mc_number,
        l.dot_number AS dot,
        l.mc_number AS mc,
        l.insurance_expiration,
        l.status,
        l.last_contact,
        l.follow_up_date,
        l.notes,
        c.hq_city,
        c.hq_state,
        c.vehicle_count,
        c.driver_count,
        c.authority_status,
        c.safety_rating,
        CASE 
          WHEN l.insurance_expiration <= $2 THEN 'Expired'
          WHEN l.insurance_expiration <= $3 THEN 'Expiring Soon (0-30 days)'
          WHEN l.insurance_expiration <= $4 THEN 'Expiring (31-60 days)'
          ELSE 'Expiring (61-90 days)'
        END as expiration_status,
        CAST((l.insurance_expiration::date - CURRENT_DATE) AS INTEGER) as days_until_expiration
      FROM leads l
      LEFT JOIN carriers c ON c.id = l.carrier_id OR c.dot_number = l.dot_number
      WHERE ${where.join(" AND ")}
      ORDER BY l.insurance_expiration ASC`,
      values
    );

    const carriers = insuranceStatus
      ? result.rows.filter(row => row.expiration_status.toLowerCase().includes(insuranceStatus.toLowerCase()))
      : result.rows;

    res.json({
      total: carriers.length,
      carriers,
      summary: {
        expired: carriers.filter(r => r.expiration_status === "Expired").length,
        expiringSoon: carriers.filter(r => r.expiration_status === "Expiring Soon (0-30 days)").length,
        expiring31_60: carriers.filter(r => r.expiration_status === "Expiring (31-60 days)").length,
        expiring61_90: carriers.filter(r => r.expiration_status === "Expiring (61-90 days)").length
      },
      filters: {
        from: requestedFrom,
        to: requestedTo,
        state,
        minFleetSize,
        maxFleetSize,
        authorityStatus,
        insuranceStatus
      },
      access: {
        ...getPlanAccessSummary(req.user),
        renewalWindowEndsAt: windowEnd,
        renewalWindowDays: windowDays
      }
    });
  } catch (err) {
    next(err);
  }
}

// Get carriers with active insurance (expiring after 90 days)
export async function getActiveInsurance(req, res, next) {
  try {
    if (!req.user?.id) {
      return next(new AuthenticationError("User not authenticated"));
    }
    if (!requirePaidPlan(req, res)) return;

    const windowEnd = getRenewalWindowEndDate(req.user);

    res.json({
      total: 0,
      carriers: [],
      message: "Renewal visibility is limited to your plan window.",
      access: {
        ...getPlanAccessSummary(req.user),
        renewalWindowEndsAt: windowEnd
      }
    });
  } catch (err) {
    next(err);
  }
}
