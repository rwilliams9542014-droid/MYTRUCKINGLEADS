import { Router } from "express";
import { cancelBillingSubscription, createCheckout, getCheckoutStatus, handleStripeWebhook, testEmail } from "../controllers/billingController.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = Router();

// Create a checkout session (requires plan, email, userId)
router.post("/checkout", authRequired, createCheckout);

// Get checkout session status and sync subscription after Stripe redirects back.
router.get("/checkout-status", authRequired, getCheckoutStatus);

// Cancel current subscription through Stripe.
router.post("/cancel", authRequired, cancelBillingSubscription);

// Stripe webhook endpoint (no auth — Stripe signs requests with a secret)
router.post("/webhook", handleStripeWebhook);

// Test email endpoint (for verifying email configuration)
router.post("/test-email", testEmail);

export default router;
