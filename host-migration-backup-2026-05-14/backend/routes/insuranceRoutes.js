import { Router } from "express";
import { getExpiringInsurance, getActiveInsurance } from "../controllers/insuranceController.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = Router();

// Get carriers with expiring insurance (current month + 90 days)
router.get("/expiring", authRequired, getExpiringInsurance);

// Get carriers with active insurance (after 90 days)
router.get("/active", authRequired, getActiveInsurance);

export default router;
