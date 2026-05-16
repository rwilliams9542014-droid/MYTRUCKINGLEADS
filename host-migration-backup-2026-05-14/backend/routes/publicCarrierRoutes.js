import { Router } from "express";
import {
  getLocalCarrierByDot,
  listLocalCarriers
} from "../controllers/localCarrierController.js";

const router = Router();

router.get("/", listLocalCarriers);
router.get("/:dotNumber", getLocalCarrierByDot);

export default router;
