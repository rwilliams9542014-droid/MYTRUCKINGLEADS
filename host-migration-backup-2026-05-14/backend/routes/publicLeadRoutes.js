import { Router } from "express";
import { getNewCarrierLeads, getRenewalLeads } from "../controllers/localCarrierController.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/new", authRequired, getNewCarrierLeads);
router.get("/renewals", authRequired, getRenewalLeads);

export default router;
