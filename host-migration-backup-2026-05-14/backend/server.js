import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = `${__dirname}/.env`;
const result = dotenv.config({ path: envPath });
if (result.error) {
  console.warn("Could not load backend .env:", result.error.message);
}

import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import authRoutes from "./routes/authRoutes.js";
import billingRoutes from "./routes/billingRoutes.js";
import { handleStripeWebhook } from "./controllers/billingController.js";
import carrierRoutes from "./routes/carrierRoutes.js";
import fmcsaRoutes from "./routes/fmcsaRoutes.js";
import leadRoutes from "./routes/leadRoutes.js";
import insuranceRoutes from "./routes/insuranceRoutes.js";
import reportsRoutes from "./routes/reportsRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import privacyRoutes from "./routes/privacyRoutes.js";
import marketplaceRoutes from "./routes/marketplaceRoutes.js";
import outreachRoutes from "./routes/outreachRoutes.js";
import publicCarrierRoutes from "./routes/publicCarrierRoutes.js";
import publicLeadRoutes from "./routes/publicLeadRoutes.js";
import { unsubscribeEmail } from "./controllers/outreachController.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/authMiddleware.js";
import { ownerRequired } from "./middleware/ownerMiddleware.js";
import { query } from "./config/db.js";
import { connectMongo } from "./config/mongo.js";
import { startCarrierUpdateCron } from "./cron/carrierUpdateCron.js";
import { startRenewalUpdateCron } from "./cron/renewalUpdateCron.js";
import { ensureMarketplaceSchema } from "./services/marketplaceSchemaService.js";

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 4000;
const publicDir = join(__dirname, "public");
const publicAssetsDir = join(publicDir, "assets");
const sharedAssetsDir = join(__dirname, "..", "assets");
const publicCarrierRoutesEnabled =
  process.env.NODE_ENV !== "production" || process.env.PUBLIC_CARRIER_LOOKUP_ENABLED === "true";
const publicLeadRoutesEnabled =
  process.env.NODE_ENV !== "production" || process.env.PUBLIC_LEAD_LOOKUP_ENABLED === "true";
const canonicalHost = String(process.env.CANONICAL_HOST || "www.mytruckingleads.com").trim().toLowerCase();
const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.FRONTEND_URLS || "").split(",").map((origin) => origin.trim()),
  "https://mytruckingleads-production.up.railway.app",
  "http://127.0.0.1:5500",
  "http://localhost:5500",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://localhost:3000"
].filter(Boolean);

function isAllowedOrigin(origin) {
  if (process.env.CORS_ALLOW_ALL === "true") return true;
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;

  if (process.env.NODE_ENV !== "production") {
    if (origin === "null") return true;

    try {
      const url = new URL(origin);
      return ["localhost", "127.0.0.1"].includes(url.hostname);
    } catch (err) {
      return false;
    }
  }

  return false;
}

function normalizeHostHeader(value) {
  return String(value || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
}

function normalizeForwardedProto(value) {
  return String(value || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
}

function shouldSkipCanonicalRedirect(req) {
  if (process.env.NODE_ENV !== "production") return true;
  if (!["GET", "HEAD"].includes(req.method)) return true;
  if (req.path === "/api/health") return true;

  const host = normalizeHostHeader(req.headers["x-forwarded-host"] || req.headers.host);
  const isLocalHost = ["localhost", "127.0.0.1"].includes(host);
  if (!host || isLocalHost) return true;

  const proto = normalizeForwardedProto(req.headers["x-forwarded-proto"] || req.protocol);
  return host === canonicalHost && proto === "https";
}

// Security middleware. Static pages currently use inline styles/scripts.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://js.stripe.com", "https://connect.facebook.net", "https://www.googletagmanager.com"],
        "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        "font-src": ["'self'", "data:", "https://cdn.jsdelivr.net"],
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'", "https://api.stripe.com", "https://www.facebook.com", "https://connect.facebook.net", "https://www.googletagmanager.com", "https://www.googleadservices.com", "https://googleads.g.doubleclick.net", "https://www.google.com", "https://www.google-analytics.com", "https://region1.google-analytics.com", "http://localhost:4000", "http://127.0.0.1:4000"],
        "frame-src": ["'self'", "https://js.stripe.com", "https://checkout.stripe.com"]
      }
    }
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
  message: "Too many requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false
});
app.use("/api/", limiter);

// Cookie parsing for JWT authentication
app.use(cookieParser());

// Stripe webhook must be registered BEFORE the global body parsers so that
// express.raw() can capture the raw Buffer. Once express.json() runs, the
// body stream is consumed and Stripe's signature verification will fail.
app.post(
  "/api/billing/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

// Body parsing with size limits
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.use((req, res, next) => {
  if (shouldSkipCanonicalRedirect(req)) {
    next();
    return;
  }

  const redirectUrl = new URL(req.originalUrl || req.url || "/", `https://${canonicalHost}`);
  res.redirect(308, redirectUrl.toString());
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/carrier", carrierRoutes);
app.use("/api/carriers", carrierRoutes);
app.use("/api/fmcsa", fmcsaRoutes);
if (publicLeadRoutesEnabled) {
  app.use("/api/leads", publicLeadRoutes);
}
app.use("/api/leads", leadRoutes);
app.use("/api/prospects", leadRoutes);
app.use("/api/insurance", insuranceRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/contact-request", contactRoutes);
app.use("/api/privacy-request", privacyRoutes);
app.use("/api/marketplace", marketplaceRoutes);
app.use("/api/outreach", outreachRoutes);

if (publicCarrierRoutesEnabled) {
  app.use("/api/public/carriers", publicCarrierRoutes);
}
if (publicLeadRoutesEnabled) {
  app.use("/api/public/leads", publicLeadRoutes);
}

// Optional non-/api aliases matching the lead database route names.
app.use("/carriers", carrierRoutes);
if (publicLeadRoutesEnabled) {
  app.use("/leads", publicLeadRoutes);
}
app.use("/leads", leadRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

function sendReactApp(req, res) {
  res.sendFile(join(publicDir, "index.html"));
}

const reactCompatibilityRoutes = [
  "/login.html",
  "/signup.html",
  "/user-dashboard.html",
  "/lead-desk.html",
  "/dot-analytics.html",
  "/crm.html",
  "/admin.html",
  "/settings.html",
  "/quote-request.html",
  "/lead-marketplace.html",
  "/carrier-profile.html"
];

app.get(reactCompatibilityRoutes, sendReactApp);
app.get("/unsubscribe/:token", unsubscribeEmail);

// Allow backend-served pages to reuse the shared root assets bundle when present.
app.use("/assets", express.static(publicAssetsDir));
app.use("/assets", express.static(sharedAssetsDir));
app.use(express.static(publicDir));

app.use("/api", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

app.get("*", sendReactApp);

// 404 handler for non-GET requests that were not handled above.
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Global error handler (must be last)
app.use(errorHandler);

async function ensureUserAccountSchema() {
  await query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS first_name TEXT,
      ADD COLUMN IF NOT EXISTS last_name TEXT,
      ADD COLUMN IF NOT EXISTS username TEXT,
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS business_name TEXT,
      ADD COLUMN IF NOT EXISTS billing_address_line1 TEXT,
      ADD COLUMN IF NOT EXISTS billing_address_line2 TEXT,
      ADD COLUMN IF NOT EXISTS billing_city TEXT,
      ADD COLUMN IF NOT EXISTS billing_state TEXT,
      ADD COLUMN IF NOT EXISTS billing_postal_code TEXT,
      ADD COLUMN IF NOT EXISTS billing_country TEXT DEFAULT 'US',
      ADD COLUMN IF NOT EXISTS lead_state TEXT,
      ADD COLUMN IF NOT EXISTS lead_states TEXT[] DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user',
      ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
      ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
      ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive',
      ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS team_owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS team_member_role TEXT,
      ADD COLUMN IF NOT EXISTS daily_profile_views INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS daily_contact_views INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS daily_saved_prospects INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS monthly_export_rows INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS monthly_export_reset_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS daily_export_rows INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS daily_export_reset_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS last_usage_reset_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS frozen_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS frozen_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS frozen_reason TEXT
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
      ON users (lower(username))
      WHERE username IS NOT NULL
  `);
}

async function ensureOperationalTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      livemode BOOLEAN DEFAULT false,
      status TEXT NOT NULL,
      message TEXT,
      processed_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processed_at
      ON stripe_webhook_events (processed_at DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status
      ON stripe_webhook_events (status)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS team_members (
      id SERIAL PRIMARY KEY,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      email TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      status TEXT NOT NULL DEFAULT 'invited',
      invite_token TEXT,
      invite_expires_at TIMESTAMPTZ,
      accepted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(owner_user_id, email)
    )
  `);

  await query(`
    ALTER TABLE team_members
      ADD COLUMN IF NOT EXISTS linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS invite_token TEXT,
      ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_invite_token
      ON team_members (invite_token)
      WHERE invite_token IS NOT NULL
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS contact_requests (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      agency TEXT,
      message TEXT NOT NULL,
      source_page TEXT,
      email_delivery_status TEXT NOT NULL DEFAULT 'failed',
      email_delivery_message TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      reviewed_at TIMESTAMPTZ,
      reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    ALTER TABLE contact_requests
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS agency TEXT,
      ADD COLUMN IF NOT EXISTS source_page TEXT,
      ADD COLUMN IF NOT EXISTS email_delivery_status TEXT NOT NULL DEFAULT 'failed',
      ADD COLUMN IF NOT EXISTS email_delivery_message TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new',
      ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS reviewed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_contact_requests_submitted_at
      ON contact_requests (submitted_at DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_contact_requests_status
      ON contact_requests (status)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS message_suppression_list (
      id SERIAL PRIMARY KEY,
      channel TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      reason TEXT,
      source TEXT,
      opted_out_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_message_suppression_unique
      ON message_suppression_list (channel, COALESCE(lower(email), ''), COALESCE(phone, ''))
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS outreach_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      lead_id INTEGER,
      carrier_dot TEXT,
      carrier_name TEXT,
      recipient_email TEXT,
      recipient_phone TEXT,
      dot_number TEXT,
      subject TEXT,
      body_preview TEXT,
      message_preview TEXT,
      provider TEXT,
      reply_to TEXT,
      status TEXT NOT NULL,
      provider_message_id TEXT,
      error_message TEXT,
      sent_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`ALTER TABLE outreach_logs ADD COLUMN IF NOT EXISTS dot_number TEXT`);
  await query(`ALTER TABLE outreach_logs ADD COLUMN IF NOT EXISTS body_preview TEXT`);
  await query(`ALTER TABLE outreach_logs ADD COLUMN IF NOT EXISTS provider TEXT`);
  await query(`ALTER TABLE outreach_logs ADD COLUMN IF NOT EXISTS reply_to TEXT`);
  await query(`ALTER TABLE outreach_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_outreach_logs_user_sent
      ON outreach_logs (user_id, sent_at DESC)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS outreach_usage (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      month TEXT NOT NULL,
      emails_sent INTEGER NOT NULL DEFAULT 0,
      sms_sent INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, month)
    )
  `);
  await query(`ALTER TABLE outreach_usage ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);

  await query(`
    CREATE TABLE IF NOT EXISTS owner_action_logs (
      id SERIAL PRIMARY KEY,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      reason TEXT,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_owner_action_logs_target_created
      ON owner_action_logs (target_user_id, created_at DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_owner_action_logs_owner_created
      ON owner_action_logs (owner_user_id, created_at DESC)
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS subscription_consents (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      email TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      plan_price NUMERIC(10, 2) NOT NULL,
      billing_interval TEXT NOT NULL,
      trial_days INTEGER NOT NULL,
      trial_start_at TIMESTAMPTZ,
      trial_end_at TIMESTAMPTZ,
      first_billing_at TIMESTAMPTZ,
      terms_version TEXT NOT NULL,
      privacy_version TEXT NOT NULL,
      subscription_agreement_version TEXT NOT NULL,
      accepted_terms BOOLEAN NOT NULL DEFAULT false,
      accepted_privacy BOOLEAN NOT NULL DEFAULT false,
      accepted_subscription_agreement BOOLEAN NOT NULL DEFAULT false,
      accepted_at TIMESTAMPTZ NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      stripe_customer_id TEXT,
      stripe_subscription_id TEXT,
      checkout_session_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_subscription_consents_user ON subscription_consents (user_id, accepted_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_subscription_consents_checkout ON subscription_consents (checkout_session_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_subscription_consents_stripe_subscription ON subscription_consents (stripe_subscription_id)`);
}

async function runStartupTasks() {
  await connectMongo().catch(err => {
    console.warn("MongoDB startup connection skipped:", err.message);
  });

  try {
    await ensureUserAccountSchema();
    await ensureOperationalTables();
    await ensureMarketplaceSchema();
    console.log("User account schema ready");
  } catch (err) {
    console.error("User account schema setup failed; continuing in degraded mode:", err.message);
  }

  if (process.env.CARRIER_CRON_ENABLED !== "false") {
    try {
      startCarrierUpdateCron();
    } catch (err) {
      console.warn("Carrier update cron skipped:", err.message);
    }
  }
  if (process.env.RENEWAL_CRON_ENABLED !== "false") {
    try {
      startRenewalUpdateCron();
    } catch (err) {
      console.warn("Renewal update cron skipped:", err.message);
    }
  }
}

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  runStartupTasks().catch((err) => {
    console.error("Startup tasks failed; server remains online:", err.message);
  });
});
