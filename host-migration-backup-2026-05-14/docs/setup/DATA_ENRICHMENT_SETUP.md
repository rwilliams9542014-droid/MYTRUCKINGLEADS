# Data Enrichment Integration Guide

## Overview

Your MyTruckingLeads platform now supports integration with 6 premium data enrichment services + FMCSA for comprehensive carrier contact information gathering. This is a true **one-stop shop** for getting the most accurate carrier data.

## Supported Data Sources

### 1. **FMCSA** (FREE - Always Included)
- **Cost**: Free with WebKey
- **What you get**: Safety ratings, insurance expiration, cargo types, vehicles, drivers
- **Email/Phone/Address**: Limited (only if carrier provided to FMCSA)
- **Setup**: Add `FMCSA_WEBKEY` to `.env`
- **Website**: https://safer.fmcsa.dot.gov/

**API Response**:
```json
{
  "safetyRating": "Satisfactory",
  "insuranceExpiration": "2026-08-15",
  "vehicles": 45,
  "drivers": 52
}
```

---

### 2. **Hunter.io** (Email Finding)
- **Cost**: ~$0.10-$0.50 per email (or ~$50/mo for 1,000 credits)
- **What you get**: Verified business emails, confidence score
- **Best for**: Email finding with high verification rates
- **Accuracy**: 95%+ verified emails
- **Setup**: 
  1. Sign up at https://hunter.io
  2. Get API key from dashboard
  3. Add to `.env`: `HUNTER_IO_API_KEY=your_key`

**API Response**:
```json
{
  "email": "dispatch@carrier.com",
  "confidence": "95",
  "verified": true
}
```

**Integration Code**:
```javascript
// Automatically called in enrichment pipeline
// No additional coding needed - just add API key to .env
```

---

### 3. **Apollo.io** (Most Comprehensive)
- **Cost**: ~$100-$300/mo depending on usage
- **What you get**: Email, phone, address, website, company size, industry
- **Best for**: Complete B2B contact data
- **Accuracy**: 85-90% match rate
- **Setup**:
  1. Sign up at https://apollo.io
  2. Get API key from dashboard
  3. Add to `.env`: `APOLLO_API_KEY=your_key`

**API Response**:
```json
{
  "email": "dispatch@carrier.com",
  "phone": "(555) 123-4567",
  "address": "123 Main St, Columbus, OH 43215",
  "website": "www.carrier.com",
  "companySize": "50-100 employees",
  "industry": "Transportation"
}
```

**Why it's great**: Gets decision makers (Dispatcher, Owner, Manager) automatically

---

### 4. **ZoomInfo** (Premium Business Intelligence)
- **Cost**: $300-$1,000+/mo (enterprise pricing)
- **What you get**: Email, phone, address, revenue, employee count, verified data
- **Best for**: Accuracy and business intelligence
- **Accuracy**: 92-96% (highest premium option)
- **Setup**:
  1. Sign up at https://www.zoominfo.com/api
  2. Get API key from dashboard
  3. Add to `.env`: `ZOOMINFO_API_KEY=your_key`

**API Response**:
```json
{
  "email": "dispatch@carrier.com",
  "phone": "(555) 123-4567",
  "address": "123 Main St, Columbus, OH 43215",
  "website": "www.carrier.com",
  "annualRevenue": "$5M-$10M",
  "employeeCount": 75
}
```

---

### 5. **RocketReach** (Decision Maker Intelligence)
- **Cost**: ~$150-$500/mo depending on usage
- **What you get**: Email, phone, LinkedIn profiles, job changes, decision maker info
- **Best for**: Finding decision makers and tracking job changes
- **Accuracy**: 88-92%
- **Setup**:
  1. Sign up at https://rocketreach.co
  2. Get API key from dashboard
  3. Add to `.env`: `ROCKETREACH_API_KEY=your_key`

**API Response**:
```json
{
  "email": "dispatch@carrier.com",
  "phone": "(555) 123-4567",
  "linkedinUrl": "https://linkedin.com/in/person",
  "decisionMaker": {
    "name": "John Smith",
    "title": "Dispatcher",
    "jobChangeData": "2024-06-15"
  }
}
```

**Why it's great**: Identifies job changes - you'll know when key people change roles

---

### 6. **Clearbit** (Real-Time Business Data)
- **Cost**: ~$500-$2,000+/mo depending on usage
- **What you get**: Real-time company data, person data, logos, industry tags
- **Best for**: Real-time verification and enrichment
- **Accuracy**: 90-95% (real-time updates)
- **Setup**:
  1. Sign up at https://clearbit.com
  2. Get API key from dashboard
  3. Add to `.env`: `CLEARBIT_API_KEY=your_key`

**API Response**:
```json
{
  "company": {
    "logo": "https://clearbit.com/api/logo.jpg",
    "industry": "Transportation",
    "tags": ["trucking", "logistics", "B2B"],
    "phone": "(555) 123-4567"
  },
  "person": {
    "name": "John Smith",
    "title": "Dispatcher",
    "seniority": "manager"
  }
}
```

---

## Priority Order (Automatic)

Your system automatically prioritizes data sources in this order:

1. **Hunter.io** (most verified emails)
2. **Apollo.io** (most complete)
3. **FMCSA** (always available, free)
4. **Clearbit** (real-time)
5. **ZoomInfo** (premium accuracy)
6. **RocketReach** (decision makers)
7. **Local Database** (fallback)

This means if Hunter.io finds an email, it uses that. If not, it tries Apollo. If none of the premium services are configured, it falls back to FMCSA + local database.

## Setup Instructions

### Quick Start (Free Only)
```bash
# 1. Set FMCSA WebKey
FMCSA_WEBKEY=your_webkey

# 2. Done! You're live with basic carrier data
```

### Add One Premium Service (Hunter.io - Cheapest)
```bash
# .env file
FMCSA_WEBKEY=your_webkey
HUNTER_IO_API_KEY=your_hunter_key

# Now you get verified emails automatically
```

### Full Premium Setup (Best Results)
```bash
# .env file
FMCSA_WEBKEY=your_webkey
HUNTER_IO_API_KEY=your_hunter_key
APOLLO_API_KEY=your_apollo_key
ZOOMINFO_API_KEY=your_zoominfo_key
ROCKETREACH_API_KEY=your_rocketreach_key
CLEARBIT_API_KEY=your_clearbit_key

# Now you get maximum coverage and accuracy
```

## Cost Breakdown (Monthly)

### Budget Option (~$50-100/mo)
- FMCSA: Free
- Hunter.io: ~$50/mo (1,000 credits = 1,000 emails)
- **Total**: ~$50/mo
- **Data coverage**: 70% (email + FMCSA data)

### Professional Option (~$200-300/mo)
- FMCSA: Free
- Hunter.io: ~$50/mo
- Apollo.io: ~$150-200/mo
- **Total**: ~$200-250/mo
- **Data coverage**: 85% (email, phone, address, company data)

### Enterprise Option (~$500-1,500/mo)
- FMCSA: Free
- Hunter.io: ~$50/mo
- Apollo.io: ~$150/mo
- ZoomInfo: ~$400/mo
- RocketReach: ~$200/mo
- Clearbit: ~$500/mo
- **Total**: ~$1,300/mo
- **Data coverage**: 95%+ (everything + real-time + decision makers)

## API Response Example

When you search for a carrier, you get enriched data like:

```json
{
  "dot": "1234567",
  "mc": "7654321",
  "carrierName": "ABC Trucking LLC",
  "fmcsaData": {
    "safetyRating": "Satisfactory",
    "insuranceExpiration": "2026-08-15",
    "vehicles": 45,
    "drivers": 52
  },
  "apolloData": {
    "email": "dispatch@abctrucking.com",
    "phone": "(555) 123-4567",
    "address": "123 Main St, Columbus, OH 43215",
    "website": "www.abctrucking.com",
    "industry": "Transportation",
    "companySize": "50-100 employees"
  },
  "hunterioData": {
    "email": "dispatch@abctrucking.com",
    "confidence": "95",
    "verified": true
  },
  "rocketreachData": {
    "decisionMaker": {
      "name": "John Smith",
      "title": "Operations Manager",
      "linkedinUrl": "https://linkedin.com/in/jsmith"
    }
  },
  "primaryContact": {
    "email": "dispatch@abctrucking.com",
    "phone": "(555) 123-4567",
    "address": "123 Main St, Columbus, OH 43215",
    "website": "www.abctrucking.com"
  },
  "alternateContacts": [
    {
      "email": "info@abctrucking.com",
      "source": "Apollo.io"
    }
  ],
  "dataSources": ["FMCSA", "Apollo.io", "Hunter.io", "RocketReach"],
  "completeness": 95,
  "dataQuality": {
    "emailVerified": true,
    "phoneVerified": true,
    "addressVerified": true
  }
}
```

## Testing Your Integration

### Test with Mock Data (No API Keys)
```bash
# Works immediately with included mock data
curl "http://localhost:4000/api/carrier?dot=1234567"
```

### Test with Hunter.io
```bash
# Add HUNTER_IO_API_KEY to .env
# Then:
curl "http://localhost:4000/api/carrier?dot=1234567&domain=example.com"
```

### Test with Apollo.io
```bash
# Add APOLLO_API_KEY to .env
# Then:
curl "http://localhost:4000/api/carrier?name=ABC%20Trucking"
```

## Comparison Matrix

| Feature | FMCSA | Hunter | Apollo | ZoomInfo | Rocket | Clearbit |
|---------|-------|--------|--------|----------|--------|----------|
| Email | ✓ | ✓✓✓ | ✓✓ | ✓✓ | ✓✓ | ✓✓ |
| Phone | ✓ | ✗ | ✓✓ | ✓✓ | ✓✓ | ✓✓ |
| Address | ✓ | ✗ | ✓✓ | ✓✓ | ✓ | ✓ |
| Website | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Email Verified | ~ | ✓✓✓ | ✓ | ✓✓ | ✓ | ✓ |
| Decision Makers | ✗ | ✗ | ✓ | ✗ | ✓✓ | ✓ |
| Job Changes | ✗ | ✗ | ✗ | ✗ | ✓✓ | ✗ |
| LinkedIn | ✗ | ✗ | ✗ | ✗ | ✓✓ | ✗ |
| Real-Time | ✗ | ~ | ~ | ~ | ~ | ✓✓✓ |
| Cost (Low) | Free | Low | Med | High | Med | High |

## Troubleshooting

### "API key not configured" warning
- Add the API key to `.env`
- Restart backend server
- System will skip that service and try next one

### No results from a service
- Verify API key is correct
- Check service credits/usage
- Some carriers may not be in certain databases
- System automatically tries other sources

### Slow responses
- Add a timeout in `.env`: `ENRICHMENT_TIMEOUT=5000` (5 seconds)
- System will return partial results if timeout reached

## Recommendations

### For Startups (Bootstrap Phase)
Start with **FMCSA + Hunter.io** ($50/mo)
- Get insurance & safety data (free)
- Get verified emails (cheapest option)
- 70% coverage - good for MVP

### For Growth Phase
Add **Apollo.io** (~$200/mo total)
- Comprehensive contact info
- Phone numbers and addresses
- 85% coverage - professional service

### For Enterprise
Add all services (~$1,300/mo)
- Maximum accuracy (95%+)
- Real-time data
- Decision maker tracking
- Job change alerts

## Advanced: Custom Integration

To add another data service:

1. **Create a function in `dataEnrichmentService.js`**:
```javascript
export async function enrichFromYourService(carrierName, dot) {
  if (!process.env.YOUR_SERVICE_API_KEY) return null;
  try {
    const response = await axios.get('https://api.yourservice.com/...');
    return {
      source: "Your Service",
      data: { email, phone, address, website }
    };
  } catch (err) {
    console.error("Error:", err.message);
    return null;
  }
}
```

2. **Add to enrichCarrierData function**:
```javascript
const yourResult = await enrichFromYourService(carrierName, dot);
```

3. **Add to priority order** in the `primaryContact` selection logic

## Support

- Hunter.io: https://hunter.io/support
- Apollo.io: https://support.apollo.io
- ZoomInfo: https://www.zoominfo.com/support
- RocketReach: https://support.rocketreach.co
- Clearbit: https://clearbit.com/support
- FMCSA: https://safer.fmcsa.dot.gov/

---

**Your system is now a true one-stop shop for comprehensive carrier data! 🚀**
