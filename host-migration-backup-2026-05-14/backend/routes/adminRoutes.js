import { Router } from "express";
import {
  clearOwnerPreviewSession,
  getOwnerOverview,
  getWebhookHealth,
  listUsers,
  setOwnerPreviewSession,
  syncUserStripe,
  updateContactRequestStatus
} from "../controllers/adminController.js";
import { authRequired } from "../middleware/authMiddleware.js";
import { ownerRequired } from "../middleware/ownerMiddleware.js";

const router = Router();

router.use(authRequired, ownerRequired);

router.get("/overview", getOwnerOverview);
router.get("/users", listUsers);
router.get("/webhook-health", getWebhookHealth);
router.post("/users/:id/sync-stripe", syncUserStripe);
router.post("/preview-session", setOwnerPreviewSession);
router.delete("/preview-session", clearOwnerPreviewSession);
router.patch("/contact-requests/:id", updateContactRequestStatus);

export default router;
