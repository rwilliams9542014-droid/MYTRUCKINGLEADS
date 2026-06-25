import { Router } from "express";
import {
  clearOwnerPreviewSession,
  getFmcsaDiagnostics,
  getOwnerOverview,
  getWebhookHealth,
  listUsers,
  setOwnerPreviewSession,
  syncUserStripe,
  updateContactRequestStatus
} from "../controllers/adminController.js";
import {
  addOwnerSubscriberNote,
  cancelOwnerSubscriber,
  freezeOwnerSubscriber,
  getInsuranceRenewalDebug,
  getOwnerActivity,
  getOwnerAlerts,
  getOwnerDataFreshness,
  getOwnerHealth,
  getOwnerInsuranceSourceHealth,
  getOwnerRevenue,
  getOwnerSubscriber,
  getOwnerSubscribers,
  getOwnerSummary,
  runOwnerInsuranceImport,
  unfreezeOwnerSubscriber
} from "../controllers/ownerAdminController.js";
import { authRequired } from "../middleware/authMiddleware.js";
import { ownerRequired } from "../middleware/ownerMiddleware.js";

const router = Router();

router.use(authRequired, ownerRequired);

router.get("/overview", getOwnerOverview);
router.get("/users", listUsers);
router.get("/webhook-health", getWebhookHealth);
router.get("/owner/summary", getOwnerSummary);
router.get("/owner/health", getOwnerHealth);
router.get("/owner/subscribers", getOwnerSubscribers);
router.get("/owner/subscribers/:id", getOwnerSubscriber);
router.patch("/owner/subscribers/:id/freeze", freezeOwnerSubscriber);
router.patch("/owner/subscribers/:id/unfreeze", unfreezeOwnerSubscriber);
router.post("/owner/subscribers/:id/cancel", cancelOwnerSubscriber);
router.post("/owner/subscribers/:id/note", addOwnerSubscriberNote);
router.get("/owner/revenue", getOwnerRevenue);
router.get("/owner/activity", getOwnerActivity);
router.get("/owner/data-freshness", getOwnerDataFreshness);
router.get("/owner/insurance-sources", getOwnerInsuranceSourceHealth);
router.post("/owner/insurance-import", runOwnerInsuranceImport);
router.get("/insurance-renewals/debug", getInsuranceRenewalDebug);
router.get("/owner/alerts", getOwnerAlerts);
router.get("/fmcsa-diagnostics/:dotNumber", getFmcsaDiagnostics);
router.post("/users/:id/sync-stripe", syncUserStripe);
router.post("/preview-session", setOwnerPreviewSession);
router.delete("/preview-session", clearOwnerPreviewSession);
router.patch("/contact-requests/:id", updateContactRequestStatus);

export default router;
