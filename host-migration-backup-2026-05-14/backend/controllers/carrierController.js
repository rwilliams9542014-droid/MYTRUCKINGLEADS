import { fetchCarrierByDotOrMc } from "../services/fmcsaService.js";
import { enrichCarrierData, searchCarrierByName, getNewEntrantsAlerts } from "../services/dataEnrichmentService.js";
import { verifyEmailAddress } from "../services/emailVerificationService.js";
import { searchNewVentureLeads, newVentureRowsToCsv } from "../services/newVentureService.js";
import { query as dbQuery } from "../config/db.js";
import {
  getPlanAccessSummary,
  getRenewalWindowEndDate,
  isPaidPlan,
  requirePaidPlan,
  requirePremiumPlan
} from "../utils/planAccess.js";
import { getTrialUsage, maskTrialLeadContacts } from "../utils/trialAccess.js";
import { claimMonthlyExportRows } from "../utils/exportUsage.js";
import {
  searchOTrucking,
  getOTruckingCarrierDetail,
  browseCarriersByState,
  batchSearchOTrucking
} from "../services/otruckingService.js";

function emptyToNull(value) {
  if (value === undefined || value === null) return null;
  const stringValue = String(value).trim();
  return stringValue ? stringValue : null;
}

function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function trialAccessForRequest(req, res) {
  return res.locals.trialAccess || getTrialUsage(req.user);
}

function maskTrialRows(rows, trialAccess) {
  if (!trialAccess.active) return rows;
  return rows.map((row) => maskTrialLeadContacts(row));
}

function buildTrialMessage(trialAccess) {
  if (!trialAccess.active) return "";
  return `Trial access shows up to ${trialAccess.limits.searchResults} results per search. Profile views left today: ${trialAccess.remaining.profileViews}. Contact views left today: ${trialAccess.remaining.contactViews}. CRM saves left today: ${trialAccess.remaining.savedProspects}.`;
}

function applyExportUsageToUser(user, exportUsage) {
  if (!user || !exportUsage) return;
  user.monthly_export_rows = exportUsage.used;
  if (exportUsage.resetAt) {
    user.monthly_export_reset_at = exportUsage.resetAt;
  }
  if (exportUsage.daily) {
    user.daily_export_rows = exportUsage.daily.used;
    if (exportUsage.daily.resetAt) {
      user.daily_export_reset_at = exportUsage.daily.resetAt;
    }
  }
}

function enforceRenewalFiltersForPlan(filters = {}, user) {
  const renewalWindowEnd = getRenewalWindowEndDate(user);
  if (!renewalWindowEnd) return filters;

  const requestedFrom = dateOrNull(filters.renewalFrom);
  const requestedTo = dateOrNull(filters.renewalTo);
  const requestedEnd = requestedTo || requestedFrom;

  if (requestedEnd && requestedEnd > renewalWindowEnd) {
    const err = new Error(`Upgrade to search renewals more than ${getPlanAccessSummary(user).renewalWindowDays} days in advance.`);
    err.statusCode = 403;
    err.access = {
      ...getPlanAccessSummary(user),
      renewalWindowEndsAt: renewalWindowEnd
    };
    throw err;
  }

  return {
    ...filters,
    renewalFrom: requestedFrom || todayDateString(),
    renewalTo: requestedTo || renewalWindowEnd
  };
}

function enforceAdvancedFiltersForPlan(filters = {}, user) {
  const access = getPlanAccessSummary(user);
  if (access.canUseAdvancedFilters) return;

  const advancedFilterKeys = [
    "safetyRating",
    "minFleetSize",
    "maxFleetSize",
    "minDrivers",
    "maxDrivers",
    "emailVerified",
    "hasEmail"
  ];
  const usedAdvancedFilters = advancedFilterKeys.filter((key) => {
    const value = filters[key];
    return value !== undefined && value !== null && String(value).trim() !== "";
  });

  if (usedAdvancedFilters.length > 0) {
    const err = new Error("Upgrade to Pro or Agency Unlimited to use advanced lead filtering.");
    err.statusCode = 403;
    err.access = access;
    throw err;
  }
}

function publicCarrierLookup(carrier, dot, mc) {
  return {
    carrierName: carrier.carrierName || carrier.legalName || "Unknown Carrier",
    dot: carrier.dot || dot || "",
    mc: carrier.mc || mc || "",
    safetyRating: carrier.safetyRating || "Unknown",
    safetyRatingDate: carrier.safetyRatingDate || "",
    authorityStatus: carrier.authorityStatus || "",
    operatingStatus: carrier.operatingStatus || "",
    totalInspections: carrier.totalInspections || carrier.smsSafety?.inspections || "",
    crashTotal: carrier.crashTotal || "",
    crashes: carrier.crashes || null,
    smsSafety: carrier.smsSafety || null,
    saferData: carrier.saferData || null,
    fmcsaData: {
      carrierName: carrier.carrierName || carrier.legalName || "Unknown Carrier",
      dot: carrier.dot || dot || "",
      mc: carrier.mc || mc || "",
      safetyRating: carrier.safetyRating || "Unknown",
      safetyRatingDate: carrier.safetyRatingDate || "",
      authorityStatus: carrier.authorityStatus || "",
      operatingStatus: carrier.operatingStatus || "",
      totalInspections: carrier.totalInspections || carrier.smsSafety?.inspections || "",
      crashTotal: carrier.crashTotal || "",
      crashes: carrier.crashes || null,
      smsSafety: carrier.smsSafety || null,
      saferData: carrier.saferData || null
    },
    dataSources: carrier.smsSafety ? ["FMCSA", "FMCSA SMS"] : ["FMCSA"],
    access: getPlanAccessSummary({ plan: "basic", subscription_status: "active" })
  };
}

function mergeResolvedCarrierData(enrichedCarrier, basicCarrier) {
  if (!basicCarrier) return enrichedCarrier;

  const fmcsaData = {
    ...(basicCarrier || {}),
    ...(enrichedCarrier.fmcsaData || {}),
    carrierName: enrichedCarrier.fmcsaData?.carrierName || basicCarrier.carrierName || enrichedCarrier.carrierName,
    dot: enrichedCarrier.fmcsaData?.dot || basicCarrier.dot || enrichedCarrier.dot,
    mc: enrichedCarrier.fmcsaData?.mc || basicCarrier.mc || enrichedCarrier.mc,
    safetyRating: basicCarrier.safetyRating || enrichedCarrier.fmcsaData?.safetyRating,
    safetyRatingDate: basicCarrier.safetyRatingDate || enrichedCarrier.fmcsaData?.safetyRatingDate,
    authorityStatus: basicCarrier.authorityStatus || enrichedCarrier.fmcsaData?.authorityStatus,
    operatingStatus: basicCarrier.operatingStatus || enrichedCarrier.fmcsaData?.operatingStatus,
    totalInspections: basicCarrier.totalInspections || enrichedCarrier.fmcsaData?.totalInspections,
    crashTotal: basicCarrier.crashTotal || enrichedCarrier.fmcsaData?.crashTotal,
    crashes: basicCarrier.crashes || enrichedCarrier.fmcsaData?.crashes || null,
    smsSafety: basicCarrier.smsSafety || enrichedCarrier.fmcsaData?.smsSafety || null,
    saferData: basicCarrier.saferData || enrichedCarrier.fmcsaData?.saferData || null
  };

  const sources = new Set(enrichedCarrier.dataSources || []);
  sources.add("FMCSA");
  if (fmcsaData.smsSafety) sources.add("FMCSA SMS");
  if (fmcsaData.saferData) sources.add("FMCSA SAFER");

  return {
    ...basicCarrier,
    ...enrichedCarrier,
    carrierName: enrichedCarrier.carrierName || basicCarrier.carrierName,
    dot: enrichedCarrier.dot || basicCarrier.dot,
    mc: enrichedCarrier.mc || basicCarrier.mc,
    safetyRating: basicCarrier.safetyRating || enrichedCarrier.safetyRating || fmcsaData.safetyRating || "Unknown",
    safetyRatingDate: basicCarrier.safetyRatingDate || enrichedCarrier.safetyRatingDate || fmcsaData.safetyRatingDate || "",
    authorityStatus: basicCarrier.authorityStatus || enrichedCarrier.authorityStatus || fmcsaData.authorityStatus || "",
    operatingStatus: basicCarrier.operatingStatus || enrichedCarrier.operatingStatus || fmcsaData.operatingStatus || "",
    totalInspections: basicCarrier.totalInspections || enrichedCarrier.totalInspections || fmcsaData.totalInspections || "",
    crashTotal: basicCarrier.crashTotal || enrichedCarrier.crashTotal || fmcsaData.crashTotal || "",
    crashes: basicCarrier.crashes || enrichedCarrier.crashes || fmcsaData.crashes || null,
    smsSafety: basicCarrier.smsSafety || enrichedCarrier.smsSafety || fmcsaData.smsSafety || null,
    saferData: basicCarrier.saferData || enrichedCarrier.saferData || fmcsaData.saferData || null,
    fmcsaData,
    dataSources: [...sources],
    freeSourcesUsed: [...new Set([
      ...(enrichedCarrier.freeSourcesUsed || []),
      "FMCSA",
      ...(fmcsaData.smsSafety ? ["FMCSA SMS"] : []),
      ...(fmcsaData.saferData ? ["FMCSA SAFER"] : [])
    ])]
  };
}

function mergeExternalCarrierProfile(carrier, profileData) {
  if (!profileData) return carrier;

  const contact = profileData.contactInfo || {};
  const sources = new Set(carrier.dataSources || []);

  return {
    ...carrier,
    mc: carrier.mc || profileData.mcNumber || profileData.authority?.mcNumber || "",
    phone: carrier.phone || contact.phone || contact.cellPhone || "",
    email: carrier.email || contact.email || "",
    address: carrier.address || contact.address || "",
    vehicleCount: carrier.vehicleCount ?? profileData.powerUnits ?? carrier.vehicles ?? null,
    vehicles: carrier.vehicles ?? carrier.vehicleCount ?? profileData.powerUnits ?? null,
    driverCount: carrier.driverCount ?? profileData.drivers ?? profileData.totalDrivers ?? null,
    drivers: carrier.drivers ?? carrier.driverCount ?? profileData.drivers ?? profileData.totalDrivers ?? null,
    cargo: carrier.cargo || (profileData.cargoTypes || []).join(", "),
    equipmentTypes: profileData.equipmentTypes || carrier.equipmentTypes || [],
    authorityStatus: carrier.authorityStatus || profileData.authority?.status || profileData.status || "",
    authoritySince: profileData.authority?.authoritySince || carrier.authoritySince || "",
    totalInspections: carrier.totalInspections || profileData.safetyPerformance?.inspections || "",
    crashTotal: carrier.crashTotal || profileData.crashHistory?.total || "",
    crashes: carrier.crashes || (
      profileData.crashHistory
        ? {
          fatal: String(profileData.crashHistory.fatalities ?? ""),
          injury: String(profileData.crashHistory.injuries ?? ""),
          tow: String(profileData.crashHistory.towAways ?? ""),
          total: String(profileData.crashHistory.total ?? "")
        }
        : null
    ),
    carrierProfileData: {
      ...Object.fromEntries(
        Object.entries(profileData).filter(([key]) => key !== "detailUrl" && key !== "source")
      ),
      source: "FMCSA-derived carrier profile"
    },
    dataSources: [...sources],
    freeSourcesUsed: [...new Set([...(carrier.freeSourcesUsed || [])])]
  };
}

function parseInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseBoolean(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "boolean") return value;
  if (["true", "1", "yes"].includes(String(value).toLowerCase())) return true;
  if (["false", "0", "no"].includes(String(value).toLowerCase())) return false;
  return null;
}

function csvCell(value) {
  if (value === undefined || value === null) return "";
  const stringValue = String(value);
  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function buildProspectLeadQuery(filters = {}) {
  const where = [];
  const values = [];

  function addCondition(sql, value) {
    values.push(value);
    where.push(sql.replace("?", `$${values.length}`));
  }

  const state = emptyToNull(filters.state)?.toUpperCase();
  const renewalFrom = dateOrNull(filters.renewalFrom);
  const renewalTo = dateOrNull(filters.renewalTo);
  const safetyRating = emptyToNull(filters.safetyRating);
  const minFleetSize = parseInteger(filters.minFleetSize);
  const maxFleetSize = parseInteger(filters.maxFleetSize);
  const minDrivers = parseInteger(filters.minDrivers);
  const maxDrivers = parseInteger(filters.maxDrivers);
  const emailVerified = parseBoolean(filters.emailVerified);
  const hasEmail = parseBoolean(filters.hasEmail);
  const limit = Math.min(Math.max(parseInteger(filters.limit) || 100, 1), 1000);

  if (state) addCondition("UPPER(c.hq_state) = ?", state);
  if (renewalFrom) addCondition("c.insurance_expiration >= ?", renewalFrom);
  if (renewalTo) addCondition("c.insurance_expiration <= ?", renewalTo);
  if (safetyRating) addCondition("LOWER(c.safety_rating) = LOWER(?)", safetyRating);
  if (minFleetSize !== null) addCondition("COALESCE(c.vehicle_count, 0) >= ?", minFleetSize);
  if (maxFleetSize !== null) addCondition("COALESCE(c.vehicle_count, 0) <= ?", maxFleetSize);
  if (minDrivers !== null) addCondition("COALESCE(c.driver_count, 0) >= ?", minDrivers);
  if (maxDrivers !== null) addCondition("COALESCE(c.driver_count, 0) <= ?", maxDrivers);
  if (emailVerified !== null) addCondition("COALESCE(e.email_verified, false) = ?", emailVerified);
  if (hasEmail === true) where.push("COALESCE(e.email, c.email) IS NOT NULL");
  if (hasEmail === false) where.push("COALESCE(e.email, c.email) IS NULL");

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  values.push(limit);

  return {
    text: `SELECT
             c.id,
             c.carrier_name,
             c.dot_number,
             c.mc_number,
             c.hq_city,
             c.hq_state,
             c.hq_zip,
             c.safety_rating,
             c.insurance_expiration,
             c.vehicle_count,
             c.driver_count,
             COALESCE(e.email, c.email) AS email,
             COALESCE(e.phone, c.phone) AS phone,
             COALESCE(e.website, c.website) AS website,
             e.email_source,
             COALESCE(e.email_verified, false) AS email_verified,
             e.data_completeness_percent,
             c.last_updated
           FROM carriers c
           LEFT JOIN enriched_carrier_data e ON e.carrier_id = c.id
           ${whereSql}
           ORDER BY
             c.insurance_expiration ASC NULLS LAST,
             c.vehicle_count DESC NULLS LAST,
             c.carrier_name ASC
           LIMIT $${values.length}`,
    values
  };
}

async function persistEnrichedCarrier(enrichedCarrier) {
  const dotNumber = emptyToNull(enrichedCarrier.dot || enrichedCarrier.fmcsaData?.dot);
  const mcNumber = emptyToNull(enrichedCarrier.mc || enrichedCarrier.fmcsaData?.mc);

  if (!dotNumber && !mcNumber) return null;

  const carrierName = emptyToNull(enrichedCarrier.carrierName || enrichedCarrier.fmcsaData?.carrierName) || "Unknown Carrier";
  const primaryContact = enrichedCarrier.primaryContact || {};
  const fmcsaData = enrichedCarrier.fmcsaData || {};

  const existingCarrier = await dbQuery(
    `SELECT id FROM carriers
     WHERE ($1::text IS NOT NULL AND dot_number = $1)
        OR ($2::text IS NOT NULL AND mc_number = $2)
     LIMIT 1`,
    [dotNumber, mcNumber]
  );

  let carrierId;

  if (existingCarrier.rows.length > 0) {
    carrierId = existingCarrier.rows[0].id;
    await dbQuery(
      `UPDATE carriers
       SET dot_number = COALESCE($1, dot_number),
           mc_number = COALESCE($2, mc_number),
           carrier_name = COALESCE($3, carrier_name),
           safety_rating = COALESCE($4, safety_rating),
           insurance_expiration = COALESCE($5, insurance_expiration),
           phone = COALESCE($6, phone),
           email = COALESCE($7, email),
           website = COALESCE($8, website),
           hq_address = COALESCE($9, hq_address),
           vehicle_count = COALESCE($10, vehicle_count),
           driver_count = COALESCE($11, driver_count),
           last_updated = NOW()
       WHERE id = $12`,
      [
        dotNumber,
        mcNumber,
        carrierName,
        emptyToNull(fmcsaData.safetyRating),
        dateOrNull(fmcsaData.insuranceExpiration),
        emptyToNull(primaryContact.phone),
        emptyToNull(primaryContact.email),
        emptyToNull(primaryContact.website),
        emptyToNull(primaryContact.address),
        parseInteger(fmcsaData.vehicleCount ?? fmcsaData.vehicles),
        parseInteger(fmcsaData.driverCount ?? fmcsaData.drivers),
        carrierId
      ]
    );
  } else {
    const insertedCarrier = await dbQuery(
      `INSERT INTO carriers (
         dot_number, mc_number, carrier_name, safety_rating, insurance_expiration,
         phone, email, website, hq_address, vehicle_count, driver_count, last_updated
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
       RETURNING id`,
      [
        dotNumber,
        mcNumber,
        carrierName,
        emptyToNull(fmcsaData.safetyRating),
        dateOrNull(fmcsaData.insuranceExpiration),
        emptyToNull(primaryContact.phone),
        emptyToNull(primaryContact.email),
        emptyToNull(primaryContact.website),
        emptyToNull(primaryContact.address),
        parseInteger(fmcsaData.vehicleCount ?? fmcsaData.vehicles),
        parseInteger(fmcsaData.driverCount ?? fmcsaData.drivers)
      ]
    );
    carrierId = insertedCarrier.rows[0].id;
  }

  const existingEnrichment = await dbQuery(
    "SELECT id FROM enriched_carrier_data WHERE carrier_id = $1 LIMIT 1",
    [carrierId]
  );

  const enrichmentValues = [
    carrierId,
    emptyToNull(primaryContact.email),
    emptyToNull(primaryContact.emailSource),
    Boolean(primaryContact.emailVerified),
    emptyToNull(primaryContact.phone),
    primaryContact.phone ? "Best available source" : null,
    Boolean(enrichedCarrier.dataQuality?.phoneVerified),
    emptyToNull(primaryContact.address),
    primaryContact.address ? "Best available source" : null,
    Boolean(enrichedCarrier.dataQuality?.addressVerified),
    emptyToNull(primaryContact.website),
    primaryContact.website ? "Best available source" : null,
    enrichedCarrier.additionalEmails || [],
    [],
    enrichedCarrier.dataSources || [],
    enrichedCarrier.freeSourcesUsed || [],
    enrichedCarrier.premiumSourcesUsed || [],
    enrichedCarrier.completeness || 0
  ];

  if (existingEnrichment.rows.length > 0) {
    await dbQuery(
      `UPDATE enriched_carrier_data
       SET email = $2,
           email_source = $3,
           email_verified = $4,
           phone = $5,
           phone_source = $6,
           phone_verified = $7,
           address = $8,
           address_source = $9,
           address_verified = $10,
           website = $11,
           website_source = $12,
           additional_emails = $13,
           additional_phones = $14,
           data_sources = $15,
           free_sources_used = $16,
           premium_sources_used = $17,
           data_completeness_percent = $18,
           enrichment_timestamp = NOW(),
           updated_at = NOW()
       WHERE carrier_id = $1`,
      enrichmentValues
    );
  } else {
    await dbQuery(
      `INSERT INTO enriched_carrier_data (
         carrier_id, email, email_source, email_verified,
         phone, phone_source, phone_verified,
         address, address_source, address_verified,
         website, website_source,
         additional_emails, additional_phones,
         data_sources, free_sources_used, premium_sources_used,
         data_completeness_percent, enrichment_timestamp
       )
       VALUES (
         $1, $2, $3, $4,
         $5, $6, $7,
         $8, $9, $10,
         $11, $12,
         $13, $14,
         $15, $16, $17,
         $18, NOW()
       )`,
      enrichmentValues
    );
  }

  return carrierId;
}

export async function searchProspectLeads(req, res) {
  try {
    if (!requirePaidPlan(req, res)) return;

    const trialAccess = trialAccessForRequest(req, res);
    const filters = enforceRenewalFiltersForPlan(req.query, req.user);
    enforceAdvancedFiltersForPlan(filters, req.user);
    const query = buildProspectLeadQuery(filters);
    const result = await dbQuery(query.text, query.values);

    res.json({
      total: result.rows.length,
      filters,
      access: getPlanAccessSummary(req.user),
      leads: maskTrialRows(result.rows, trialAccess),
      trialAccess,
      message: buildTrialMessage(trialAccess)
    });
  } catch (err) {
    console.error("Prospect lead search error:", err);
    res.status(err.statusCode || 500).json({
      error: err.statusCode === 403 ? err.message : "Failed to search prospect leads",
      access: err.access
    });
  }
}

export async function exportProspectLeads(req, res) {
  try {
    if (!requirePaidPlan(req, res)) return;
    const access = getPlanAccessSummary(req.user);
    if (!access.canExportCsv) {
      return res.status(403).json({
        error: "Choose a lead plan to unlock CSV exports.",
        access
      });
    }

    const filters = enforceRenewalFiltersForPlan({ ...req.query, limit: req.query.limit || 1000 }, req.user);
    enforceAdvancedFiltersForPlan(filters, req.user);
    const query = buildProspectLeadQuery(filters);
    const result = await dbQuery(query.text, query.values);
    const headers = [
      "Carrier Name",
      "DOT Number",
      "MC Number",
      "State",
      "City",
      "Insurance Expiration",
      "Safety Rating",
      "Fleet Size",
      "Drivers",
      "Email",
      "Email Source",
      "Email Verified",
      "Phone",
      "Website",
      "Data Completeness"
    ];

    const rows = result.rows.map(row => [
      row.carrier_name,
      row.dot_number,
      row.mc_number,
      row.hq_state,
      row.hq_city,
      row.insurance_expiration ? new Date(row.insurance_expiration).toISOString().slice(0, 10) : "",
      row.safety_rating,
      row.vehicle_count,
      row.driver_count,
      row.email,
      row.email_source,
      row.email_verified ? "Yes" : "No",
      row.phone,
      row.website,
      row.data_completeness_percent
    ]);

    if (rows.length > 0) {
      const exportUsage = await claimMonthlyExportRows(req.user, rows.length);
      applyExportUsageToUser(req.user, exportUsage);
    }

    const csv = [headers, ...rows]
      .map(row => row.map(csvCell).join(","))
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="trucking-prospect-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("Prospect lead export error:", err);
    res.status(err.statusCode || 500).json({
      error: err.statusCode === 403 ? err.message : "Failed to export prospect leads",
      access: err.access
    });
  }
}

export async function searchNewVentures(req, res) {
  try {
    if (!requirePaidPlan(req, res)) return;

    const trialAccess = trialAccessForRequest(req, res);
    const leads = await searchNewVentureLeads(req.query);
    res.json({
      total: leads.length,
      filters: req.query,
      access: getPlanAccessSummary(req.user),
      leads: maskTrialRows(leads, trialAccess),
      trialAccess,
      message: buildTrialMessage(trialAccess)
    });
  } catch (err) {
    console.error("New venture search error:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to search new venture leads" });
  }
}

export async function exportNewVentures(req, res) {
  try {
    if (!requirePaidPlan(req, res)) return;

    const leads = await searchNewVentureLeads({ ...req.query, limit: req.query.limit || 500 });
    if (leads.length > 0) {
      const exportUsage = await claimMonthlyExportRows(req.user, leads.length);
      applyExportUsageToUser(req.user, exportUsage);
    }
    const csv = newVentureRowsToCsv(leads);

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="new-venture-trucking-leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("New venture export error:", err.response?.data || err.message);
    res.status(err.statusCode || 500).json({
      error: err.statusCode === 403 ? err.message : "Failed to export new venture leads",
      access: err.access
    });
  }
}

export async function claimExportQuota(req, res) {
  try {
    if (!requirePaidPlan(req, res)) return;

    const access = getPlanAccessSummary(req.user);
    if (!access.canExportCsv) {
      return res.status(403).json({
        error: "Choose a lead plan to unlock CSV exports.",
        access
      });
    }

    const recordCount = Number.parseInt(req.body?.recordCount, 10);
    if (!Number.isInteger(recordCount) || recordCount <= 0) {
      return res.status(400).json({ error: "Select at least one record to export." });
    }

    const exportUsage = await claimMonthlyExportRows(req.user, recordCount);
    applyExportUsageToUser(req.user, exportUsage);

    res.json({
      ok: true,
      recordCount,
      exportType: String(req.body?.exportType || "").trim() || "lead-export",
      exportUsage,
      access: getPlanAccessSummary(req.user)
    });
  } catch (err) {
    console.error("Export quota claim error:", err);
    res.status(err.statusCode || 500).json({
      error: err.statusCode === 403 ? err.message : "Failed to reserve export quota.",
      access: err.access,
      exportUsage: err.exportUsage
    });
  }
}

export async function getCarrier(req, res) {
  try {
    const { dot, mc, name, domain } = req.query;
    if (!dot && !mc && !name) {
      return res.status(400).json({ error: "dot, mc, or name is required" });
    }

    if (!isPaidPlan(req.user)) {
      if (!dot && !mc && !name) {
        return res.status(403).json({
          error: "Choose a lead plan for contact enrichment.",
          access: getPlanAccessSummary(req.user)
        });
      }

      const basicCarrier = await fetchCarrierByDotOrMc({ dot, mc, name });
      return res.json({
        carrier: publicCarrierLookup(basicCarrier, dot, mc),
        message: "Subscribe to a lead plan to view contact information from the API.",
        access: getPlanAccessSummary(req.user)
      });
    }

    // Resolve DOT/MC/name and FMCSA safety details first, then preserve them through enrichment.
    let carrierName = name || "";
    let resolvedDot = dot || "";
    let resolvedMc = mc || "";
    let basicData = null;

    try {
      basicData = await fetchCarrierByDotOrMc({ dot, mc, name });
      carrierName = carrierName || basicData.carrierName || "";
      resolvedDot = resolvedDot || basicData.dot || "";
      resolvedMc = resolvedMc || basicData.mc || "";
    } catch (e) {
      console.warn("FMCSA carrier lookup did not resolve before enrichment:", e.message);
    }

    let externalProfileData = null;
    if (resolvedDot) {
      try {
        externalProfileData = await getOTruckingCarrierDetail(resolvedDot);
      } catch (e) {
        console.warn("Expanded carrier profile lookup did not resolve:", e.message);
      }
    }

    // Enrich data from multiple sources (Hunter, Apollo, ZoomInfo, RocketReach, Clearbit, FMCSA)
    const enrichedCarrier = mergeExternalCarrierProfile(
      mergeResolvedCarrierData(
        await enrichCarrierData(resolvedDot, resolvedMc, carrierName, domain || ""),
        basicData
      ),
      externalProfileData
    );

    try {
      const carrierId = await persistEnrichedCarrier(enrichedCarrier);
      if (carrierId) enrichedCarrier.carrierId = carrierId;
    } catch (persistErr) {
      console.warn("Carrier enrichment was not saved:", persistErr.message);
    }
    
    res.json({ 
      carrier: enrichedCarrier,
      message: `Data gathered from ${enrichedCarrier.dataSources.join(", ")}`
    });
  } catch (err) {
    console.error("Carrier fetch error:", err);
    res.status(500).json({ error: "Failed to fetch carrier data" });
  }
}

export async function searchCarrier(req, res) {
  try {
    const {
      q = "",
      name = "",
      state = "",
      city = "",
      status = "",
      authorityStatus = "",
      limit = 25
    } = req.query;

    const searchTerm = emptyToNull(name || q);
    const searchState = emptyToNull(state)?.toUpperCase();
    const searchCity = emptyToNull(city);
    const searchStatus = emptyToNull(status || authorityStatus);
    const safeLimit = Math.min(Math.max(parseInteger(limit) || 25, 1), 100);

    if (!searchTerm && !searchState && !searchCity && !searchStatus) {
      return res.status(400).json({ error: "name, q, state, city, or status is required" });
    }

    const where = [];
    const values = [];

    function addCondition(sql, value) {
      values.push(value);
      where.push(sql.replace("?", `$${values.length}`));
    }

    if (searchTerm) {
      values.push(`%${searchTerm}%`);
      where.push(`(
        c.carrier_name ILIKE $${values.length}
        OR c.dot_number = $${values.length + 1}
        OR c.mc_number ILIKE $${values.length}
      )`);
      values.push(searchTerm);
    }
    if (searchState) addCondition("UPPER(c.hq_state) = ?", searchState);
    if (searchCity) addCondition("c.hq_city ILIKE ?", `%${searchCity}%`);
    if (searchStatus) {
      addCondition("(c.operating_status ILIKE ? OR c.authority_status ILIKE ?)", `%${searchStatus}%`);
      values.push(`%${searchStatus}%`);
      where[where.length - 1] = where[where.length - 1].replace("?", `$${values.length}`);
    }

    values.push(safeLimit);

    const dbResults = await dbQuery(
      `SELECT
         c.id,
         c.carrier_name AS "carrierName",
         NULL AS "legalName",
         NULL AS "dbaName",
         c.dot_number AS "dotNumber",
         c.mc_number AS "mcNumber",
         c.hq_city AS city,
         c.hq_state AS state,
         c.phone,
         c.email,
         c.website,
         c.operating_status AS "operatingStatus",
         c.authority_status AS "authorityStatus",
         c.safety_rating AS "safetyRating",
         c.insurance_expiration AS "insuranceRenewalDate",
         c.vehicle_count AS "powerUnits",
         c.driver_count AS drivers,
         c.last_updated AS "lastUpdated"
       FROM carriers c
       WHERE ${where.join(" AND ")}
       ORDER BY c.last_updated DESC NULLS LAST, c.carrier_name ASC
       LIMIT $${values.length}`,
      values
    );

    if (dbResults.rows.length > 0 || !searchTerm) {
      return res.json({
        total: dbResults.rows.length,
        results: dbResults.rows
      });
    }

    const fallbackResults = await searchCarrierByName(searchTerm, safeLimit);
    res.json({
      total: fallbackResults.length,
      results: fallbackResults
    });
  } catch (err) {
    console.error("Carrier search error:", err);
    res.status(500).json({ error: "Failed to search carriers" });
  }
}

export async function getCarrierByDotNumber(req, res) {
  req.query = {
    ...req.query,
    dot: req.params.dotNumber
  };
  return getCarrier(req, res);
}

export async function getCarrierSafetyByDot(req, res) {
  try {
    const carrier = await fetchCarrierByDotOrMc({ dot: req.params.dotNumber });
    res.json({
      dotNumber: carrier.dot || req.params.dotNumber,
      safetyRating: carrier.safetyRating || "Unknown",
      safetyRatingDate: carrier.safetyRatingDate || "",
      operatingStatus: carrier.operatingStatus || "",
      totalInspections: carrier.totalInspections || carrier.smsSafety?.inspections || "",
      vehicleOosRate: carrier.smsSafety?.oosRates?.vehicle || null,
      driverOosRate: carrier.smsSafety?.oosRates?.driver || null,
      hazmatOosRate: carrier.smsSafety?.oosRates?.hazmat || null,
      crashTotal: carrier.crashTotal || "",
      crashes: carrier.crashes || null,
      smsSafety: carrier.smsSafety || null,
      saferData: carrier.saferData || null
    });
  } catch (err) {
    console.error("Carrier safety fetch error:", err);
    res.status(500).json({ error: "Failed to fetch carrier safety data" });
  }
}

export async function getCarrierInsuranceByDot(req, res) {
  try {
    const carrier = await fetchCarrierByDotOrMc({ dot: req.params.dotNumber });
    res.json({
      dotNumber: carrier.dot || req.params.dotNumber,
      authorityStatus: carrier.authorityStatus || "",
      operatingStatus: carrier.operatingStatus || "",
      insuranceCompany: carrier.insuranceCompany || "",
      insuranceFilingStatus: carrier.insuranceFilingStatus || "",
      insuranceRenewalDate: carrier.insuranceExpiration || "",
      cargoInsurance: carrier.cargoInsurance || "",
      bmcFilings: carrier.bmcFilings || [],
      source: carrier.saferData?.source || carrier.source || "FMCSA public data"
    });
  } catch (err) {
    console.error("Carrier insurance fetch error:", err);
    res.status(500).json({ error: "Failed to fetch carrier insurance data" });
  }
}

export async function verifyCarrierEmail(req, res) {
  try {
    const email = req.body?.email || req.query?.email;
    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    const verification = await verifyEmailAddress(email);
    res.json({
      email: verification.email,
      verified: verification.verified,
      status: verification.status,
      provider: verification.provider,
      confidence: verification.confidence,
      reason: verification.reason,
      checks: verification.checks
    });
  } catch (err) {
    console.error("Email verification error:", err);
    res.status(500).json({ error: "Failed to verify email" });
  }
}

export async function getNewEntrants(req, res) {
  try {
    const { daysBack = 30 } = req.query;
    const alerts = await getNewEntrantsAlerts(parseInt(daysBack));
    res.json(alerts);
  } catch (err) {
    console.error("New entrants fetch error:", err);
    res.status(500).json({ error: "Failed to fetch new entrants" });
  }
}

/**
 * Search otrucking.com and return carriers with contact info
 * 
 * IMPORTANT: Email addresses come DIRECTLY from otrucking.com carrier detail pages
 * NOT from enrichment services. This is real, verified contact data.
 * 
 * Optional: Can also enrich with additional emails from Hunter.io, Apollo, etc.
 * 
 * GET /api/carriers/otrucking/search?query=trucking&state=MI&enrichEmail=true
 */
export async function searchOTruckingAndEnrich(req, res) {
  try {
    if (!requirePremiumPlan(req, res)) return;

    const { query, state = "", enrichEmail = "false" } = req.query;
    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }

    console.log(`🔍 Searching otrucking.com for: ${query}${state ? ` (${state})` : ""}`);

    // Search otrucking.com
    const otruckingResults = await searchOTrucking(query, state);

    if (otruckingResults.length === 0) {
      return res.json({
        source: "otrucking.com",
        results: [],
        message: "No carriers found on otrucking.com"
      });
    }

    // If enrichEmail is true, enrich with email data from Hunter, Apollo, etc.
    let enrichedResults = otruckingResults;
    if (enrichEmail === "true") {
      enrichedResults = await Promise.all(
        otruckingResults.map(async (carrier) => {
          try {
            // Extract domain from company name or use location-based guess
            const domain =
              carrier.website || `${carrier.companyName.toLowerCase().replace(/\s+/g, "")}.com`;

            // Enrich with email data
            const enrichedData = await enrichCarrierData(
              carrier.dotNumber,
              carrier.mcNumber,
              carrier.companyName,
              domain
            );

            return {
              ...carrier,
              enrichedData: {
                email: enrichedData.email,
                phone: enrichedData.phone,
                address: enrichedData.address,
                website: enrichedData.website,
                dataSources: enrichedData.dataSources,
                additionalEmails: enrichedData.additionalEmails
              }
            };
          } catch (err) {
            console.error(`Failed to enrich ${carrier.companyName}:`, err.message);
            return carrier; // Return unescaped result if enrichment fails
          }
        })
      );

      // Add small delay between API calls to avoid rate limiting
      const delayedResults = [];
      for (const result of enrichedResults) {
        delayedResults.push(result);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      enrichedResults = delayedResults;
    }

    res.json({
      source: "otrucking.com",
      totalResults: enrichedResults.length,
      results: enrichedResults,
      message: enrichEmail === "true" 
        ? `Found ${enrichedResults.length} carriers with enriched email data` 
        : `Found ${enrichedResults.length} carriers from otrucking.com`
    });
  } catch (err) {
    console.error("OTrucking search error:", err);
    res.status(500).json({ error: `Failed to search otrucking.com: ${err.message}` });
  }
}

/**
 * Get detailed carrier info from otrucking.com
 * GET /api/carriers/otrucking/detail/:dot
 */
export async function getOTruckingDetail(req, res) {
  try {
    if (!requirePremiumPlan(req, res)) return;

    const { dot } = req.params;
    if (!dot) {
      return res.status(400).json({ error: "DOT number is required" });
    }

    const carrierDetail = await getOTruckingCarrierDetail(dot);
    res.json({
      source: "otrucking.com",
      carrier: carrierDetail
    });
  } catch (err) {
    console.error("OTrucking detail error:", err);
    res.status(404).json({ error: `Carrier with DOT ${dot} not found on otrucking.com` });
  }
}

/**
 * Browse carriers by state on otrucking.com
 * GET /api/carriers/otrucking/state/:stateCode?limit=50
 */
export async function browseOTruckingByState(req, res) {
  try {
    if (!requirePremiumPlan(req, res)) return;

    const { stateCode } = req.params;
    const { limit = 50 } = req.query;

    if (!stateCode || stateCode.length !== 2) {
      return res.status(400).json({ error: "Valid 2-letter state code is required" });
    }

    const carriers = await browseCarriersByState(stateCode.toUpperCase(), parseInt(limit));
    res.json({
      source: "otrucking.com",
      state: stateCode.toUpperCase(),
      totalResults: carriers.length,
      results: carriers
    });
  } catch (err) {
    console.error("OTrucking state browse error:", err);
    res.status(500).json({ error: "Failed to browse carriers by state" });
  }
}

/**
 * Batch search multiple carriers from otrucking.com
 * POST /api/carriers/otrucking/batch-search
 * Body: { "queries": ["ABC Trucking", "1234567", "XYZ Transport"] }
 */
export async function batchSearchOTruckingCarriers(req, res) {
  try {
    if (!requirePremiumPlan(req, res)) return;

    const { queries } = req.body;
    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({ error: "queries array is required" });
    }

    if (queries.length > 50) {
      return res.status(400).json({ error: "Maximum 50 queries per batch" });
    }

    console.log(`Batch searching ${queries.length} queries on otrucking.com`);
    const results = await batchSearchOTrucking(queries);

    res.json({
      source: "otrucking.com",
      queriesSubmitted: queries.length,
      totalResults: results.length,
      results: results
    });
  } catch (err) {
    console.error("OTrucking batch search error:", err);
    res.status(500).json({ error: "Failed to perform batch search" });
  }
}
