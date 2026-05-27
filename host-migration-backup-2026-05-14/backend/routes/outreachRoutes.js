import { Router } from "express";
import { authRequired } from "../middleware/authMiddleware.js";
import { requireBulkMessagingAccess, requireEmailAccess, requireSmsAccess } from "../middleware/outreachAccessMiddleware.js";
import {
  getLogs,
  getTemplates,
  getUsage,
  optOutContact,
  previewMessage,
  sendBulkEmail,
  sendBulkSms,
  sendEmail,
  sendSms,
  smsWebhook
} from "../controllers/outreachController.js";

const router = Router();

router.post("/sms/webhook", smsWebhook);

router.use(authRequired);

router.get("/templates", getTemplates);
router.get("/usage", getUsage);
router.get("/logs", getLogs);
router.post("/preview", previewMessage);
router.post("/email/send", requireEmailAccess, sendEmail);
router.post("/email/send-bulk", requireBulkMessagingAccess, sendBulkEmail);
router.post("/sms/send", requireSmsAccess, sendSms);
router.post("/sms/send-bulk", requireBulkMessagingAccess, sendBulkSms);
router.post("/opt-out", optOutContact);

export default router;
