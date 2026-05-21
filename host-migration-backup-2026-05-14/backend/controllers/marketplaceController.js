import fs from "node:fs/promises";
import {
  createMarketplaceQuoteRequest,
  deleteMarketplaceDocumentAdmin,
  getAdminMarketplaceLeads,
  getMarketplaceDocumentForDownload,
  getMarketplaceLeadForUser,
  listMarketplaceLeadsForUser,
  purchaseMarketplaceLead,
  updateMarketplaceDocumentAdmin,
  updateMarketplaceLeadAdmin
} from "../services/marketplaceService.js";
import {
  getMarketplaceNotificationsForUser,
  markMarketplaceNotificationRead
} from "../services/marketplaceNotificationService.js";

async function ensureFileExists(filePath) {
  await fs.access(filePath);
}

export async function submitMarketplaceQuoteRequest(req, res, next) {
  try {
    const lead = await createMarketplaceQuoteRequest({
      body: req.body,
      files: req.files || [],
      req
    });

    res.status(201).json({
      success: true,
      lead,
      message: "Your trucking insurance quote request has been submitted."
    });
  } catch (err) {
    next(err);
  }
}

export async function getMarketplaceLeads(req, res, next) {
  try {
    const result = await listMarketplaceLeadsForUser(req.user, req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getMarketplaceLead(req, res, next) {
  try {
    const lead = await getMarketplaceLeadForUser(req.user, Number(req.params.id));
    res.json({ lead });
  } catch (err) {
    next(err);
  }
}

export async function purchaseMarketplaceLeadAction(req, res, next) {
  try {
    const purchase = await purchaseMarketplaceLead(req.user, Number(req.params.id));
    res.json(purchase);
  } catch (err) {
    next(err);
  }
}

export async function downloadMarketplaceLeadDocument(req, res, next) {
  try {
    const document = await getMarketplaceDocumentForDownload({
      quoteRequestId: Number(req.params.id),
      documentId: Number(req.params.documentId),
      user: req.user,
      adminMode: Boolean(req.owner)
    });

    await ensureFileExists(document.storage_location);
    res.download(document.storage_location, document.original_filename);
  } catch (err) {
    next(err);
  }
}

export async function getMarketplaceNotifications(req, res, next) {
  try {
    const notifications = await getMarketplaceNotificationsForUser(req.user.id, Number(req.query.limit || 25));
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
}

export async function markMarketplaceNotificationReadAction(req, res, next) {
  try {
    const notification = await markMarketplaceNotificationRead(req.user.id, Number(req.params.notificationId));
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ success: true, notification });
  } catch (err) {
    next(err);
  }
}

export async function getAdminMarketplaceLeadList(req, res, next) {
  try {
    const leads = await getAdminMarketplaceLeads({
      limit: Number(req.query.limit || 200)
    });

    res.json({ leads });
  } catch (err) {
    next(err);
  }
}

export async function updateAdminMarketplaceLead(req, res, next) {
  try {
    const lead = await updateMarketplaceLeadAdmin(Number(req.params.id), req.body || {});
    res.json({ success: true, lead });
  } catch (err) {
    next(err);
  }
}

export async function updateAdminMarketplaceDocument(req, res, next) {
  try {
    const document = await updateMarketplaceDocumentAdmin({
      quoteRequestId: Number(req.params.id),
      documentId: Number(req.params.documentId),
      status: req.body?.status,
      reviewerId: req.user.id,
      reviewNotes: req.body?.reviewNotes || ""
    });

    res.json({ success: true, document });
  } catch (err) {
    next(err);
  }
}

export async function deleteAdminMarketplaceDocument(req, res, next) {
  try {
    const document = await deleteMarketplaceDocumentAdmin({
      quoteRequestId: Number(req.params.id),
      documentId: Number(req.params.documentId)
    });

    res.json({ success: true, document });
  } catch (err) {
    next(err);
  }
}
