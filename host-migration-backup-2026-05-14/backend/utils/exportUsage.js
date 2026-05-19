import { query } from "../config/db.js";
import { getMonthlyExportLimit, getMonthlyExportUsage, getPlanAccessSummary } from "./planAccess.js";

function exportLimitMessage(access, usage) {
  if (access.monthlyExportLimit === null) {
    return "";
  }

  if ((usage?.remaining ?? 0) <= 0) {
    return `Monthly export limit reached. ${access.planName} includes up to ${access.monthlyExportLimit} exported records per month.`;
  }

  return `This export would exceed your monthly limit. ${access.planName} includes up to ${access.monthlyExportLimit} exported records per month, and you have ${usage.remaining} left.`;
}

export async function claimMonthlyExportRows(user, recordCount, now = new Date()) {
  const normalizedCount = Number.parseInt(recordCount, 10);
  if (!Number.isInteger(normalizedCount) || normalizedCount < 0) {
    const err = new Error("Export record count must be a non-negative integer.");
    err.statusCode = 400;
    throw err;
  }

  const currentUsage = getMonthlyExportUsage(user, now);
  if (normalizedCount === 0) {
    return currentUsage;
  }

  const monthlyLimit = getMonthlyExportLimit(user);
  const nowIso = new Date(now).toISOString();
  const result = await query(
    `UPDATE users
     SET monthly_export_rows = CASE
           WHEN monthly_export_reset_at IS NULL
             OR date_trunc('month', monthly_export_reset_at AT TIME ZONE 'UTC') <> date_trunc('month', $1::timestamptz AT TIME ZONE 'UTC')
           THEN $2
           ELSE COALESCE(monthly_export_rows, 0) + $2
         END,
         monthly_export_reset_at = CASE
           WHEN monthly_export_reset_at IS NULL
             OR date_trunc('month', monthly_export_reset_at AT TIME ZONE 'UTC') <> date_trunc('month', $1::timestamptz AT TIME ZONE 'UTC')
           THEN $1::timestamptz
           ELSE monthly_export_reset_at
         END,
         updated_at = NOW()
     WHERE id = $3
       AND (
         $4::integer IS NULL OR
         (
           CASE
             WHEN monthly_export_reset_at IS NULL
               OR date_trunc('month', monthly_export_reset_at AT TIME ZONE 'UTC') <> date_trunc('month', $1::timestamptz AT TIME ZONE 'UTC')
             THEN 0
             ELSE COALESCE(monthly_export_rows, 0)
           END
         ) + $2 <= $4
       )
     RETURNING monthly_export_rows, monthly_export_reset_at`,
    [nowIso, normalizedCount, user.id, monthlyLimit]
  );

  if (result.rows.length === 0) {
    const access = getPlanAccessSummary(user);
    const err = new Error(exportLimitMessage(access, currentUsage));
    err.statusCode = 403;
    err.access = access;
    err.exportUsage = currentUsage;
    throw err;
  }

  const updatedUsage = getMonthlyExportUsage({
    ...user,
    monthly_export_rows: result.rows[0].monthly_export_rows,
    monthly_export_reset_at: result.rows[0].monthly_export_reset_at
  }, now);

  return updatedUsage;
}
