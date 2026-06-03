import { cancelSubscriptionForUser, createBillingPortalSessionForUser, createCheckoutSession, getSessionDetails, handleWebhook, syncCheckoutSession } from "../services/stripeService.js";
import { sendTestEmail } from "../services/emailService.js";
import {
  attachCheckoutSessionToConsent,
  recordSubscriptionConsent,
  requireSubscriptionConsent
} from "../services/subscriptionConsentService.js";

export async function createCheckout(req, res) {
  try {
    const { plan, email, customerEmail, billingCycle, acceptedTerms, acceptedPrivacy, acceptedSubscriptionAgreement } = req.body;
    const checkoutEmail = email || customerEmail;
    const userId = req.user?.id;

    if (!plan || !checkoutEmail || !userId) {
      return res.status(400).json({ error: "plan, email, and userId are required" });
    }

    requireSubscriptionConsent({ acceptedTerms, acceptedPrivacy, acceptedSubscriptionAgreement });
    const consentRecord = await recordSubscriptionConsent({
      userId,
      email: checkoutEmail,
      plan,
      billingCycle,
      consent: { acceptedTerms, acceptedPrivacy, acceptedSubscriptionAgreement },
      req
    });
    const session = await createCheckoutSession({ plan, customerEmail: checkoutEmail, userId, billingCycle, consentRecord });
    await attachCheckoutSessionToConsent(consentRecord.id, session.id);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to create checkout session" });
  }
}

export async function getCheckoutStatus(req, res) {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required" });
    }

    const session = req.user?.id
      ? await syncCheckoutSession(sessionId, req.user.id)
      : await getSessionDetails(sessionId);
    res.json({
      status: session.payment_status,
      plan: session.metadata?.plan,
      customer: session.customer_email,
      amountTotal: session.amount_total
    });
  } catch (err) {
    console.error("Session retrieval error:", err);
    res.status(500).json({ error: "Failed to retrieve session" });
  }
}

export async function createBillingPortalSession(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const returnUrl = `${process.env.FRONTEND_URL || `${req.protocol}://${req.get("host")}`}/settings`;
    const session = await createBillingPortalSessionForUser(userId, returnUrl);
    res.json({ url: session.url });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || "Billing portal is not configured yet. Please contact support to cancel." });
  }
}

export async function cancelBillingSubscription(req, res) {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const result = await cancelSubscriptionForUser(userId);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error("Subscription cancellation error:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Failed to cancel subscription" });
  }
}

export async function handleStripeWebhook(req, res) {
  try {
    const result = await handleWebhook(req);
    res.json({ received: true, ...result });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(err.statusCode || 400).json({ error: err.message });
  }
}

export async function testEmail(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    const result = await sendTestEmail(email);
    res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    console.error("Test email error:", err);
    res.status(500).json({ success: false, message: "Failed to send test email" });
  }
}
