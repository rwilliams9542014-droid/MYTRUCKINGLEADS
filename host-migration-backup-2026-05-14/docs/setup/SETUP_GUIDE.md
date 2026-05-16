# MyTruckingLeads - Setup & Integration Guide

## Overview

Your MyTruckingLeads platform now includes comprehensive data enrichment capabilities with contact information scraping from multiple sources, integrated payment processing, and a robust backend API.

## Backend Setup

### 1. Environment Variables (.env)

Create a `.env` file in the `backend/` directory with the following configuration:

```env
# Server
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mytruckingleads
DB_USER=postgres
DB_PASSWORD=your_password

# FMCSA Integration
FMCSA_WEBKEY=your_fmcsa_webkey_here

# Stripe Payment Processing
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Pricing (updated for new rates)
STRIPE_PRICE_STARTER=price_1A1B2C3D4E5F6G7H  # $99/mo
STRIPE_PRICE_PRO=price_1I9J8K7L6M5N4O3P    # $149/mo
STRIPE_PRICE_AGENCY=price_1Q1R2S3T4U5V6W7X  # $250/mo

# JWT
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRY=7d

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 2. Install Dependencies

```bash
cd backend
npm install
```

### 3. Start the Backend Server

```bash
npm run dev  # Development with auto-reload (requires nodemon)
npm start    # Production
```

The API will be available at `http://localhost:4000`

## API Endpoints

### Carrier Search & Enrichment

**GET** `/api/carrier?dot=<DOT>&mc=<MC>&name=<NAME>`
- Returns enriched carrier data from multiple sources
- Includes: Contact info, safety rating, insurance expiration, completeness score
- Authentication: Required

**GET** `/api/carrier/search?name=<CARRIER_NAME>&limit=10`
- Fuzzy search carriers by name
- Authentication: Required

**GET** `/api/carrier/new-entrants?daysBack=30`
- Get newly established carriers
- Authentication: Required

### Billing & Payment

**POST** `/api/billing/checkout`
```json
{
  "plan": "starter|pro|agency",
  "email": "user@example.com",
  "userId": 123
}
```
- Creates a Stripe checkout session
- Returns session URL for payment

**GET** `/api/billing/checkout-status?sessionId=<SESSION_ID>`
- Check payment status
- Returns: status, plan, customer email, amount

**POST** `/api/billing/webhook`
- Stripe webhook endpoint (raw body required)
- Handles subscription creation, updates, cancellations, and payment events

## Data Enrichment System

### Current Implementation

The `dataEnrichmentService.js` combines data from:

1. **FMCSA API** - Official DOT carrier data
   - Safety rating, insurance expiration
   - Cargo types, vehicles, drivers
   - Days in operation

2. **Business Database** - Mock (replace with real service)
   - Email, phone, address
   - Website, company info
   - Suggested integrations:
     - ZoomInfo API
     - Apollo.io
     - Hunter.io
     - RocketReach

3. **Public Records** - Mock (replace with real service)
   - Address verification
   - Business registration
   - Suggested integrations:
     - Google Maps API
     - Yellow Pages API
     - Yelp Business API

### Data Quality Score

The system calculates a completeness score (0-100%) based on available fields:
- Email verified
- Phone verified
- Address verified
- Website available

## Stripe Integration

### Setting Up Stripe

1. **Create Stripe Account** at https://stripe.com

2. **Create Products & Prices**
   - Starter: $99/month
   - Pro: $149/month
   - Agency: $250/month

3. **Configure Webhook**
   - Go to Stripe Dashboard → Developers → Webhooks
   - Add endpoint: `YOUR_BACKEND_URL/api/billing/webhook`
   - Select events:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`

4. **Get API Keys**
   - Copy Secret Key → `STRIPE_SECRET_KEY`
   - Copy Publishable Key → `STRIPE_PUBLISHABLE_KEY`
   - Copy Webhook Secret → `STRIPE_WEBHOOK_SECRET`

### Frontend Integration

Pricing page (`pricing.html`) now includes:
- Payment buttons that trigger Stripe Checkout
- Authentication check before allowing purchase
- Session handling for payment confirmation

### Webhook Handling

The webhook system currently has placeholder functions. Update these in `stripeService.js`:

```javascript
async function handleSubscriptionEvent(subscription) {
  // TODO: Update user's plan in database
  // TODO: Send welcome email
  // TODO: Activate features
}

async function handleSubscriptionCancellation(subscription) {
  // TODO: Downgrade user to free tier
  // TODO: Send cancellation email
}
```

## Frontend Updates

### New Features

1. **Contact Information Display** (`app-dashboard.html`)
   - Shows email, phone, address, website
   - Data quality indicator
   - Copy-to-clipboard functionality

2. **Insurance Expiration Calendar** (`insurance-expiration.html`)
   - Filter by month and year
   - Safety rating filters
   - CSV export
   - Statistics dashboard

3. **Payment Integration** (`pricing.html`)
   - Direct payment buttons
   - Stripe Checkout redirect
   - Session tracking

## Multi-Source Data Integration

To enhance the data enrichment system with real services:

### Option 1: Hunter.io (Email Finding)

```javascript
// Update dataEnrichmentService.js
async function enrichEmailHunterIO(domain) {
  const response = await axios.get('https://api.hunter.io/v2/email-finder', {
    params: { domain, email: carrierName }
  });
  return response.data.data.email;
}
```

### Option 2: ZoomInfo (Business Data)

```javascript
// Create services/zoomInfoService.js
async function enrichFromZoomInfo(carrierName) {
  const response = await axios.post(
    'https://api.zoominfo.com/v2/search',
    { query: carrierName }
  );
  return response.data;
}
```

### Option 3: RocketReach (Contact Intelligence)

```javascript
// Create services/rocketReachService.js
async function enrichFromRocketReach(carrierName) {
  const response = await axios.post(
    'https://api.rocketreach.co/v2/contacts/search',
    { name: carrierName }
  );
  return response.data;
}
```

## Database Schema

When ready to go live, create these tables:

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  plan VARCHAR(50) DEFAULT 'free',
  subscription_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE carriers (
  id SERIAL PRIMARY KEY,
  dot_number VARCHAR(20),
  mc_number VARCHAR(20),
  carrier_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  address TEXT,
  safety_rating VARCHAR(50),
  insurance_expiration DATE,
  data_quality_score INT,
  last_updated TIMESTAMP DEFAULT NOW()
);

CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  carrier_id INT REFERENCES carriers(id),
  status VARCHAR(50),
  notes TEXT,
  last_contact DATE,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Testing

### Test Payment Flow

1. Use Stripe test card: `4242 4242 4242 4242`
2. Any future expiry date
3. Any CVC

### Test New Entrants Alert

```bash
curl "http://localhost:4000/api/carrier/new-entrants?daysBack=30" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Test Carrier Enrichment

```bash
curl "http://localhost:4000/api/carrier?dot=1234567" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set up PostgreSQL database
- [ ] Configure real FMCSA webkey
- [ ] Set up Stripe live keys
- [ ] Configure webhook signing secret
- [ ] Enable HTTPS
- [ ] Set up SSL certificates
- [ ] Configure CORS for production domain
- [ ] Set up monitoring/logging
- [ ] Create backup strategy
- [ ] Set up payment reconciliation
- [ ] Test webhook handling
- [ ] Configure email notifications
- [ ] Set up user support system

## Support & Troubleshooting

### Common Issues

**FMCSA API Returns Empty Results**
- Verify webkey is valid
- Check DOT/MC format
- Ensure rate limits not exceeded

**Stripe Payments Not Processing**
- Verify webhook signature in logs
- Check API keys match environment
- Review Stripe dashboard for errors

**Contact Info Not Populated**
- Mock database has limited entries
- Integrate real data sources
- Check data enrichment service logs

## Next Steps

1. Set up PostgreSQL database
2. Integrate real FMCSA webkey
3. Configure Stripe payment processing
4. Add real data source integrations
5. Implement webhook handlers for subscription management
6. Set up email notifications
7. Create admin dashboard for analytics
8. Launch MVP with limited features
9. Gradually enable advanced features per plan

---

**Note**: This is a comprehensive foundation. Customize based on your specific business requirements and data provider partnerships.
