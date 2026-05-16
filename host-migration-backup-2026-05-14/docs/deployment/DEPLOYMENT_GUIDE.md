# Production Deployment Guide - MyTruckingLeads

## 🚀 Complete Deployment Steps (In Order)

---

## **PHASE 1: PREPARE APPLICATION (This Week)**

### Step 1: Get a Domain Name ✅
**Time: 5 minutes | Cost: $10-15/year**

1. Go to **Namecheap.com**, **GoDaddy.com**, or **Google Domains**
2. Search for your domain (e.g., `mytruckingleads.com`)
3. Buy the domain
4. **Keep the registrar handy** - you'll need it later for DNS settings

**Best providers:** Namecheap (cheapest), Google Domains (easiest), GoDaddy (most features)

---

### Step 2: Choose Hosting Provider ✅
**Time: 10 minutes | Recommendation: Render or Railway**

Your app has specific requirements:
- **Frontend:** Static HTML/CSS/JS files
- **Backend:** Node.js server with PostgreSQL database
- **Integrations:** Stripe, FMCSA API, Email service

**BEST OPTIONS FOR YOUR APP:**

| Provider | Frontend | Backend | Database | Cost | Recommendation |
|----------|----------|---------|----------|------|---|
| **Render** | ✅ Free tier | ✅ Starter $7-15/mo | ✅ Included PostgreSQL | $7-30/mo | ⭐ BEST FOR BEGINNERS |
| **Railway** | ✅ Free tier | ✅ $5/mo | ✅ Included PostgreSQL | $5-50/mo | ✅ Great value |
| **Vercel** | ✅ FREE | ❌ No backend | ❌ N/A | FREE | Only for frontend |
| **Heroku** | ✅ Free tier | ✅ $7/mo | ✅ Included PostgreSQL | $7+/mo | ✅ Good option |
| **AWS** | ✅ EC2 | ✅ EC2 | ✅ RDS | $5-100/mo | Complex setup |
| **Digital Ocean** | ✅ $4/mo | ✅ $4-6/mo | ✅ Managed DB $15/mo | $23+/mo | Requires more setup |

**RECOMMENDED: Use Render (easiest for your setup)**

---

## **PHASE 2: PRODUCTION PREPARATION (1-2 hours)**

### Step 3: Create Production `.env` File

In `backend/.env`, update these values for production:

```env
# Server (Render will set PORT automatically)
NODE_ENV=production
PORT=4000
FRONTEND_URL=https://yourdomain.com

# Database (Render provides DATABASE_URL automatically)
# Keep these for local reference only - Render auto-connects
DB_HOST=your_render_postgres_host
DB_PORT=5432
DB_NAME=mytruckingleads
DB_USER=postgres
DB_PASSWORD=your_strong_password

# Stripe (Use LIVE keys, not test keys!)
STRIPE_SECRET_KEY=sk_live_your_actual_secret_key
STRIPE_PUBLISHABLE_KEY=pk_live_your_actual_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_actual_webhook_secret

# Pricing
STRIPE_PRICE_STARTER=price_1A1B2C3D4E5F6G7H
STRIPE_PRICE_PRO=price_1I9J8K7L6M5N4O3P
STRIPE_PRICE_AGENCY=price_1Q1R2S3T4U5V6W7X

# FMCSA Integration
FMCSA_WEBKEY=your_fmcsa_webkey

# JWT
JWT_SECRET=use_a_very_long_random_string_here_minimum_32_characters
JWT_EXPIRY=7d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Email Service (if using transactional emails)
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_specific_password
EMAIL_FROM=noreply@yourdomain.com
```

### Step 4: Update Frontend CORS & API URLs

**File:** `assets/js/api.js`
- Change API base URL from `http://localhost:4000` to your production backend URL
- Example: `https://api.yourdomain.com` or `https://yourdomain.com/api`

**File:** `assets/js/app.js`
- Verify all API calls use the updated base URL

### Step 5: Prepare Frontend for Production

1. **Minify CSS/JS** (optional but recommended):
   ```bash
   # Use an online tool or install build tool
   npm install -g terser csso-cli
   ```

2. **Update all hardcoded URLs** - Search for:
   - `http://localhost`
   - `http://127.0.0.1`
   - Any development URLs

3. **Ensure all HTML files are in root** or properly structured

---

## **PHASE 3: DEPLOY ON RENDER (30 minutes)**

### Step 6: Deploy Backend on Render

1. **Create GitHub repo** (if you haven't):
   ```bash
   cd backend
   git init
   git add .
   git commit -m "Initial backend commit"
   ```
   Push to GitHub

2. **Create Render Account**
   - Go to https://render.com
   - Sign up with GitHub
   - Authorize Render to access your repos

3. **Create New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name:** mytruckingleads-backend
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Plan:** Starter ($7/month)
     - **Environment:** Node
     - **Region:** Choose closest to you

4. **Add Environment Variables**
   - Go to "Environment" tab
   - Add all variables from your production `.env` file
   - **IMPORTANT:** Use LIVE Stripe keys, not test keys

5. **Add PostgreSQL Database**
   - In same project, click "New +" → "PostgreSQL"
   - Configure:
     - **Name:** mytruckingleads-db
     - **Plan:** Starter ($15/month) or free trial
   - Copy the connection string provided
   - Add to backend environment as `DATABASE_URL`

6. **Deploy Database Schema**
   - Download the provided connection string
   - Connect with pgAdmin or CLI:
     ```bash
     psql (your_connection_string) < backend/schema.sql
     ```

---

### Step 7: Deploy Frontend on Vercel (or Render)

**Option A: Deploy Frontend Separately (RECOMMENDED)**

1. Create `frontend` folder with all HTML, CSS, JS files
2. Create Vercel account: https://vercel.com
3. Import project → select frontend folder
4. Deploy (automatically gets free HTTPS)
5. Custom domain: Add your domain from Vercel dashboard

**Option B: Serve Frontend from Render Backend**

1. Update `server.js` to serve static files:

```javascript
import express from "express";
import path from "path";

const app = express();
const __dirname = path.dirname(new URL(import.meta.url).pathname);

// Serve static files
app.use(express.static(path.join(__dirname, '../')));

// Routes
app.use('/api', apiRoutes);

// Fallback for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});
```

2. In Render, update **Build Command**:
   ```bash
   npm install
   ```
3. Render will serve frontend + backend from one URL

---

## **PHASE 4: CONNECT DOMAIN (15 minutes)**

### Step 8: Point Domain to Your Hosting

**If using Vercel (frontend + Render backend):**

1. In Vercel Dashboard → Project Settings → Domains
2. Add your custom domain
3. Get nameservers from Vercel
4. Go to your domain registrar (Namecheap/GoDaddy)
5. Update nameservers to Vercel's
6. Wait 24-48 hours for propagation

**If using Render only:**

1. In Render Dashboard → Project Settings → Custom Domain
2. Add your domain
3. Get the `CNAME` or `NS` records
4. Update your domain registrar
5. Wait 24-48 hours

---

## **PHASE 5: CONFIGURE INTEGRATIONS (1 hour)**

### Step 9: Update Stripe Webhook URL

1. Go to Stripe Dashboard → Developers → Webhooks
2. Click "Add Endpoint"
3. Enter webhook URL: `https://yourdomain.com/api/billing/webhook`
4. Select events:
   - `subscription.created`
   - `subscription.updated`
   - `subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy webhook secret to your backend `.env`

### Step 10: Test All Integrations

- [ ] Frontend loads on custom domain
- [ ] Login/Signup works
- [ ] Can make API calls to backend
- [ ] Payment flow works with Stripe test mode first
- [ ] FMCSA data loads correctly
- [ ] Emails send (if using email service)

---

## **PHASE 6: GO LIVE (1 hour)**

### Step 11: Switch to Live Stripe Keys

1. In Stripe Dashboard → API Keys
2. Switch from **Test Keys** to **Live Keys**
3. Copy live keys to Render environment variables
4. Restart backend service
5. Test a real payment with your card (it will process!)

### Step 12: Enable HTTPS (Usually Automatic)

- Vercel: Automatic free SSL
- Render: Automatic free SSL
- Both renew automatically

---

## **📋 QUICK REFERENCE - What You Get**

| After Deployment | Your App Will Have |
|---|---|
| ✅ **Public Domain** | `https://yourdomain.com` |
| ✅ **Live Database** | PostgreSQL hosted on Render |
| ✅ **Running Backend** | Node.js server processing requests |
| ✅ **Free HTTPS/SSL** | Secure connections (green lock) |
| ✅ **Live Stripe** | Accept real payments |
| ✅ **Email Alerts** | Send to users |
| ✅ **24/7 Uptime** | Always running |

---

## **⚠️ IMPORTANT CHECKLIST BEFORE GOING LIVE**

- [ ] Change `NODE_ENV=production` in backend
- [ ] Use LIVE Stripe keys, not test keys
- [ ] Database backed up before first production use
- [ ] All API URLs point to production domain
- [ ] CORS origins updated to production domain only
- [ ] Sensitive data never committed to Git
- [ ] Rate limiting enabled
- [ ] Error logging configured
- [ ] Team trained on support/monitoring
- [ ] Stripe webhook connected
- [ ] Email service tested
- [ ] Payment flow tested with real card

---

## **💰 ESTIMATED MONTHLY COSTS**

```
Domain:              $12/year ÷ 12 = $1/mo
Render Backend:      $7-15/mo
PostgreSQL DB:       $15/mo (or free tier)
Stripe:              0% (only transaction fees, typically 2.9% + $0.30)
Email (SendGrid):    FREE tier (100 emails/day)
─────────────────────────────────
TOTAL:               ~$23-31/month
```

---

## **🎯 NEXT IMMEDIATE ACTIONS**

1. **TODAY:** Get domain name (5 min)
2. **TODAY:** Create Render account (5 min)
3. **TODAY:** Prepare production `.env` (15 min)
4. **TODAY:** Push code to GitHub (10 min)
5. **TOMORROW:** Deploy backend (30 min)
6. **TOMORROW:** Deploy database (20 min)
7. **TOMORROW:** Deploy frontend (20 min)
8. **TOMORROW:** Connect domain (15 min)
9. **TOMORROW:** Configure Stripe webhook (15 min)
10. **TOMORROW:** Test everything (30 min)

---

**Total time investment: ~3-4 hours for complete deployment!**

Need help with any specific step? Let me know!
