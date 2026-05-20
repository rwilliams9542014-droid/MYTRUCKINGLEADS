import { Router } from "express";
import { searchFmcsaCarrier } from "../controllers/fmcsaController.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = Router();

router.get("/carrier-search", authRequired, searchFmcsaCarrier);

export default router;
