import { Router } from "express";
import { cancelBillingSubscription, createCheckout, getCheckoutStatus, testEmail } from "../controllers/billingController.js";
import { authRequired } from "../middleware/authMiddleware.js";

const router = Router();

// Create a checkout session (requires plan, email, userId)
router.post("/checkout", authRequired, createCheckout);

// Get checkout session status and sync subscription after Stripe redirects back.
router.get("/checkout-status", authRequired, getCheckoutStatus);

// Cancel current subscription through Stripe.
router.post("/cancel", authRequired, cancelBillingSubscription);

// NOTE: The /webhook route is intentionally absent here. It is registered
// directly on the app in server.js, BEFORE the global body parsers, so that
// express.raw() can capture the raw Buffer that Stripe requires for signature
// verification. Mounting it on this router would be too late — express.json()
// would have already consumed and parsed the body stream.

// Test email endpoint (for verifying email configuration)
router.post("/test-email", testEmail);

export default router;
