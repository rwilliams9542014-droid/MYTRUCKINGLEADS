import crypto from "crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getClient, query } from "../config/db.js";
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "../middleware/errorHandler.js";
import { hasActiveSubscription, normalizePlan } from "../utils/planAccess.js";
import { validateEmail, validatePhone, validateString } from "../utils/validators.js";
import { buildInitialExtractionSnapshot, queueQuoteRequestExtraction } from "./marketplaceExtractionService.js";
import { chargeMarketplaceLead } from "./marketplaceBillingService.js";
import {
  notifyAdminOfNewQuoteRequest,
  notifyEliteUsersOfGoldLead,
  notifyPrioritySubscribersOfLead,
  recordPurchaseNotification
} from "./marketplaceNotificationService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MAX_MARKETPLACE_FILES = 20;
export const MAX_MARKETPLACE_FILE_SIZE_BYTES = 50 * 1024 * 1024;

export const MARKETPLACE_DOCUMENT_TYPES = Object.freeze({
  loss_runs: "Loss Runs",
  current_policy_declarations_page: "Current Policy Declarations Page",
  current_certificate_of_insurance: "Current Certificate Of Insurance",
  ifta_reports: "IFTA Reports",
  vehicle_schedule: "Vehicle Schedule",
  truck_registrations: "Truck Registrations",
  driver_licenses: "Driver Licenses",
  driver_list: "Driver List",
  mvr_reports: "MVR Reports",
  safety_reports: "Safety Reports",
  cargo_documentation: "Cargo Documentation",
  other_supporting_documents: "Other Supporting Documents"
});

export const REQUIRED_MARKETPLACE_DOCUMENT_TYPES = Object.freeze([
  "loss_runs",
  "current_policy_declarations_page",
  "ifta_reports",
  "truck_registrations",
  "driver_licenses",
  "vehicle_schedule"
]);

export const MARKETPLACE_ALLOWED_UPLOAD_TYPES = Object.freeze({
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "image/png": ".png",
  "image/jpeg": ".jpg"
});

export const MARKETPLACE_LEAD_STATUSES = Object.freeze([
  "New",
  "Available",
  "Purchased",
  "Assigned",
  "Quoted",
  "Closed"
]);

export const MARKETPLACE_LEAD_TIERS = Object.freeze(["Bronze", "Silver", "Gold"]);

const MARKETPLACE_PLAN_RULES = Object.freeze({
  basic: {
    label: "Starter",
    canPurchase: true,
    freeLeadsPerMonth: 0,
    discountedPrices: null,
    priorityNotifications: false,
    earlyAccessMinutes: 0
  },
  pro: {
    label: "Professional",
    canPurchase: true,
    freeLeadsPerMonth: 0,
    discountedPrices: null,
    priorityNotifications: true,
    earlyAccessMinutes: 0
  },
  premium: {
    label: "Elite",
    canPurchase: true,
    freeLeadsPerMonth: 10,
    discountedPrices: {
      Bronze: 10,
      Silver: 15,
      Gold: 20
    },
    priorityNotifications: true,
    earlyAccessMinutes: 30
  }
});

function normalizeDocumentType(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return MARKETPLACE_DOCUMENT_TYPES[normalized] ? normalized : "other_supporting_documents";
}

function normalizeStatus(value, fallback = "Available") {
  const normalized = String(value || fallback).trim();
  return MARKETPLACE_LEAD_STATUSES.includes(normalized) ? normalized : fallback;
}

function normalizeTier(value, fallback = "Bronze") {
  const normalized = String(value || fallback).trim();
  return MARKETPLACE_LEAD_TIERS.includes(normalized) ? normalized : fallback;
}

function toInteger(value, fallback = null) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toCurrency(value, fallback = null) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : fallback;
}

function sanitizeText(value) {
  return String(value || "").trim();
}

function splitList(value) {
  return Array.from(
    new Set(
      String(value || "")
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function normalizeBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["true", "1", "yes", "y", "on"].includes(normalized);
}

function normalizeCoverageWindow(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["7", "7 days", "7days"].includes(normalized)) return "7 Days";
  if (["30", "30 days", "30days"].includes(normalized)) return "30 Days";
  if (["60", "60 days", "60days"].includes(normalized)) return "60 Days";
  if (["90", "90 days", "90days"].includes(normalized)) return "90 Days";
  return "30 Days";
}

function coverageWindowDays(label) {
  switch (normalizeCoverageWindow(label)) {
    case "7 Days":
      return 7;
    case "60 Days":
      return 60;
    case "90 Days":
      return 90;
    default:
      return 30;
  }
}

function normalizeDate(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError("Renewal date must be a valid date.", "renewalDate");
  }
  return parsed.toISOString().slice(0, 10);
}

function daysUntil(dateValue) {
  if (!dateValue) return null;
  const target = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diff = Math.round((target.getTime() - start) / 86400000);
  return diff;
}

function money(value) {
  return Number(Number(value || 0).toFixed(2));
}

function getUploadRoot() {
  const configured = String(process.env.QUOTE_UPLOAD_DIR || "").trim();
  if (configured) return configured;
  return path.join(__dirname, "..", "storage", "quote-uploads");
}

export async function ensureMarketplaceUploadDir() {
  const uploadRoot = getUploadRoot();
  await fs.mkdir(uploadRoot, { recursive: true });
  return uploadRoot;
}

function primaryStateFromStates(statesOperated) {
  return splitList(statesOperated)[0] || "";
}

export function buildDocumentChecklist(documents = []) {
  const providedTypes = new Set(
    documents
      .filter((document) => document.status !== "deleted")
      .map((document) => normalizeDocumentType(document.document_type || document.documentType))
  );

  const checklist = {};
  let submitted = 0;
  for (const type of REQUIRED_MARKETPLACE_DOCUMENT_TYPES) {
    const present = providedTypes.has(type);
    checklist[type] = {
      label: MARKETPLACE_DOCUMENT_TYPES[type],
      present
    };
    if (present) submitted += 1;
  }

  const total = REQUIRED_MARKETPLACE_DOCUMENT_TYPES.length;
  return {
    submitted,
    total,
    percent: total ? Math.round((submitted / total) * 100) : 0,
    checklist
  };
}

function computeDataCompleteness(payload) {
  const fields = [
    payload.companyName,
    payload.dotNumber,
    payload.mcNumber,
    payload.yearsInBusiness,
    payload.powerUnits,
    payload.driverCount,
    payload.cargoHauled,
    payload.statesOperated,
    payload.contactName,
    payload.phoneNumber,
    payload.emailAddress,
    payload.currentInsuranceCompany,
    payload.renewalDate,
    payload.coverageTypesNeeded
  ];

  const populated = fields.filter((value) => {
    if (value == null) return false;
    if (typeof value === "number") return value >= 0;
    return String(value).trim().length > 0;
  }).length;

  return Math.round((populated / fields.length) * 100);
}

function computeLeadPricing(tier, score) {
  if (tier === "Gold") {
    if (score >= 95) return 100;
    if (score >= 90) return 95;
    if (score >= 85) return 85;
    return 75;
  }
  if (tier === "Silver") return 40;
  return 20;
}

export function scoreQuoteRequest(payload, documents = []) {
  const checklist = buildDocumentChecklist(documents);
  const contactVerified = Boolean(payload.emailAddress && payload.phoneNumber);
  const dataCompleteness = computeDataCompleteness(payload);
  const renewalDays = daysUntil(payload.renewalDate);
  const powerUnits = Math.max(0, Number(payload.powerUnits || 0));
  const activeShopping = Boolean(payload.activelyShopping);
  const hasLossRuns = documents.some((document) => normalizeDocumentType(document.document_type || document.documentType) === "loss_runs");
  const hasPolicy = documents.some((document) => normalizeDocumentType(document.document_type || document.documentType) === "current_policy_declarations_page");
  const hasVehicleSchedule = documents.some((document) => normalizeDocumentType(document.document_type || document.documentType) === "vehicle_schedule");

  let score = 0;

  if (powerUnits >= 10) score += 28;
  else if (powerUnits >= 3) score += 18;
  else if (powerUnits >= 1) score += 8;

  if (renewalDays != null) {
    if (renewalDays <= 30) score += 22;
    else if (renewalDays <= 60) score += 18;
    else if (renewalDays <= 90) score += 12;
    else score += 6;
  }

  score += Math.min(22, Math.round(checklist.percent * 0.22));
  score += activeShopping ? 12 : 3;
  score += contactVerified ? 8 : 0;
  score += Math.min(8, Math.round(dataCompleteness * 0.08));

  const silverReady =
    powerUnits >= 3 &&
    powerUnits <= 10 &&
    contactVerified &&
    Boolean(payload.renewalDate) &&
    documents.length >= 2;

  const goldReady =
    powerUnits >= 10 &&
    activeShopping &&
    renewalDays != null &&
    renewalDays <= 60 &&
    hasLossRuns &&
    hasPolicy &&
    hasVehicleSchedule;

  const leadTier = goldReady ? "Gold" : silverReady ? "Silver" : "Bronze";
  const leadScore = Math.max(0, Math.min(100, score));
  const leadPrice = computeLeadPricing(leadTier, leadScore);

  return {
    leadTier,
    leadScore,
    leadPrice,
    contactVerified,
    dataCompleteness,
    renewalProximityDays: renewalDays,
    documentCount: documents.filter((document) => document.status !== "deleted").length,
    documentCompletionPercent: checklist.percent,
    requiredDocumentsSubmitted: checklist.submitted,
    requiredDocumentsTotal: checklist.total,
    documentChecklist: checklist.checklist
  };
}

export function normalizeMarketplaceUploadMetadata(files = [], body = {}) {
  if (files.length > MAX_MARKETPLACE_FILES) {
    throw new ValidationError(`You can upload up to ${MAX_MARKETPLACE_FILES} files per quote request.`, "documents");
  }

  const documentTypes = Array.isArray(body.documentTypes)
    ? body.documentTypes
    : Array.isArray(body["documentTypes[]"])
      ? body["documentTypes[]"]
      : body.documentTypes
        ? [body.documentTypes]
        : body["documentTypes[]"]
          ? [body["documentTypes[]"]]
          : [];

  return files.map((file, index) => ({
    ...file,
    documentType: normalizeDocumentType(documentTypes[index])
  }));
}

function buildQuoteRequestPayload(body = {}) {
  const companyName = validateString(body.companyName, "Company name", 2, 180);
  const contactName = validateString(body.contactName, "Contact name", 2, 180);
  const phoneNumber = validatePhone(body.phoneNumber);
  const emailAddress = validateEmail(body.emailAddress);
  const statesOperated = validateString(body.statesOperated, "States operated", 2, 200);
  const cargoHauled = validateString(body.cargoHauled, "Cargo hauled", 2, 200);
  const coverageTypesNeeded = validateString(body.coverageTypesNeeded, "Coverage types needed", 2, 240);
  const currentInsuranceCompany = validateString(body.currentInsuranceCompany, "Current insurance company", 2, 180);
  const yearsInBusiness = Math.max(0, toInteger(body.yearsInBusiness, 0));
  const powerUnits = Math.max(0, toInteger(body.powerUnits, 0));
  const driverCount = Math.max(0, toInteger(body.driverCount, 0));
  const currentPremium = body.currentPremium ? toCurrency(body.currentPremium, null) : null;
  const renewalDate = normalizeDate(body.renewalDate);
  const coverageNeededWithin = normalizeCoverageWindow(body.coverageNeededWithin);

  if (!renewalDate) {
    throw new ValidationError("Renewal date is required.", "renewalDate");
  }
  if (powerUnits < 1) {
    throw new ValidationError("Number of power units must be at least 1.", "powerUnits");
  }
  if (driverCount < 1) {
    throw new ValidationError("Number of drivers must be at least 1.", "driverCount");
  }

  return {
    companyName,
    dotNumber: sanitizeText(body.dotNumber),
    mcNumber: sanitizeText(body.mcNumber),
    yearsInBusiness,
    powerUnits,
    driverCount,
    cargoHauled,
    statesOperated,
    primaryState: primaryStateFromStates(statesOperated),
    contactName,
    contactTitle: sanitizeText(body.title || body.contactTitle),
    phoneNumber,
    emailAddress,
    currentInsuranceCompany,
    currentPremium,
    renewalDate,
    coverageTypesNeeded,
    activelyShopping: normalizeBoolean(body.activelyShopping),
    coverageNeededWithin,
    additionalComments: sanitizeText(body.additionalComments)
  };
}

export async function getMarketplaceAccessSummary(user, client = null) {
  const plan = normalizePlan(user?.plan);
  const rule = MARKETPLACE_PLAN_RULES[plan] || MARKETPLACE_PLAN_RULES.basic;
  const active = hasActiveSubscription(user);
  const usedCredits = rule.freeLeadsPerMonth > 0 && user?.id
    ? await getMonthlyLeadCreditsUsed(user.id, client)
    : 0;

  return {
    internalPlan: plan,
    marketplacePlanLabel: rule.label,
    canAccessMarketplace: active && rule.canPurchase,
    canPurchaseLeads: active && rule.canPurchase,
    freeLeadCreditsPerMonth: rule.freeLeadsPerMonth,
    freeLeadCreditsUsed: usedCredits,
    freeLeadCreditsRemaining: Math.max(0, rule.freeLeadsPerMonth - usedCredits),
    discountedPrices: rule.discountedPrices,
    priorityNotifications: rule.priorityNotifications,
    earlyAccessMinutes: rule.earlyAccessMinutes
  };
}

async function getMonthlyLeadCreditsUsed(userId, client = null) {
  const db = client && typeof client.query === "function" ? client : { query };
  const monthKey = new Date().toISOString().slice(0, 7);
  const result = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM lead_credit_usage
     WHERE user_id = $1 AND credit_month = $2`,
    [userId, monthKey]
  );
  return result.rows[0]?.count || 0;
}

function visibleToUserClause(user) {
  const plan = normalizePlan(user?.plan);
  const earlyAccessMinutes = (MARKETPLACE_PLAN_RULES[plan] || MARKETPLACE_PLAN_RULES.basic).earlyAccessMinutes;
  return {
    earlyAccessMinutes,
    isElite: plan === "premium"
  };
}

function buildPublicLeadSummary(row) {
  return {
    id: row.id,
    leadTier: row.lead_tier,
    leadScore: row.lead_score,
    state: row.primary_state || "",
    fleetSize: row.power_units || 0,
    cargoType: row.cargo_hauled || "",
    renewalDate: row.renewal_date,
    renewalProximityDays: row.renewal_proximity_days,
    coverageNeeded: row.coverage_types_needed || "",
    documentCount: row.document_count || 0,
    requiredDocumentsSubmitted: row.required_documents_submitted || 0,
    requiredDocumentsTotal: row.required_documents_total || REQUIRED_MARKETPLACE_DOCUMENT_TYPES.length,
    documentCompletionPercent: row.document_completion_percent || 0,
    price: money(row.current_user_price ?? row.lead_price),
    listPrice: money(row.lead_price),
    submittedAt: row.created_at,
    status: row.status,
    activelyShopping: Boolean(row.actively_shopping)
  };
}

function buildRevealedLead(row, documents = []) {
  return {
    ...buildPublicLeadSummary(row),
    companyName: row.company_name,
    dotNumber: row.dot_number,
    mcNumber: row.mc_number,
    yearsInBusiness: row.years_in_business,
    numberOfDrivers: row.driver_count,
    statesOperated: row.states_operated,
    contactName: row.contact_name,
    contactTitle: row.contact_title,
    phoneNumber: row.phone_number,
    emailAddress: row.email_address,
    currentInsuranceCompany: row.current_insurance_company,
    currentPremium: row.current_premium == null ? null : money(row.current_premium),
    coverageNeededWithin: row.coverage_needed_within,
    additionalComments: row.additional_comments,
    contactVerified: Boolean(row.contact_verified),
    purchasedAt: row.purchased_at,
    purchasedBy: row.purchased_by,
    assignedUserId: row.assigned_user_id,
    isExclusive: Boolean(row.is_exclusive),
    documents: documents.map((document) => ({
      id: document.id,
      documentType: document.document_type,
      documentTypeLabel: MARKETPLACE_DOCUMENT_TYPES[normalizeDocumentType(document.document_type)] || document.document_type,
      originalFilename: document.original_filename,
      uploadedAt: document.uploaded_at,
      fileSize: Number(document.file_size || 0),
      mimeType: document.mime_type,
      status: document.status
    }))
  };
}

function buildMaskedLead(row) {
  return {
    ...buildPublicLeadSummary(row),
    companyName: null,
    dotNumber: null,
    mcNumber: null,
    contactName: null,
    contactTitle: null,
    phoneNumber: null,
    emailAddress: null,
    documents: [],
    masked: true,
    revealMessage: "Purchase this lead to reveal the carrier, contact, and underwriting documents."
  };
}

async function fetchDocumentsForQuoteRequest(quoteRequestId, client = null) {
  const db = client && typeof client.query === "function" ? client : { query };
  const result = await db.query(
    `SELECT id, quote_request_id, document_type, original_filename, stored_filename,
            uploaded_at, file_size, mime_type, storage_location, status,
            reviewed_by, reviewed_at, review_notes
     FROM lead_documents
     WHERE quote_request_id = $1
     ORDER BY uploaded_at ASC`,
    [quoteRequestId]
  );
  return result.rows;
}

async function fetchQuoteRequestById(quoteRequestId, client = null) {
  const db = client && typeof client.query === "function" ? client : { query };
  const result = await db.query(
    `SELECT qr.*,
            purchaser.name AS purchaser_name,
            purchaser.email AS purchaser_email,
            assignee.name AS assigned_user_name,
            assignee.email AS assigned_user_email
     FROM quote_requests qr
     LEFT JOIN users purchaser ON purchaser.id = qr.purchased_by
     LEFT JOIN users assignee ON assignee.id = qr.assigned_user_id
     WHERE qr.id = $1`,
    [quoteRequestId]
  );
  return result.rows[0] || null;
}

function marketplaceVisibleToUser(quoteRequest, user) {
  const { isElite } = visibleToUserClause(user);
  if (quoteRequest.purchased_by && Number(quoteRequest.purchased_by) === Number(user.id)) return true;
  if (quoteRequest.status !== "Available") return false;
  if (isElite) return true;
  if (!quoteRequest.standard_access_at) return true;
  return new Date(quoteRequest.standard_access_at).getTime() <= Date.now();
}

async function syncQuoteRequestDerivedFields(quoteRequestId, client = null) {
  const db = client && typeof client.query === "function" ? client : { query };
  const quoteRequest = await fetchQuoteRequestById(quoteRequestId, db);
  if (!quoteRequest) throw new NotFoundError("Quote request not found.");

  const documents = (await fetchDocumentsForQuoteRequest(quoteRequestId, db))
    .filter((document) => document.status !== "deleted");

  const scored = scoreQuoteRequest({
    companyName: quoteRequest.company_name,
    dotNumber: quoteRequest.dot_number,
    mcNumber: quoteRequest.mc_number,
    yearsInBusiness: quoteRequest.years_in_business,
    powerUnits: quoteRequest.power_units,
    driverCount: quoteRequest.driver_count,
    cargoHauled: quoteRequest.cargo_hauled,
    statesOperated: quoteRequest.states_operated,
    contactName: quoteRequest.contact_name,
    phoneNumber: quoteRequest.phone_number,
    emailAddress: quoteRequest.email_address,
    currentInsuranceCompany: quoteRequest.current_insurance_company,
    renewalDate: quoteRequest.renewal_date,
    coverageTypesNeeded: quoteRequest.coverage_types_needed,
    activelyShopping: quoteRequest.actively_shopping
  }, documents);

  const result = await db.query(
    `UPDATE quote_requests
     SET lead_tier = $2,
         lead_score = $3,
         lead_price = $4,
         document_count = $5,
         document_completion_percent = $6,
         required_documents_submitted = $7,
         required_documents_total = $8,
         document_checklist = $9::jsonb,
         contact_verified = $10,
         data_completeness_score = $11,
         renewal_proximity_days = $12,
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      quoteRequestId,
      scored.leadTier,
      scored.leadScore,
      scored.leadPrice,
      scored.documentCount,
      scored.documentCompletionPercent,
      scored.requiredDocumentsSubmitted,
      scored.requiredDocumentsTotal,
      JSON.stringify(scored.documentChecklist),
      scored.contactVerified,
      scored.dataCompleteness,
      scored.renewalProximityDays
    ]
  );

  return result.rows[0];
}

async function insertLeadDocuments(client, quoteRequestId, files = []) {
  for (const file of files) {
    await client.query(
      `INSERT INTO lead_documents (
         quote_request_id, document_type, original_filename, stored_filename,
         file_size, mime_type, storage_location
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        quoteRequestId,
        file.documentType,
        file.originalname,
        file.filename,
        file.size,
        file.mimetype,
        file.path
      ]
    );
  }
}

async function cleanupStoredFiles(files = []) {
  for (const file of files) {
    try {
      await fs.unlink(file.path);
    } catch (err) {
      if (err?.code !== "ENOENT") {
        console.warn("Failed to cleanup upload:", file.path, err.message);
      }
    }
  }
}

function buildStandardAccessAt(leadTier) {
  if (leadTier !== "Gold") return new Date().toISOString();
  const minutes = toInteger(process.env.MARKETPLACE_ELITE_EARLY_ACCESS_MINUTES, MARKETPLACE_PLAN_RULES.premium.earlyAccessMinutes);
  const date = new Date();
  date.setMinutes(date.getMinutes() + Math.max(0, minutes));
  return date.toISOString();
}

export async function createMarketplaceQuoteRequest({ body, files, req }) {
  const normalizedFiles = normalizeMarketplaceUploadMetadata(files, body);
  const payload = buildQuoteRequestPayload(body);
  const derived = scoreQuoteRequest(payload, normalizedFiles);
  const extraction = buildInitialExtractionSnapshot({
    currentInsuranceCompany: payload.currentInsuranceCompany,
    currentPremium: payload.currentPremium,
    powerUnits: payload.powerUnits
  });

  const client = await getClient();

  try {
    await client.query("BEGIN");

    const insertResult = await client.query(
      `INSERT INTO quote_requests (
         company_name, dot_number, mc_number, years_in_business, power_units, driver_count,
         cargo_hauled, states_operated, primary_state, contact_name, contact_title,
         phone_number, email_address, current_insurance_company, current_premium, renewal_date,
         coverage_types_needed, actively_shopping, coverage_needed_within, additional_comments,
         lead_tier, lead_score, lead_price, status, is_exclusive, document_count,
         document_completion_percent, required_documents_submitted, required_documents_total,
         document_checklist, contact_verified, data_completeness_score, renewal_proximity_days,
         standard_access_at, submission_source, submission_ip, submission_user_agent,
         ai_extraction_status, extracted_current_carrier, extracted_current_premium,
         extracted_coverage_limits, extracted_vin_numbers, extracted_vehicle_count,
         extracted_driver_names, extracted_driver_license_states, extracted_loss_history_summary
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16,
         $17, $18, $19, $20,
         $21, $22, $23, 'Available', true, $24,
         $25, $26, $27, $28::jsonb,
         $29, $30, $31, $32, 'public_quote_request', $33, $34,
         $35, $36, $37, $38, $39::jsonb, $40,
         $41::jsonb, $42::jsonb, $43
       )
       RETURNING *`,
      [
        payload.companyName,
        payload.dotNumber || null,
        payload.mcNumber || null,
        payload.yearsInBusiness,
        payload.powerUnits,
        payload.driverCount,
        payload.cargoHauled,
        payload.statesOperated,
        payload.primaryState || null,
        payload.contactName,
        payload.contactTitle || null,
        payload.phoneNumber,
        payload.emailAddress,
        payload.currentInsuranceCompany,
        payload.currentPremium,
        payload.renewalDate,
        payload.coverageTypesNeeded,
        payload.activelyShopping,
        payload.coverageNeededWithin,
        payload.additionalComments || null,
        derived.leadTier,
        derived.leadScore,
        derived.leadPrice,
        derived.documentCount,
        derived.documentCompletionPercent,
        derived.requiredDocumentsSubmitted,
        derived.requiredDocumentsTotal,
        JSON.stringify(derived.documentChecklist),
        derived.contactVerified,
        derived.dataCompleteness,
        derived.renewalProximityDays,
        buildStandardAccessAt(derived.leadTier),
        req?.ip || null,
        sanitizeText(req?.headers?.["user-agent"]),
        extraction.aiExtractionStatus,
        extraction.extractedCurrentCarrier,
        extraction.extractedCurrentPremium,
        extraction.extractedCoverageLimits,
        JSON.stringify(extraction.extractedVinNumbers),
        extraction.extractedVehicleCount,
        JSON.stringify(extraction.extractedDriverNames),
        JSON.stringify(extraction.extractedDriverLicenseStates),
        extraction.extractedLossHistorySummary
      ]
    );

    const quoteRequest = insertResult.rows[0];
    await insertLeadDocuments(client, quoteRequest.id, normalizedFiles);
    await client.query("COMMIT");

    const fullQuoteRequest = await fetchQuoteRequestById(quoteRequest.id);
    const documents = await fetchDocumentsForQuoteRequest(quoteRequest.id);

    queueQuoteRequestExtraction(fullQuoteRequest, documents).catch((err) => {
      console.warn("Marketplace extraction queue skipped:", err.message);
    });

    notifyAdminOfNewQuoteRequest(fullQuoteRequest).catch((err) => {
      console.warn("Marketplace admin notification failed:", err.message);
    });
    notifyPrioritySubscribersOfLead(fullQuoteRequest).catch((err) => {
      console.warn("Priority marketplace notification failed:", err.message);
    });
    notifyEliteUsersOfGoldLead(fullQuoteRequest).catch((err) => {
      console.warn("Gold marketplace notification failed:", err.message);
    });

    return buildRevealedLead(fullQuoteRequest, documents);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    await cleanupStoredFiles(normalizedFiles);
    throw err;
  } finally {
    client.release();
  }
}

export async function listMarketplaceLeadsForUser(user, { limit = 50, tier = "", state = "", status = "" } = {}) {
  const access = await getMarketplaceAccessSummary(user);
  if (!access.canAccessMarketplace) {
    throw new AuthorizationError("Choose an active paid plan to access the lead marketplace.");
  }

  const plan = normalizePlan(user?.plan);
  const { isElite } = visibleToUserClause(user);
  const values = [user.id];
  const filters = [
    `(qr.status = 'Available' OR qr.purchased_by = $1)`
  ];

  if (!isElite) {
    values.push(new Date().toISOString());
    filters.push(`(qr.standard_access_at IS NULL OR qr.standard_access_at <= $${values.length}::timestamptz OR qr.purchased_by = $1)`);
  }

  if (tier) {
    values.push(normalizeTier(tier, tier));
    filters.push(`qr.lead_tier = $${values.length}`);
  }

  if (state) {
    values.push(String(state).trim().toUpperCase());
    filters.push(`upper(COALESCE(qr.primary_state, '')) = $${values.length}`);
  }

  if (status) {
    values.push(normalizeStatus(status, status));
    filters.push(`qr.status = $${values.length}`);
  }

  const rule = MARKETPLACE_PLAN_RULES[plan] || MARKETPLACE_PLAN_RULES.basic;
  const discountedGold = rule.discountedPrices?.Gold ?? null;
  const discountedSilver = rule.discountedPrices?.Silver ?? null;
  const discountedBronze = rule.discountedPrices?.Bronze ?? null;
  const freeCreditsRemaining = access.freeLeadCreditsRemaining;
  const limitedRows = Math.max(1, Math.min(200, Number(limit || 50)));

  values.push(freeCreditsRemaining);
  const freeCreditsIndex = values.length;
  values.push(plan);
  const planIndex = values.length;
  values.push(discountedGold);
  const goldPriceIndex = values.length;
  values.push(discountedSilver);
  const silverPriceIndex = values.length;
  values.push(discountedBronze);
  const bronzePriceIndex = values.length;
  values.push(limitedRows);
  const limitIndex = values.length;

  const result = await query(
    `SELECT qr.*,
            lp.id AS my_purchase_id,
            lp.purchase_amount AS my_purchase_amount,
            lp.used_credit AS my_used_credit,
            CASE
              WHEN lp.id IS NOT NULL THEN lp.purchase_amount
              WHEN $${freeCreditsIndex}::int > 0 AND $${planIndex} = 'premium' THEN 0
              WHEN $${planIndex} = 'premium' AND qr.lead_tier = 'Gold' THEN $${goldPriceIndex}
              WHEN $${planIndex} = 'premium' AND qr.lead_tier = 'Silver' THEN $${silverPriceIndex}
              WHEN $${planIndex} = 'premium' AND qr.lead_tier = 'Bronze' THEN $${bronzePriceIndex}
              ELSE qr.lead_price
            END AS current_user_price
     FROM quote_requests qr
     LEFT JOIN lead_purchases lp
       ON lp.quote_request_id = qr.id
      AND lp.user_id = $1
     WHERE ${filters.join(" AND ")}
     ORDER BY
       CASE qr.lead_tier WHEN 'Gold' THEN 1 WHEN 'Silver' THEN 2 ELSE 3 END,
       qr.lead_score DESC,
       qr.created_at DESC
     LIMIT $${limitIndex}`,
    values
  );

  return {
    access,
    leads: result.rows.map((row) => {
      const purchased = Boolean(row.my_purchase_id || Number(row.purchased_by) === Number(user.id));
      return purchased ? buildRevealedLead(row, []) : buildMaskedLead(row);
    })
  };
}

export async function getMarketplaceLeadForUser(user, quoteRequestId) {
  const access = await getMarketplaceAccessSummary(user);
  if (!access.canAccessMarketplace) {
    throw new AuthorizationError("Choose an active paid plan to access the lead marketplace.");
  }

  const quoteRequest = await fetchQuoteRequestById(quoteRequestId);
  if (!quoteRequest) {
    throw new NotFoundError("Marketplace lead not found.");
  }

  const purchased = Number(quoteRequest.purchased_by) === Number(user.id) ||
    Boolean(
      (
        await query(
          `SELECT id FROM lead_purchases WHERE quote_request_id = $1 AND user_id = $2`,
          [quoteRequestId, user.id]
        )
      ).rows[0]
    );

  if (!purchased && !marketplaceVisibleToUser(quoteRequest, user)) {
    throw new AuthorizationError("This lead is not available on your plan yet.");
  }

  const documents = purchased ? await fetchDocumentsForQuoteRequest(quoteRequestId) : [];
  return purchased ? buildRevealedLead(quoteRequest, documents) : buildMaskedLead(quoteRequest);
}

async function upsertCrmLeadForPurchase(client, userId, quoteRequest) {
  const marker = `Marketplace Lead ID: ${quoteRequest.id}`;
  const existing = await client.query(
    `SELECT id
     FROM leads
     WHERE user_id = $1
       AND notes ILIKE $2
     LIMIT 1`,
    [userId, `%${marker}%`]
  );

  const notes = [
    marker,
    `Contact: ${quoteRequest.contact_name || ""}`.trim(),
    `Phone: ${quoteRequest.phone_number || ""}`.trim(),
    `Email: ${quoteRequest.email_address || ""}`.trim(),
    `State: ${quoteRequest.primary_state || ""}`.trim(),
    `Cargo: ${quoteRequest.cargo_hauled || ""}`.trim(),
    `Coverage Needed: ${quoteRequest.coverage_types_needed || ""}`.trim(),
    `Document Completion: ${quoteRequest.document_completion_percent || 0}%`
  ].filter(Boolean).join("\n");

  if (existing.rows[0]) {
    await client.query(
      `UPDATE leads
       SET notes = $2,
           insurance_expiration = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [existing.rows[0].id, notes, quoteRequest.renewal_date || null]
    );
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `INSERT INTO leads (
       user_id, carrier_name, dot_number, mc_number, status,
       insurance_expiration, notes
     )
     VALUES ($1, $2, $3, $4, 'New', $5, $6)
     RETURNING id`,
    [
      userId,
      quoteRequest.company_name,
      quoteRequest.dot_number || null,
      quoteRequest.mc_number || null,
      quoteRequest.renewal_date || null,
      notes
    ]
  );

  return inserted.rows[0].id;
}

async function resolveLeadPriceForUser(client, user, quoteRequest) {
  const plan = normalizePlan(user?.plan);
  const rule = MARKETPLACE_PLAN_RULES[plan] || MARKETPLACE_PLAN_RULES.basic;
  const access = await getMarketplaceAccessSummary(user, client);

  if (plan === "premium" && access.freeLeadCreditsRemaining > 0) {
    return {
      access,
      finalPrice: 0,
      usedCredit: true,
      creditValue: money(quoteRequest.lead_price)
    };
  }

  if (plan === "premium" && rule.discountedPrices?.[quoteRequest.lead_tier] != null) {
    return {
      access,
      finalPrice: money(rule.discountedPrices[quoteRequest.lead_tier]),
      usedCredit: false,
      creditValue: 0
    };
  }

  return {
    access,
    finalPrice: money(quoteRequest.lead_price),
    usedCredit: false,
    creditValue: 0
  };
}

export async function purchaseMarketplaceLead(user, quoteRequestId) {
  const access = await getMarketplaceAccessSummary(user);
  if (!access.canPurchaseLeads) {
    throw new AuthorizationError("Choose an active paid plan to purchase marketplace leads.");
  }

  const client = await getClient();

  try {
    await client.query("BEGIN");

    const leadResult = await client.query(
      `SELECT *
       FROM quote_requests
       WHERE id = $1
       FOR UPDATE`,
      [quoteRequestId]
    );
    const quoteRequest = leadResult.rows[0];

    if (!quoteRequest) {
      throw new NotFoundError("Marketplace lead not found.");
    }

    const existingPurchase = await client.query(
      `SELECT *
       FROM lead_purchases
       WHERE quote_request_id = $1 AND user_id = $2
       LIMIT 1`,
      [quoteRequestId, user.id]
    );
    if (existingPurchase.rows[0]) {
      await client.query("COMMIT");
      const documents = await fetchDocumentsForQuoteRequest(quoteRequestId);
      return {
        purchased: true,
        alreadyOwned: true,
        lead: buildRevealedLead(quoteRequest, documents),
        pricePaid: money(existingPurchase.rows[0].purchase_amount),
        usedCredit: Boolean(existingPurchase.rows[0].used_credit)
      };
    }

    if (quoteRequest.status !== "Available") {
      throw new ConflictError("This lead is no longer available.");
    }

    if (!marketplaceVisibleToUser(quoteRequest, user)) {
      throw new AuthorizationError("This lead is still in Elite early access.");
    }

    const pricing = await resolveLeadPriceForUser(client, user, quoteRequest);
    const chargeResult = pricing.usedCredit
      ? { success: true, paymentIntentId: null, provider: "credit" }
      : await chargeMarketplaceLead({
          user,
          quoteRequest,
          amount: pricing.finalPrice,
          metadata: {
            leadTier: quoteRequest.lead_tier,
            userPlan: normalizePlan(user?.plan)
          }
        });

    const purchaseResult = await client.query(
      `INSERT INTO lead_purchases (
         quote_request_id, user_id, list_price, purchase_amount, lead_tier,
         payment_status, stripe_payment_intent_id, used_credit, credit_value, exclusive_access
       )
       VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7, $8, $9)
       RETURNING *`,
      [
        quoteRequestId,
        user.id,
        money(quoteRequest.lead_price),
        money(pricing.finalPrice),
        quoteRequest.lead_tier,
        chargeResult.paymentIntentId,
        pricing.usedCredit,
        money(pricing.creditValue),
        Boolean(quoteRequest.is_exclusive)
      ]
    );

    if (pricing.usedCredit) {
      const monthKey = new Date().toISOString().slice(0, 7);
      await client.query(
        `INSERT INTO lead_credit_usage (
           user_id, quote_request_id, purchase_id, credits_used, credit_type, credit_month, discount_applied
         )
         VALUES ($1, $2, $3, 1, 'elite-monthly', $4, $5)`,
        [user.id, quoteRequestId, purchaseResult.rows[0].id, monthKey, money(quoteRequest.lead_price)]
      );
    }

    await client.query(
      `UPDATE quote_requests
       SET status = 'Purchased',
           purchased_at = NOW(),
           purchased_by = $2,
           assigned_user_id = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [quoteRequestId, user.id]
    );

    await upsertCrmLeadForPurchase(client, user.id, quoteRequest);

    await recordPurchaseNotification({
      userId: user.id,
      quoteRequestId,
      title: "Marketplace lead unlocked",
      message: `${quoteRequest.company_name} has been added to your workspace and CRM.`,
      metadata: {
        purchaseAmount: pricing.finalPrice,
        usedCredit: pricing.usedCredit
      }
    }, client);

    await client.query("COMMIT");

    const refreshedLead = await fetchQuoteRequestById(quoteRequestId);
    const documents = await fetchDocumentsForQuoteRequest(quoteRequestId);
    return {
      purchased: true,
      alreadyOwned: false,
      lead: buildRevealedLead(refreshedLead, documents),
      pricePaid: money(pricing.finalPrice),
      usedCredit: pricing.usedCredit,
      freeLeadCreditsRemaining: pricing.access.freeLeadCreditsRemaining - (pricing.usedCredit ? 1 : 0)
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function getMarketplaceDocumentForDownload({ quoteRequestId, documentId, user, adminMode = false }) {
  const quoteRequest = await fetchQuoteRequestById(quoteRequestId);
  if (!quoteRequest) {
    throw new NotFoundError("Marketplace lead not found.");
  }

  if (!adminMode) {
    const purchased = Number(quoteRequest.purchased_by) === Number(user.id) ||
      Boolean((await query(
        `SELECT 1 FROM lead_purchases WHERE quote_request_id = $1 AND user_id = $2`,
        [quoteRequestId, user.id]
      )).rows[0]);
    if (!purchased) {
      throw new AuthorizationError("Purchase this lead before downloading its documents.");
    }
  }

  const result = await query(
    `SELECT *
     FROM lead_documents
     WHERE id = $1 AND quote_request_id = $2`,
    [documentId, quoteRequestId]
  );
  const document = result.rows[0];

  if (!document) {
    throw new NotFoundError("Lead document not found.");
  }

  return document;
}

export async function getAdminMarketplaceLeads({ limit = 200 } = {}) {
  const result = await query(
    `SELECT qr.*,
            purchaser.name AS purchaser_name,
            purchaser.email AS purchaser_email,
            assignee.name AS assigned_user_name,
            assignee.email AS assigned_user_email
     FROM quote_requests qr
     LEFT JOIN users purchaser ON purchaser.id = qr.purchased_by
     LEFT JOIN users assignee ON assignee.id = qr.assigned_user_id
     ORDER BY qr.created_at DESC
     LIMIT $1`,
    [Math.max(1, Math.min(500, Number(limit || 200)))]
  );

  const leads = [];
  for (const row of result.rows) {
    const documents = await fetchDocumentsForQuoteRequest(row.id);
    const purchases = await query(
      `SELECT lp.id, lp.user_id, lp.purchase_amount, lp.list_price, lp.used_credit,
              lp.created_at, u.name, u.email
       FROM lead_purchases lp
       LEFT JOIN users u ON u.id = lp.user_id
       WHERE lp.quote_request_id = $1
       ORDER BY lp.created_at DESC`,
      [row.id]
    );

    leads.push({
      ...buildRevealedLead(row, documents),
      purchaserName: row.purchaser_name,
      purchaserEmail: row.purchaser_email,
      assignedUserName: row.assigned_user_name,
      assignedUserEmail: row.assigned_user_email,
      purchases: purchases.rows.map((purchase) => ({
        id: purchase.id,
        userId: purchase.user_id,
        pricePaid: money(purchase.purchase_amount),
        listPrice: money(purchase.list_price),
        usedCredit: Boolean(purchase.used_credit),
        createdAt: purchase.created_at,
        name: purchase.name,
        email: purchase.email
      }))
    });
  }

  return leads;
}

export async function updateMarketplaceLeadAdmin(quoteRequestId, payload = {}) {
  const allowed = new Map([
    ["leadTier", "lead_tier"],
    ["leadScore", "lead_score"],
    ["leadPrice", "lead_price"],
    ["status", "status"],
    ["assignedUserId", "assigned_user_id"],
    ["isExclusive", "is_exclusive"]
  ]);

  const updates = [];
  const values = [];

  for (const [inputKey, columnName] of allowed.entries()) {
    if (!Object.prototype.hasOwnProperty.call(payload, inputKey)) continue;

    let value = payload[inputKey];
    if (inputKey === "leadTier") value = normalizeTier(value, "Bronze");
    if (inputKey === "leadScore") value = Math.max(0, Math.min(100, toInteger(value, 0)));
    if (inputKey === "leadPrice") value = money(toCurrency(value, 0));
    if (inputKey === "status") value = normalizeStatus(value, "Available");
    if (inputKey === "assignedUserId") value = value ? toInteger(value, null) : null;
    if (inputKey === "isExclusive") value = Boolean(value);

    values.push(value);
    updates.push(`${columnName} = $${values.length}`);
  }

  if (!updates.length) {
    throw new ValidationError("No admin lead updates were provided.");
  }

  values.push(quoteRequestId);

  const result = await query(
    `UPDATE quote_requests
     SET ${updates.join(", ")},
         updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );

  const updated = result.rows[0];
  if (!updated) {
    throw new NotFoundError("Marketplace lead not found.");
  }

  const documents = await fetchDocumentsForQuoteRequest(quoteRequestId);
  return buildRevealedLead(updated, documents);
}

export async function updateMarketplaceDocumentAdmin({ quoteRequestId, documentId, status, reviewerId, reviewNotes = "" }) {
  const normalizedStatus = ["pending", "approved", "rejected"].includes(String(status || "").toLowerCase())
    ? String(status).toLowerCase()
    : null;
  if (!normalizedStatus) {
    throw new ValidationError("Document status must be pending, approved, or rejected.");
  }

  const result = await query(
    `UPDATE lead_documents
     SET status = $3,
         reviewed_by = $4,
         reviewed_at = NOW(),
         review_notes = $5
     WHERE id = $1 AND quote_request_id = $2
     RETURNING *`,
    [documentId, quoteRequestId, normalizedStatus, reviewerId, sanitizeText(reviewNotes) || null]
  );

  if (!result.rows[0]) {
    throw new NotFoundError("Lead document not found.");
  }

  await syncQuoteRequestDerivedFields(quoteRequestId);
  return result.rows[0];
}

export async function deleteMarketplaceDocumentAdmin({ quoteRequestId, documentId }) {
  const result = await query(
    `DELETE FROM lead_documents
     WHERE id = $1 AND quote_request_id = $2
     RETURNING *`,
    [documentId, quoteRequestId]
  );

  const document = result.rows[0];
  if (!document) {
    throw new NotFoundError("Lead document not found.");
  }

  try {
    await fs.unlink(document.storage_location);
  } catch (err) {
    if (err?.code !== "ENOENT") {
      console.warn("Failed to delete lead document file:", err.message);
    }
  }

  await syncQuoteRequestDerivedFields(quoteRequestId);
  return document;
}
