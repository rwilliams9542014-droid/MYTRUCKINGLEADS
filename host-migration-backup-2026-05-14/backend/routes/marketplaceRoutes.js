import crypto from "crypto";
import path from "node:path";
import multer from "multer";
import { Router } from "express";
import {
  deleteAdminMarketplaceDocument,
  downloadMarketplaceLeadDocument,
  getAdminMarketplaceLeadList,
  getMarketplaceLead,
  getMarketplaceLeads,
  getMarketplaceNotifications,
  markMarketplaceNotificationReadAction,
  purchaseMarketplaceLeadAction,
  submitMarketplaceQuoteRequest,
  updateAdminMarketplaceDocument,
  updateAdminMarketplaceLead
} from "../controllers/marketplaceController.js";
import { authRequired } from "../middleware/authMiddleware.js";
import { ownerRequired } from "../middleware/ownerMiddleware.js";
import {
  ensureMarketplaceUploadDir,
  MARKETPLACE_ALLOWED_UPLOAD_TYPES,
  MAX_MARKETPLACE_FILES,
  MAX_MARKETPLACE_FILE_SIZE_BYTES
} from "../services/marketplaceService.js";

const router = Router();

const storage = multer.diskStorage({
  destination(req, file, cb) {
    ensureMarketplaceUploadDir()
      .then((directory) => cb(null, directory))
      .catch((err) => cb(err));
  },
  filename(req, file, cb) {
    const extension = path.extname(file.originalname || "").toLowerCase() || MARKETPLACE_ALLOWED_UPLOAD_TYPES[file.mimetype] || "";
    const safeBase = String(path.basename(file.originalname || "document", extension))
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "document";
    cb(null, `${Date.now()}-${safeBase}-${crypto.randomBytes(6).toString("hex")}${extension}`);
  }
});

function uploadFileFilter(req, file, cb) {
  const allowed = Object.prototype.hasOwnProperty.call(MARKETPLACE_ALLOWED_UPLOAD_TYPES, file.mimetype);
  if (!allowed) {
    cb(new Error("Unsupported document type. Upload PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, or JPEG files only."));
    return;
  }
  cb(null, true);
}

const upload = multer({
  storage,
  limits: {
    files: MAX_MARKETPLACE_FILES,
    fileSize: MAX_MARKETPLACE_FILE_SIZE_BYTES
  },
  fileFilter: uploadFileFilter
});

function quoteUploadMiddleware(req, res, next) {
  upload.array("documents", MAX_MARKETPLACE_FILES)(req, res, (err) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ error: "Each document must be 50 MB or smaller." });
        return;
      }
      if (err.code === "LIMIT_FILE_COUNT") {
        res.status(400).json({ error: `You can upload up to ${MAX_MARKETPLACE_FILES} documents per request.` });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(400).json({ error: err.message || "Document upload failed." });
  });
}

router.post("/quote-requests", quoteUploadMiddleware, submitMarketplaceQuoteRequest);

router.use(authRequired);

router.get("/leads", getMarketplaceLeads);
router.get("/leads/:id", getMarketplaceLead);
router.post("/leads/:id/purchase", purchaseMarketplaceLeadAction);
router.get("/leads/:id/documents/:documentId/download", downloadMarketplaceLeadDocument);
router.get("/notifications", getMarketplaceNotifications);
router.post("/notifications/:notificationId/read", markMarketplaceNotificationReadAction);

router.get("/admin/leads", ownerRequired, getAdminMarketplaceLeadList);
router.patch("/admin/leads/:id", ownerRequired, updateAdminMarketplaceLead);
router.patch("/admin/leads/:id/documents/:documentId", ownerRequired, updateAdminMarketplaceDocument);
router.delete("/admin/leads/:id/documents/:documentId", ownerRequired, deleteAdminMarketplaceDocument);
router.get("/admin/leads/:id/documents/:documentId/download", ownerRequired, downloadMarketplaceLeadDocument);

export default router;
