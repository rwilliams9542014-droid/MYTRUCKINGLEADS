import crypto from "crypto";
import bcrypt from "bcryptjs";
import Stripe from "stripe";
import { query } from "../config/db.js";
import { sendSubscriptionConfirmation, sendPaymentFailedNotification } from "./emailService.js";
import { PLAN_DETAILS, normalizePlan } from "../utils/planAccess.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_IDS = {
  monthly: {
    basic: process.env.STRIPE_PRICE_BASIC_MONTHLY || process.env.STRIPE_PRICE_BASIC || process.env.STRIPE_PRICE_NEW_DOT || process.env.STRIPE_PRICE_STARTER || "price_basic_7900",
    pro: process.env.STRIPE_PRICE_PRO_MONTHLY || process.env.STRIPE_PRICE_PRO || process.env.STRIPE_PRICE_STATE_PROSPECTING || "price_pro_19900",
    premium: process.env.STRIPE_PRICE_PREMIUM_MONTHLY || process.env.STRIPE_PRICE_PREMIUM || process.env.STRIPE_PRICE_AGENCY || "price_premium_49900"
  },
  annual: {
    basic: process.env.STRIPE_PRICE_BASIC_ANNUAL || "price_basic_79000",
    pro: process.env.STRIPE_PRICE_PRO_ANNUAL || "price_pro_199000",
    premium: process.env.STRIPE_PRICE_PREMIUM_ANNUAL || process.env.STRIPE_PRICE_AGENCY_ANNUAL || "price_premium_499000"
  }
};

async function getWebhookEventStatus(eventId) {
  const result = await query(
    `SELECT status, processed_at < NOW() - INTERVAL '10 minutes' AS stale
     FROM stripe_webhook_events
     WHERE id = $1`,
    [eventId]
  );

  return result.rows[0] || null;
}

async function recordWebhookEvent(event, status, message = null) {
  await query(
    `INSERT INTO stripe_webhook_events (id, type, livemode, status, message, processed_at, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), TO_TIMESTAMP($6))
     ON CONFLICT (id)
     DO UPDATE SET
       status = EXCLUDED.status,
       message = EXCLUDED.message,
       processed_at = NOW()`,
    [
      event.id,
      event.type,
      Boolean(event.livemode),
      status,
      message ? String(message).slice(0, 500) : null,
      event.created || Math.floor(Date.now() / 1000)
    ]
  );
}

function normalizeBillingCycle(value) {
  return String(value || "monthly").toLowerCase() === "annual" ? "annual" : "monthly";
}

function getSubscriptionPeriodEnd(subscription) {
  const periodEnd =
    subscription.current_period_end ||
    subscription.items?.data?.[0]?.current_period_end ||
    subscription.trial_end ||
    subscription.cancel_at;

  return periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
}

function normalizeStripeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email && email.includes("@") ? email : null;
}

function fallbackNameFromEmail(email) {
  const localPart = String(email || "").split("@")[0] || "Customer";
  return localPart
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || "Customer";
}

function shouldBackfillLocalUser(subscriptionStatus) {
  return ["trialing", "active", "past_due", "incomplete"].includes(
    String(subscriptionStatus || "").toLowerCase()
  );
}

async function resolveStripeCustomer(customerReference) {
  if (!customerReference) return null;
  if (typeof customerReference !== "string") return customerReference;

  try {
    const customer = await stripe.customers.retrieve(customerReference);
    return customer?.deleted ? null : customer;
  } catch (err) {
    console.warn(`Stripe customer lookup skipped for ${customerReference}:`, err.message);
    return null;
  }
}

async function syncUsersIdSequence() {
  await query(
    `SELECT setval(
      pg_get_serial_sequence('users', 'id'),
      COALESCE((SELECT MAX(id) FROM users), 1),
      true
    )`
  );
}

async function ensureLocalUserForSubscription(subscription, fallbackUserId = null) {
  const metadataUserId = Number.parseInt(subscription.metadata?.userId || fallbackUserId, 10);
  const preferredUserId = Number.isFinite(metadataUserId) ? metadataUserId : null;
  const customer = await resolveStripeCustomer(subscription.customer);
  const stripeCustomerId =
    customer?.id || (typeof subscription.customer === "string" ? subscription.customer : null);
  const email =
    normalizeStripeEmail(customer?.email) ||
    normalizeStripeEmail(subscription.metadata?.customerEmail);
  const name = String(customer?.name || "").trim() || fallbackNameFromEmail(email);
  const phone = String(customer?.phone || "").trim() || null;
  const plan = getPlanFromPriceId(subscription.items?.data?.[0]?.price?.id);
  const subscriptionStatus = subscription.status || null;
  const expiresAt = getSubscriptionPeriodEnd(subscription);

  if (preferredUserId) {
    const byId = await query(
      `SELECT id, name, email, phone, stripe_customer_id, stripe_subscription_id
       FROM users
       WHERE id = $1`,
      [preferredUserId]
    );
    if (byId.rows.length > 0) {
      const updated = await query(
        `UPDATE users
         SET name = COALESCE(NULLIF(name, ''), $1),
             phone = COALESCE(phone, $2),
             stripe_customer_id = COALESCE($3, stripe_customer_id),
             stripe_subscription_id = COALESCE($4, stripe_subscription_id),
             plan = $5,
             subscription_status = $6,
             subscription_expires_at = $7,
             updated_at = NOW()
         WHERE id = $8
         RETURNING id, email, plan, subscription_status`,
        [name, phone, stripeCustomerId, subscription.id, plan, subscriptionStatus, expiresAt, preferredUserId]
      );
      return updated.rows[0] || byId.rows[0];
    }
  }

  if (stripeCustomerId) {
    const byStripeCustomer = await query(
      `SELECT id, name, email, phone, stripe_customer_id, stripe_subscription_id
       FROM users
       WHERE stripe_customer_id = $1
       LIMIT 1`,
      [stripeCustomerId]
    );
    if (byStripeCustomer.rows.length > 0) {
      const existingUser = byStripeCustomer.rows[0];
      const updated = await query(
        `UPDATE users
         SET name = COALESCE(NULLIF(name, ''), $1),
             phone = COALESCE(phone, $2),
             stripe_subscription_id = COALESCE($3, stripe_subscription_id),
             plan = $4,
             subscription_status = $5,
             subscription_expires_at = $6,
             updated_at = NOW()
         WHERE id = $7
         RETURNING id, email, plan, subscription_status`,
        [name, phone, subscription.id, plan, subscriptionStatus, expiresAt, existingUser.id]
      );
      return updated.rows[0] || existingUser;
    }
  }

  if (!email) {
    console.warn(`Unable to backfill local user for subscription ${subscription.id}: missing email`);
    return null;
  }

  const byEmail = await query(
    `SELECT id, name, email, phone, stripe_customer_id, stripe_subscription_id
     FROM users
     WHERE lower(email) = $1
     LIMIT 1`,
    [email]
  );
  if (byEmail.rows.length > 0) {
    const existingUser = byEmail.rows[0];
    const updated = await query(
      `UPDATE users
       SET name = COALESCE(NULLIF(name, ''), $1),
           phone = COALESCE(phone, $2),
           stripe_customer_id = COALESCE($3, stripe_customer_id),
           stripe_subscription_id = COALESCE($4, stripe_subscription_id),
           plan = $5,
           subscription_status = $6,
           subscription_expires_at = $7,
           updated_at = NOW()
       WHERE id = $8
       RETURNING id, email, plan, subscription_status`,
      [name, phone, stripeCustomerId, subscription.id, plan, subscriptionStatus, expiresAt, existingUser.id]
    );
    return updated.rows[0] || existingUser;
  }

  const passwordHash = await bcrypt.hash(
    `stripe-recovered-${crypto.randomBytes(24).toString("hex")}`,
    12
  );
  const createdAt = subscription.created
    ? new Date(subscription.created * 1000).toISOString()
    : null;

  let inserted;
  if (preferredUserId) {
    inserted = await query(
      `INSERT INTO users (
         id, name, email, phone, password_hash, plan,
         stripe_customer_id, stripe_subscription_id, subscription_status,
         subscription_expires_at, role, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'user', COALESCE($11::timestamptz, NOW()), NOW())
       RETURNING id, email, plan, subscription_status`,
      [
        preferredUserId,
        name,
        email,
        phone,
        passwordHash,
        plan,
        stripeCustomerId,
        subscription.id,
        subscriptionStatus,
        expiresAt,
        createdAt
      ]
    );
    await syncUsersIdSequence();
  } else {
    inserted = await query(
      `INSERT INTO users (
         name, email, phone, password_hash, plan,
         stripe_customer_id, stripe_subscription_id, subscription_status,
         subscription_expires_at, role, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'user', COALESCE($10::timestamptz, NOW()), NOW())
       RETURNING id, email, plan, subscription_status`,
      [
        name,
        email,
        phone,
        passwordHash,
        plan,
        stripeCustomerId,
        subscription.id,
        subscriptionStatus,
        expiresAt,
        createdAt
      ]
    );
  }

  return inserted.rows[0] || null;
}

export async function createCheckoutSession({ plan, customerEmail, userId, billingCycle }) {
  plan = normalizePlan(plan);
  const cycle = normalizeBillingCycle(billingCycle);
  const priceId = PRICE_IDS[cycle]?.[plan];

  if (!plan || !priceId) {
    const error = new Error("Invalid plan");
    error.statusCode = 400;
    throw error;
  }

  if (!customerEmail || !customerEmail.includes("@")) {
    const error = new Error("Invalid email");
    error.statusCode = 400;
    throw error;
  }

  if (!userId) {
    const error = new Error("User ID required");
    error.statusCode = 400;
    throw error;
  }

  const metadata = {
    userId: userId.toString(),
    plan,
    billingCycle: cycle,
    customerEmail: String(customerEmail).trim().toLowerCase()
  };

  try {
    return await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      customer_email: customerEmail,
      payment_method_collection: "always",
      client_reference_id: userId.toString(),
      success_url: `${process.env.FRONTEND_URL}/user-dashboard.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing.html?plan=${plan}&billing=${cycle}&checkout=cancelled`,
      metadata,
      subscription_data: {
        trial_period_days: PLAN_DETAILS[plan]?.trialDays || 3,
        trial_settings: {
          end_behavior: {
            missing_payment_method: "cancel"
          }
        },
        metadata
      }
    });
  } catch (err) {
    console.error("Stripe checkout error:", err.message);
    const error = new Error("Failed to create checkout session");
    error.statusCode = 500;
    throw error;
  }
}

export async function getSessionDetails(sessionId) {
  try {
    return await stripe.checkout.sessions.retrieve(sessionId);
  } catch (err) {
    console.error("Stripe session retrieval error:", err.message);
    const error = new Error("Failed to retrieve session");
    error.statusCode = 500;
    throw error;
  }
}

export async function syncCheckoutSession(sessionId, userId = null) {
  if (!sessionId) {
    const error = new Error("sessionId is required");
    error.statusCode = 400;
    throw error;
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const sessionUserId = session.client_reference_id || session.metadata?.userId;

    if (userId && sessionUserId && String(sessionUserId) !== String(userId)) {
      const error = new Error("Checkout session does not belong to this user");
      error.statusCode = 403;
      throw error;
    }

    if (session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(session.subscription);
      await handleSubscriptionEvent(subscription, sessionUserId || userId);
    }

    return session;
  } catch (err) {
    if (err.statusCode) throw err;
    console.error("Stripe checkout sync error:", err.message);
    const error = new Error("Failed to sync checkout session");
    error.statusCode = 500;
    throw error;
  }
}

export async function syncUserSubscriptionFromStripe(userId) {
  if (!userId) return null;

  const userResult = await query(
    `SELECT id, email, plan, lead_state, subscription_status, stripe_subscription_id
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) return null;

  const user = userResult.rows[0];
  const currentStatus = String(user.subscription_status || "").toLowerCase();
  if (["active", "trialing"].includes(currentStatus) && user.stripe_subscription_id) {
    return user;
  }

  try {
    if (user.stripe_subscription_id) {
      const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
      await handleSubscriptionEvent(subscription, userId);
      return getSyncedUser(userId);
    }

    if (!user.email) return user;

    const customers = await stripe.customers.list({
      email: user.email,
      limit: 10
    });

    for (const customer of customers.data) {
      const subscriptions = await stripe.subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 10
      });

      const subscription = subscriptions.data.find((item) =>
        ["trialing", "active", "past_due", "incomplete"].includes(item.status)
      );

      if (subscription) {
        await handleSubscriptionEvent(subscription, userId);
        return getSyncedUser(userId);
      }
    }

    return user;
  } catch (err) {
    console.warn(`Stripe subscription sync skipped for user ${userId}:`, err.message);
    return user;
  }
}

export async function cancelSubscriptionForUser(userId) {
  if (!userId) {
    const error = new Error("User ID required");
    error.statusCode = 400;
    throw error;
  }

  const userResult = await query(
    `SELECT id, plan, subscription_status, stripe_subscription_id
     FROM users
     WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const user = userResult.rows[0];
  const subscriptionId = user.stripe_subscription_id;

  if (!subscriptionId) {
    await updateUserPlan(userId, "basic", null, "canceled", null);
    return {
      status: "canceled",
      effectiveImmediately: true,
      message: "No active Stripe subscription was found. Account access has been canceled."
    };
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const isTrialing = subscription.status === "trialing";
    const shouldCancelImmediately = isTrialing || ["incomplete", "past_due", "unpaid"].includes(subscription.status);

    if (shouldCancelImmediately) {
      await stripe.subscriptions.cancel(subscriptionId, {
        invoice_now: false,
        prorate: false
      });
      await updateUserPlan(userId, "basic", null, "canceled", null);

      return {
        status: "canceled",
        effectiveImmediately: true,
        message: isTrialing
          ? "Your trial was canceled before billing started. You will not be charged."
          : "Your subscription was canceled immediately."
      };
    }

    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
      proration_behavior: "none"
    });
    const expiresAt = getSubscriptionPeriodEnd(updatedSubscription);

    await updateUserPlan(
      userId,
      getPlanFromPriceId(updatedSubscription.items.data[0].price.id),
      subscriptionId,
      updatedSubscription.status,
      expiresAt
    );

    return {
      status: updatedSubscription.status,
      effectiveImmediately: false,
      cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
      accessEndsAt: expiresAt,
      message: "Your subscription will end at the close of the current paid billing period. You will not be charged again."
    };
  } catch (err) {
    if (err.type === "StripeInvalidRequestError" && err.code === "resource_missing") {
      await updateUserPlan(userId, "basic", null, "canceled", null);
      return {
        status: "canceled",
        effectiveImmediately: true,
        message: "The Stripe subscription no longer exists. Account access has been canceled."
      };
    }

    console.error(`Stripe cancellation error for user ${userId}:`, err.message);
    const error = new Error("Failed to cancel subscription");
    error.statusCode = 500;
    throw error;
  }
}

export async function listStripeSignupRecords({ limit = 100, backfillLocalUsers = false } = {}) {
  try {
    const normalizedLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 250);
    const subscriptions = await stripe.subscriptions.list({
      status: "all",
      limit: normalizedLimit,
      expand: ["data.customer"]
    });

    const records = [];
    for (const subscription of subscriptions.data) {
      const customer =
        subscription.customer && typeof subscription.customer !== "string"
          ? subscription.customer
          : null;
      if (backfillLocalUsers && shouldBackfillLocalUser(subscription.status)) {
        await ensureLocalUserForSubscription(subscription);
      }
      const expiresAt = getSubscriptionPeriodEnd(subscription);
      const metadataUserId = Number.parseInt(subscription.metadata?.userId, 10);
      const normalizedStatus = String(subscription.status || "").toLowerCase();
      const hasAccess =
        ["active", "trialing"].includes(normalizedStatus) &&
        (!expiresAt || new Date(expiresAt).getTime() > Date.now());

      records.push({
        id: Number.isFinite(metadataUserId) ? metadataUserId : null,
        name: customer?.name || null,
        first_name: null,
        last_name: null,
        username: null,
        email: customer?.email || null,
        phone: customer?.phone || null,
        business_name: null,
        plan: getPlanFromPriceId(subscription.items?.data?.[0]?.price?.id),
        lead_state: null,
        role: "user",
        stripe_customer_id:
          customer?.id || (typeof subscription.customer === "string" ? subscription.customer : null),
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status || null,
        subscription_expires_at: expiresAt,
        monthly_price: subscription.items?.data?.[0]?.price?.recurring?.interval === "year"
          ? Number(((subscription.items?.data?.[0]?.price?.unit_amount || 0) / 100 / 12).toFixed(2))
          : Number(((subscription.items?.data?.[0]?.price?.unit_amount || 0) / 100).toFixed(2)),
        billing_interval: subscription.items?.data?.[0]?.price?.recurring?.interval || null,
        seats: subscription.items?.data?.[0]?.quantity || 1,
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
        created_at: subscription.created ? new Date(subscription.created * 1000).toISOString() : null,
        updated_at: subscription.created ? new Date(subscription.created * 1000).toISOString() : null,
        has_access: hasAccess,
        is_local_user: false,
        source: "stripe_only",
        sync_issue: "Stripe signup is missing from the local users table"
      });
    }

    return records;
  } catch (err) {
    console.error("Stripe admin signup listing error:", err.message);
    return [];
  }
}

async function getSyncedUser(userId) {
  const result = await query(
    `SELECT id, email, plan, lead_state, subscription_status, stripe_subscription_id, subscription_expires_at
     FROM users
     WHERE id = $1`,
    [userId]
  );

  return result.rows[0] || null;
}

export async function handleWebhook(req) {
  const signature = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    const error = new Error(`Webhook Error: ${err.message}`);
    error.statusCode = 400;
    throw error;
  }

  const existing = await getWebhookEventStatus(event.id);
  if (existing?.status === "processed") {
    return { eventId: event.id, duplicate: true };
  }
  if (existing?.status === "processing" && !existing.stale) {
    return { eventId: event.id, duplicate: true, status: "processing" };
  }

  await recordWebhookEvent(event, "processing");

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionEvent(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionCancellation(event.data.object);
        break;
      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    await recordWebhookEvent(event, "processed");
  } catch (err) {
    await recordWebhookEvent(event, "failed", err.message);
    throw err;
  }

  return { eventId: event.id };
}

async function handleCheckoutCompleted(session) {
  if (!session.subscription) return;

  const subscription = await stripe.subscriptions.retrieve(session.subscription);
  await handleSubscriptionEvent(
    subscription,
    session.client_reference_id || session.metadata?.userId || null
  );
}

async function handleSubscriptionEvent(subscription, fallbackUserId = null) {
  console.log(`Subscription ${subscription.id} created/updated for customer ${subscription.customer}`);

  const plan = getPlanFromPriceId(subscription.items.data[0].price.id);
  const localUser = await ensureLocalUserForSubscription(subscription, fallbackUserId);
  const userId = localUser?.id || Number.parseInt(subscription.metadata?.userId || fallbackUserId, 10);
  const subscriptionStatus = subscription.status;
  const expiresAt = getSubscriptionPeriodEnd(subscription);

  if (!Number.isFinite(userId)) {
    console.warn(`No userId in subscription metadata for subscription ${subscription.id}`);
    return;
  }

  await updateUserPlan(userId, plan, subscription.id, subscriptionStatus, expiresAt);
  console.log(`Updated user ${userId} to plan: ${plan}`);
}

async function handleSubscriptionCancellation(subscription) {
  console.log(`Subscription ${subscription.id} cancelled for customer ${subscription.customer}`);

  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.warn(`No userId in subscription metadata for subscription ${subscription.id}`);
    return;
  }

  await updateUserPlan(userId, "basic", null, "canceled", null);
  console.log(`Downgraded user ${userId} to basic plan`);
}

async function getInvoiceUserContext(invoice) {
  if (!invoice.subscription) {
    console.warn(`No subscription linked to invoice ${invoice.id}`);
    return null;
  }

  const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
  const userId = subscription.metadata?.userId;

  if (!userId) {
    console.warn(`No userId in subscription metadata for invoice ${invoice.id}`);
    return null;
  }

  const userResult = await query(
    "SELECT id, name, email, plan FROM users WHERE id = $1",
    [userId]
  );

  if (userResult.rows.length === 0) {
    console.warn(`User ${userId} not found for invoice ${invoice.id}`);
    return null;
  }

  return {
    subscription,
    user: userResult.rows[0],
    plan: getPlanFromPriceId(subscription.items.data[0].price.id)
  };
}

async function handlePaymentSucceeded(invoice) {
  console.log(`Payment succeeded for invoice ${invoice.id}`);

  try {
    const context = await getInvoiceUserContext(invoice);
    if (!context) return;

    const periodEnd = getSubscriptionPeriodEnd(context.subscription);
    const renewalDate = periodEnd ? new Date(periodEnd).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric"
    }) : "your next billing date";

    await sendSubscriptionConfirmation({
      email: context.user.email,
      userName: context.user.name,
      plan: context.plan,
      renewalDate
    });

    console.log(`Sent subscription confirmation to ${context.user.email}`);
  } catch (err) {
    console.error(`Error handling payment succeeded for invoice ${invoice.id}:`, err.message);
  }
}

async function handlePaymentFailed(invoice) {
  console.log(`Payment failed for invoice ${invoice.id}`);

  try {
    const context = await getInvoiceUserContext(invoice);
    if (!context) return;

    const failureReason =
      invoice.last_payment_error?.message ||
      "Your payment could not be processed";

    await sendPaymentFailedNotification({
      email: context.user.email,
      userName: context.user.name,
      plan: context.plan,
      reason: failureReason
    });

    console.log(`Sent payment failure notification to ${context.user.email}`);
  } catch (err) {
    console.error(`Error handling payment failed for invoice ${invoice.id}:`, err.message);
  }
}

async function updateUserPlan(userId, plan, subscriptionId, subscriptionStatus, expiresAt) {
  try {
    const normalizedStatus = String(subscriptionStatus || "").toLowerCase();
    const trialEndsAt = normalizedStatus === "trialing" ? expiresAt : null;
    const result = await query(
      `UPDATE users
       SET plan = $1,
           stripe_subscription_id = $2,
           subscription_status = $3,
           subscription_expires_at = $4,
           trial_ends_at = $5,
           updated_at = NOW()
       WHERE id = $6
       RETURNING id, email, plan, subscription_status`,
      [plan, subscriptionId, subscriptionStatus, expiresAt, trialEndsAt, userId]
    );

    if (result.rows.length === 0) {
      console.warn(`User ${userId} not found when updating subscription`);
      return null;
    }

    return result.rows[0];
  } catch (err) {
    console.error(`Database error updating user ${userId}:`, err.message);
    throw err;
  }
}

function getPlanFromPriceId(priceId) {
  const reverseMap = {
    [PRICE_IDS.monthly.basic]: "basic",
    [PRICE_IDS.monthly.pro]: "pro",
    [PRICE_IDS.monthly.premium]: "premium",
    [PRICE_IDS.annual.basic]: "basic",
    [PRICE_IDS.annual.pro]: "pro",
    [PRICE_IDS.annual.premium]: "premium",
    [process.env.STRIPE_PRICE_AGENCY]: "premium",
    [process.env.STRIPE_PRICE_AGENCY_ANNUAL]: "premium",
    [process.env.STRIPE_PRICE_STATE_PROSPECTING]: "pro",
    [process.env.STRIPE_PRICE_NEW_DOT]: "basic",
    [process.env.STRIPE_PRICE_STARTER]: "basic"
  };
  return reverseMap[priceId] || "basic";
}
