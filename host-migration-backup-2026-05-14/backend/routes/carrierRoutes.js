import { Router } from "express";
import {
  getCarrier,
  getCarrierInsuranceByDot,
  verifyCarrierEmail,
  getNewEntrants,
  searchProspectLeads,
  exportProspectLeads,
  searchNewVentures,
  exportNewVentures,
  claimExportQuota,
  searchOTruckingAndEnrich,
  getOTruckingDetail,
  browseOTruckingByState,
  batchSearchOTruckingCarriers
} from "../controllers/carrierController.js";
import { enrichSelectedCarrierDetails, listLocalCarriers } from "../controllers/localCarrierController.js";
import {
  getCarrierIntelligenceLicensingInsurance,
  getCarrierIntelligenceProfile,
  getCarrierIntelligenceSafety,
  searchCarrierIntelligence
} from "../controllers/carrierIntelligenceController.js";
import { authOptional, authRequired } from "../middleware/authMiddleware.js";
import {
  blockTrialCsvExport,
  enforceTrialProfileLimit,
  enforceTrialSearchLimit
} from "../middleware/trialMiddleware.js";

const router = Router();

function getCarrierIndex(req, res) {
  const shouldUseLiveLookup =
    req.baseUrl.endsWith("/carrier") ||
    String(req.query.live || "").toLowerCase() === "true";

  if (shouldUseLiveLookup) {
    return getCarrier(req, res);
  }

  return listLocalCarriers(req, res);
}

// Public carrier intelligence endpoints used by the homepage demo.
router.get("/search", authOptional, enforceTrialSearchLimit, searchCarrierIntelligence);

// Search local MongoDB carrier data by DOT/name/state/status/insurance window.
// Use /api/carrier?dot=123 or /api/carriers?live=true&dot=123 for live FMCSA enrichment.
router.get("/", authRequired, getCarrierIndex);
router.post("/enrich-selected", authRequired, enrichSelectedCarrierDetails);

// Verify a carrier email address independently (requires auth)
router.post("/verify-email", authRequired, verifyCarrierEmail);
router.get("/verify-email", authRequired, verifyCarrierEmail);

// Get new entrant alerts (requires auth)
router.get("/new-entrants", authRequired, getNewEntrants);

// Search/export saved prospect data using DOT Leads-style filters (requires auth)
router.get("/prospects/search", authRequired, enforceTrialSearchLimit, searchProspectLeads);
router.get("/prospects/export", authRequired, blockTrialCsvExport, exportProspectLeads);
router.post("/exports/claim", authRequired, blockTrialCsvExport, claimExportQuota);

// New applicant/new venture motor carrier leads from FMCSA census data
router.get("/new-ventures/search", authRequired, enforceTrialSearchLimit, searchNewVentures);
router.get("/new-ventures/export", authRequired, blockTrialCsvExport, exportNewVentures);

// ======== OTrucking.com Integration Routes ========

// Search otrucking.com and enrich with email data
// GET /api/carriers/otrucking/search?query=trucking&state=CA&enrichEmail=true
router.get("/otrucking/search", authRequired, searchOTruckingAndEnrich);

// Get detailed carrier info from otrucking.com
// GET /api/carriers/otrucking/detail/1234567
router.get("/otrucking/detail/:dot", authRequired, getOTruckingDetail);

// Browse carriers by state on otrucking.com
// GET /api/carriers/otrucking/state/CA?limit=50
router.get("/otrucking/state/:stateCode", authRequired, browseOTruckingByState);

// Batch search multiple carriers from otrucking.com
// POST /api/carriers/otrucking/batch-search
router.post("/otrucking/batch-search", authRequired, batchSearchOTruckingCarriers);

// Public homepage lookup can read non-contact carrier details without auth.
router.get("/:dotNumber/safety", authOptional, getCarrierIntelligenceSafety);
router.get("/:dotNumber/sms", authOptional, getCarrierIntelligenceSafety);
router.get("/:dotNumber/licensing-insurance", authOptional, getCarrierIntelligenceLicensingInsurance);
router.get("/:dotNumber/insurance", authRequired, getCarrierInsuranceByDot);
router.get("/:dotNumber", authOptional, enforceTrialProfileLimit, getCarrierIntelligenceProfile);

export default router;
