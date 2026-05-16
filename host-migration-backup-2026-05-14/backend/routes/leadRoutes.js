import { Router } from "express";
import {
  getLeads,
  createLead,
  updateLead,
  deleteLead
} from "../controllers/leadController.js";
import { getExpiringInsurance } from "../controllers/insuranceController.js";
import {
  getNewCarrierLeads,
  getRenewalLeads
} from "../controllers/localCarrierController.js";
import { authRequired } from "../middleware/authMiddleware.js";
import {
  enforceTrialSaveLimit,
  enforceTrialSearchLimit
} from "../middleware/trialMiddleware.js";

const router = Router();

function getRenewals(req, res, next) {
  if (String(req.query.source || "").toLowerCase() === "saved") {
    return getExpiringInsurance(req, res, next);
  }

  return getRenewalLeads(req, res);
}

router.get("/", authRequired, getLeads);
router.get("/renewals", authRequired, enforceTrialSearchLimit, getRenewals);
router.get("/new", authRequired, enforceTrialSearchLimit, getNewCarrierLeads);
router.post("/", authRequired, enforceTrialSaveLimit, createLead);
router.post("/save", authRequired, enforceTrialSaveLimit, createLead);
router.put("/:id", authRequired, updateLead);
router.delete("/:id", authRequired, deleteLead);

export default router;
