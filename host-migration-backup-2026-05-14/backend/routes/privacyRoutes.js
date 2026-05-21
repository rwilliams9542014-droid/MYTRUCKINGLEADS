import { Router } from "express";
import { submitPrivacyRequest } from "../controllers/privacyController.js";

const router = Router();

router.post("/", submitPrivacyRequest);

export default router;
