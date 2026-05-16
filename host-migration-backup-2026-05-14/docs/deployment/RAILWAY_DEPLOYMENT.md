# Railway Deployment Guide - MyTruckingLeads

Complete guide to deploy your MyTruckingLeads SaaS platform to Railway (~$5-7/month).

---

## 📋 Prerequisites

- GitHub account
- Railway account (sign up at [railway.app](https://railway.app))
- Domain name (optional, for production)
- Stripe account (for payments)
- FMCSA API key (for carrier data)

---

## 🚀 Quick Start (5 Steps)

### Step 1: Push Code to GitHub

Your code must be on GitHub for Railway to deploy it.

```bash
# In your project folder (c:\Users\RONNY W\Desktop\MY WEBSITE)
git init
git add .
git commit -m "Initial commit - MyTruckingLeads"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/mytruckingleads.git
git push -u origin main
```

> **Note:** If prompted for password, use a [GitHub Personal Access Token](https://github.com/settings/tokens) with `repo` scope.

### Step 2: Create Railway Project

1. Go to [Railway Dashboard](https://railway.app)
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Find and select your `mytruckingleads` repository
5. **Important:** Set the root directory to `backend`

### Step 3: Configure Environment Variables

In Railway dashboard → Your project → **"Variables"** tab, add these:

```bash
# Required
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com
JWT_SECRET=generate_a_random_32_character_string_here_like_aB3$xY9@zK2#mP8!vL5&qR7

# Database (Railway auto-adds these when you add PostgreSQL)
# DATABASE_URL will be automatically set

# API Keys
FMCSA_WEBKEY=your_fmcsa_webkey_from_fmcsa_portal

# Stripe (Get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_live_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_live_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Optional
CORS_ALLOW_ALL=false
PUBLIC_CARRIER_LOOKUP_ENABLED=true
PUBLIC_LEAD_LOOKUP_ENABLED=true
```

### Step 4: Add PostgreSQL Database

1. In your Railway project, click **"New"** → **"Database"** → **"PostgreSQL"**
2. Railway will automatically:
   - Create the database
   - Add connection variables to your backend service
3. **Initialize the schema:**
   - Copy the connection string from the PostgreSQL service
   - Run: `psql "your_connection_string" < backend/schema.sql`
   - Or use Railway's web-based database browser

### Step 5: Deploy!

Railway will automatically deploy when you push to GitHub. You can also manually trigger a deployment:

1. Go to your project in Railway
2. Click **"Deploy"** → **"Deploy manually"**
3. Wait 2-3 minutes for deployment

Your backend will be available at: `https://your-project-name.railway.app`

---

## 🌐 Frontend Deployment Options

### Option A: Serve Frontend from Backend (Simplest)

The backend already serves static files. Just upload your HTML files to the `backend/public` folder or update the server to serve from the root:

In `backend/server.js`, the static file serving is already configured:
```javascript
app.use(express.static(join(__dirname, "public")));
```

To serve the main frontend files, copy them to `backend/public/`:
- `index.html`
- `login.html`
- `signup.html`
- `pricing.html`
- `app-dashboard.html`
- `crm.html`
- `assets/` folder

### Option B: Deploy Frontend Separately on Vercel (Recommended)

1. Go to [Vercel](https://vercel.com)
2. Import your GitHub repository
3. Configure:
   - **Root Directory:** Leave as root (where `index.html` is)
   - **Build Command:** Leave blank
   - **Output Directory:** Leave blank
4. Deploy

### Option C: Use Netlify

Similar to Vercel - just drag and drop your project folder.

---

## 🔗 Connect Your Domain

### For Railway (All-in-One)

1. In Railway → Your project → **"Settings"** → **"Custom Domain"**
2. Add your domain (e.g., `mytruckingleads.com`)
3. Copy the CNAME record shown
4. Go to your domain registrar (Namecheap, GoDaddy, etc.)
5. Add CNAME record: `@` → `your-project-name.up.railway.app`
6. Wait 24-48 hours for DNS propagation

### For Vercel + Railway

1. In Vercel → Project Settings → **"Domains"**
2. Add your custom domain
3. Update your domain's nameservers to Vercel's
4. In Railway, set `FRONTEND_URL` to your custom domain

---

## 💳 Stripe Configuration

### 1. Create Products & Prices

In Stripe Dashboard:
1. Go to **Products** → **Add product**
2. Create three products: Basic, Pro, Premium
3. For each, add pricing (monthly/annual)
4. Copy the Price IDs

### 2. Add Price IDs to Railway

```bash
STRIPE_PRICE_BASIC=price_xxxxx
STRIPE_PRICE_PRO=price_xxxxx
STRIPE_PRICE_PREMIUM=price_xxxxx
```

### 3. Configure Webhooks

1. Go to Stripe → **Developers** → **Webhooks**
2. Click **"Add endpoint"**
3. **Endpoint URL:** `https://your-railway-url.railway.app/api/billing/webhook`
4. **Events to send:**
   - `subscription.created`
   - `subscription.updated`
   - `subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Signing secret** (starts with `whsec_`)
6. Add to Railway: `STRIPE_WEBHOOK_SECRET=whsec_xxxxx`

---

## 🧪 Testing Before Going Live

### 1. Test Backend Health

```bash
curl https://your-railway-url.railway.app/api/health
```

Should return: `{"status":"ok","timestamp":"..."}`

### 2. Test API Calls

Open browser console and run:
```javascript
fetch('https://your-railway-url.railway.app/api/health')
  .then(r => r.json())
  .then(d => console.log(d))
```

### 3. Test with Stripe Test Mode

1. In Stripe Dashboard, enable **Test Mode**
2. Use test card: `4242 4242 4242 4242`
3. Test the entire payment flow
4. Check Stripe logs for successful test transactions

### 4. Test Login/Signup

1. Create a test account
2. Verify email (if enabled)
3. Check if user is saved to database

---

## 🚨 Troubleshooting

### Frontend doesn't load?
- Check browser console (F12) for errors
- Verify API_BASE is correctly configured in `assets/js/api.js`
- Check if Railway deployment succeeded (view logs)

### API calls fail with CORS errors?
- Ensure `FRONTEND_URL` is set correctly in Railway variables
- Check CORS configuration in `backend/server.js`
- Verify your frontend origin matches exactly (including https)

### Database connection errors?
- Verify PostgreSQL service is running in Railway
- Check DATABASE_URL is set correctly
- Ensure schema.sql was loaded successfully

### Stripe webhook not firing?
- Verify webhook endpoint URL is correct
- Check Railway logs for incoming webhook requests
- Ensure STRIPE_WEBHOOK_SECRET matches

### "Cannot find module" errors?
- Check `package.json` has all dependencies
- Trigger a new deployment in Railway
- View build logs to see what failed

---

## 📊 Monitoring & Logs

### View Railway Logs

1. Go to your Railway project
2. Click on the service
3. Click **"Deployments"** → **"View Logs"**

### Set up Alerts

Railway offers usage alerts in Settings → Alerts.

---

## 💰 Cost Breakdown

```
Domain (Namecheap):        $0.74/mo ($8.88/year)
Railway (Hobby plan):      $5.00/mo
Railway Database:          Included
Stripe:                    0% + 2.9% + $0.30 per transaction
────────────────────────────────────
TOTAL:                     ~$5.74/month
```

---

## ✅ Pre-Launch Checklist

- [ ] Code pushed to GitHub
- [ ] Railway project created from GitHub repo
- [ ] Backend root directory set to `backend`
- [ ] All environment variables configured
- [ ] PostgreSQL database added and schema loaded
- [ ] Frontend deployed (Railway, Vercel, or Netlify)
- [ ] Custom domain connected (if using)
- [ ] Stripe products and prices created
- [ ] Stripe webhook configured
- [ ] FMCSA API key added
- [ ] Test payment successful (Stripe test mode)
- [ ] Login/signup working
- [ ] CORS configured for production domain
- [ ] `.env` file NOT committed to GitHub (check .gitignore)

---

## 🔒 Security Reminders

1. **Never commit `.env` files** - they contain secrets
2. **Use strong JWT_SECRET** - generate with `openssl rand -base64 32`
3. **Enable HTTPS** - Railway provides free SSL
4. **Use Stripe test mode** before going live
5. **Rotate API keys** regularly
6. **Monitor Railway usage** to avoid surprise bills

---

## 📞 Support Resources

- [Railway Documentation](https://docs.railway.app)
- [Stripe Documentation](https://stripe.com/docs)
- [FMCSA API Documentation](https://portal.fmcsa.dot.gov)
- [Vercel Documentation](https://vercel.com/docs)

---

## 🆘 Getting Help

If you encounter issues:

1. Check Railway deployment logs first
2. Search the error message in Railway docs
3. Check if environment variables are set correctly
4. Verify database connection string
5. Test API endpoints with curl/Postman

---

**You're ready to deploy! 🚀**

Estimated time: 1-2 hours for first-time setup.