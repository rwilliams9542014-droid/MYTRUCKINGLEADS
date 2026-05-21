import Stripe from "stripe";
import { AppError } from "../middleware/errorHandler.js";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

function moneyToCents(amount) {
  return Math.round(Number(amount || 0) * 100);
}

function shouldStubMarketplaceBilling() {
  if (process.env.MARKETPLACE_SKIP_STRIPE_CHARGE === "true") return true;
  if (process.env.NODE_ENV !== "production" && process.env.MARKETPLACE_SKIP_STRIPE_CHARGE !== "false") {
    return true;
  }
  return false;
}

async function resolveCustomerId(user) {
  if (user?.stripe_customer_id) {
    return user.stripe_customer_id;
  }

  if (user?.stripe_subscription_id && stripe) {
    const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
    if (typeof subscription.customer === "string") {
      return subscription.customer;
    }
    return subscription.customer?.id || null;
  }

  return null;
}

async function resolveDefaultPaymentMethod(user) {
  if (!stripe) return null;

  const customerId = await resolveCustomerId(user);
  if (!customerId) return { customerId: null, paymentMethodId: null };

  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || customer.deleted) {
    return { customerId: null, paymentMethodId: null };
  }

  const customerDefault = typeof customer.invoice_settings?.default_payment_method === "string"
    ? customer.invoice_settings.default_payment_method
    : customer.invoice_settings?.default_payment_method?.id;
  if (customerDefault) {
    return { customerId, paymentMethodId: customerDefault };
  }

  if (user?.stripe_subscription_id) {
    const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
    const subscriptionDefault = typeof subscription.default_payment_method === "string"
      ? subscription.default_payment_method
      : subscription.default_payment_method?.id;
    if (subscriptionDefault) {
      return { customerId, paymentMethodId: subscriptionDefault };
    }
  }

  return { customerId, paymentMethodId: null };
}

export async function chargeMarketplaceLead({ user, quoteRequest, amount, metadata = {} }) {
  const numericAmount = Number(amount || 0);
  if (!(numericAmount > 0)) {
    return {
      success: true,
      paymentIntentId: null,
      provider: "none",
      amount: 0
    };
  }

  if (shouldStubMarketplaceBilling()) {
    return {
      success: true,
      paymentIntentId: `stub_lead_${Date.now()}`,
      provider: "stub",
      amount: numericAmount
    };
  }

  if (!stripe) {
    throw new AppError("Marketplace billing is not configured.", 503);
  }

  const { customerId, paymentMethodId } = await resolveDefaultPaymentMethod(user);
  if (!customerId || !paymentMethodId) {
    throw new AppError("No saved payment method is available for this account. Update billing before purchasing leads.", 402);
  }

  try {
    const intent = await stripe.paymentIntents.create({
      amount: moneyToCents(numericAmount),
      currency: "usd",
      customer: customerId,
      payment_method: paymentMethodId,
      confirm: true,
      off_session: true,
      description: `Marketplace lead purchase #${quoteRequest.id} - ${quoteRequest.company_name}`,
      metadata: {
        quoteRequestId: String(quoteRequest.id),
        dotNumber: String(quoteRequest.dot_number || ""),
        mcNumber: String(quoteRequest.mc_number || ""),
        purchasedBy: String(user.id),
        ...Object.fromEntries(
          Object.entries(metadata).map(([key, value]) => [key, value == null ? "" : String(value)])
        )
      }
    });

    return {
      success: true,
      paymentIntentId: intent.id,
      provider: "stripe",
      amount: numericAmount
    };
  } catch (err) {
    const message =
      err?.raw?.message ||
      err?.message ||
      "Stripe could not charge the saved payment method for this lead purchase.";
    throw new AppError(message, 402);
  }
}
