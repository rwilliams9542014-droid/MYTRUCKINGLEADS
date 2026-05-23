import { Router } from "express";
import { getProducerDashboardSummary } from "../controllers/dashboardController.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/producer-summary", authRequired, getProducerDashboardSummary);

export default router;
