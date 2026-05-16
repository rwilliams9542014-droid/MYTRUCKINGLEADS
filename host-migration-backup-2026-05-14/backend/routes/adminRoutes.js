import { Router } from "express";
import { getWebhookHealth, listUsers, syncUserStripe } from "../controllers/adminController.js";
import { authRequired } from "../middleware/authMiddleware.js";
import { ownerRequired } from "../middleware/ownerMiddleware.js";

const router = Router();

router.use(authRequired, ownerRequired);

router.get("/users", listUsers);
router.get("/webhook-health", getWebhookHealth);
router.post("/users/:id/sync-stripe", syncUserStripe);

export default router;
