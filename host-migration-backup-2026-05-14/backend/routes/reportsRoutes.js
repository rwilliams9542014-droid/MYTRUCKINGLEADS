import { Router } from "express";
import { 
  getSubscriptionAnalytics, 
  getAccountActivity, 
  getDashboardSummary 
} from "../controllers/reportsController.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = Router();

// All reports require authentication
router.use(authRequired);

// Get subscription analytics for current user
router.get("/subscription-analytics", getSubscriptionAnalytics);

// Get account activity for current user
router.get("/account-activity", getAccountActivity);

// Get dashboard summary
router.get("/summary", getDashboardSummary);

export default router;
