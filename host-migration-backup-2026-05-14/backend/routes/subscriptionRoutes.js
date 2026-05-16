import { Router } from "express";
import {
  getMySubscription,
  updateLocalDevSubscriptionPlan
} from "../controllers/subscriptionController.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/me", authRequired, getMySubscription);
router.post("/dev-plan", authRequired, updateLocalDevSubscriptionPlan);

export default router;
