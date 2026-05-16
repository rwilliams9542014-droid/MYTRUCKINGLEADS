import { Router } from "express";
import { submitContactRequest } from "../controllers/contactController.js";

const router = Router();

router.post("/", submitContactRequest);

export default router;
