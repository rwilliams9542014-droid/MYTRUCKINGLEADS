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
import carrierRoutes from "./routes/carrierRoutes.js";
import leadRoutes from "./routes/leadRoutes.js";
import insuranceRoutes from "./routes/insuranceRoutes.js";
import reportsRoutes from "./routes/reportsRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";
import subscriptionRoutes from "./routes/subscriptionRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import contactRoutes from "./routes/contactRoutes.js";
import publicCarrierRoutes from "./routes/publicCarrierRoutes.js";
import publicLeadRoutes from "./routes/publicLeadRoutes.js";
import { handleStripeWebhook } from "./controllers/billingController.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/authMiddleware.js";
import { query } from "./config/db.js";
import { connectMongo } from "./config/mongo.js";
import { startCarrierUpdateCron } from "./cron/carrierUpdateCron.js";
import { startRenewalUpdateCron } from "./cron/renewalUpdateCron.js";

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
        "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://js.stripe.com", "https://connect.facebook.net"],
        "style-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
        "font-src": ["'self'", "data:", "https://cdn.jsdelivr.net"],
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'", "https://api.stripe.com", "https://www.facebook.com", "https://connect.facebook.net", "http://localhost:4000", "http://127.0.0.1:4000"],
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

// Stripe requires the raw request body for webhook signature verification.
app.post("/api/billing/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);

// Cookie parsing for JWT authentication
app.use(cookieParser());

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
if (publicLeadRoutesEnabled) {
  app.use("/api/leads", publicLeadRoutes);
}
app.use("/api/leads", leadRoutes);
app.use("/api/prospects", leadRoutes);
app.use("/api/insurance", insuranceRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/contact-request", contactRoutes);

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

// Allow backend-served pages to reuse the shared root assets bundle when present.
app.use("/assets", express.static(publicAssetsDir));
app.use("/assets", express.static(sharedAssetsDir));
app.use(express.static(publicDir));

function sendPublicPage(pageName) {
  return (req, res) => {
    res.sendFile(join(publicDir, pageName));
  };
}

app.get("/", (req, res) => {
  res.sendFile(join(publicDir, "index.html"));
});

app.get("/signup", sendPublicPage("signup.html"));
app.get("/signup.html", sendPublicPage("signup.html"));
app.get("/pricing", sendPublicPage("pricing.html"));
app.get("/pricing.html", sendPublicPage("pricing.html"));
app.get("/reports.html", sendPublicPage("reports.html"));
app.get("/settings.html", sendPublicPage("settings.html"));
app.get("/dot-analytics.html", sendPublicPage("dot-analytics.html"));
app.get("/insurance-expiration.html", sendPublicPage("insurance-expiration.html"));
app.get("/app-dashboard.html", sendPublicPage("app-dashboard.html"));
app.get("/otrucking-test-panel.html", sendPublicPage("otrucking-test-panel.html"));

// User dashboard - main page after login
app.get("/dashboard", requireAuth, (req, res) => {
  res.sendFile(join(publicDir, "user-dashboard.html"));
});

app.get("/lead-desk", requireAuth, (req, res) => {
  res.sendFile(join(publicDir, "lead-desk.html"));
});

app.get("/crm", requireAuth, (req, res) => {
  res.sendFile(join(publicDir, "crm.html"));
});

app.get("/carrier-profile", (req, res) => {
  res.sendFile(join(publicDir, "carrier-profile.html"));
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 404 handler
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
      ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user',
      ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
      ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
      ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'inactive',
      ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS daily_profile_views INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS daily_contact_views INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS daily_saved_prospects INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_usage_reset_at TIMESTAMPTZ DEFAULT NOW()
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
}

connectMongo()
  .catch(err => {
    console.warn("MongoDB startup connection skipped:", err.message);
  })
  .finally(async () => {
    try {
      await ensureUserAccountSchema();
      await ensureOperationalTables();
      console.log("User account schema ready");
    } catch (err) {
      console.error("User account schema setup failed:", err.message);
      process.exit(1);
    }

    if (process.env.CARRIER_CRON_ENABLED !== "false") {
      startCarrierUpdateCron();
    }
    if (process.env.RENEWAL_CRON_ENABLED !== "false") {
      startRenewalUpdateCron();
    }

    app.listen(PORT, () => {
      console.log(`API server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  });
