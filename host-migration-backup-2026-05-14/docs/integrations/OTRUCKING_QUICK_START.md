# OTrucking Integration - Quick Start Guide

## What's Been Set Up

✅ **OTrucking Web Scraper** (`services/otruckingService.js`)
- Searches otrucking.com carrier directory (4.4M+ carriers)
- Gets carrier details: name, DOT#, location, equipment, fleet size
- Handles rate limiting and ethical scraping

✅ **Email Enrichment Integration** (Enhanced `controllers/carrierController.js`)
- Combines otrucking.com data with Hunter.io, Apollo, ZoomInfo, RocketReach, Clearbit
- Returns enriched data: emails, phones, addresses, websites

✅ **4 New API Endpoints** (Enhanced `routes/carrierRoutes.js`)
- Search otrucking + get emails
- Get detailed carrier info
- Browse carriers by state
- Batch search multiple carriers

✅ **Documentation**
- `OTRUCKING_INTEGRATION.md` - Full API reference
- `test-otrucking.js` - Test script to verify everything works

---

## 🚀 Getting Started (5 Steps)

### Step 1: Install Dependencies
```bash
cd backend
npm install
# Already installed: axios, cheerio, dotenv
```

### Step 2: Configure Email Enrichment (Optional but Recommended)

Edit `.env` and add your API keys:

```
# Email Enrichment Services
HUNTER_IO_API_KEY=your_key_here
APOLLO_API_KEY=your_key_here
ZOOMINFO_API_KEY=your_key_here
ROCKETREACH_API_KEY=your_key_here
CLEARBIT_API_KEY=your_key_here
```

**Where to get free trials:**
- Hunter.io: https://hunter.io (50 free searches/month)
- Apollo.io: https://apollo.io (50 free searches/month)
- ZoomInfo: https://www.zoominfo.com/api
- RocketReach: https://rocketreach.com/api
- Clearbit: https://clearbit.com

### Step 3: Start Your Server

```bash
npm run dev
# Server running on http://localhost:4000
```

### Step 4: Test the Integration

Run the test script:

```bash
node test-otrucking.js
```

This will:
1. ✅ Search for carriers on otrucking.com
2. ✅ Get detailed carrier info
3. ✅ Browse Texas carriers
4. ✅ Batch search multiple carriers
5. ✅ Enrich data with email lookups

### Step 5: Use in Your Application

See examples below →

---

## 📝 API Usage Examples

### Example 1: Search for Carriers with Emails

```javascript
// Using fetch in your frontend
const searchCarriers = async (query, state) => {
  const response = await fetch(
    `/api/carriers/otrucking/search?query=${query}&state=${state}&enrichEmail=true`,
    {
      headers: {
        'Authorization': `Bearer ${yourJwtToken}`
      }
    }
  );
  
  const data = await response.json();
  return data.results; // Array of carriers with emails!
};

// Usage
const carriers = await searchCarriers("trucking", "CA");
carriers.forEach(carrier => {
  console.log(`${carrier.companyName}: ${carrier.enrichedData.email}`);
});
```

### Example 2: Browse All Carriers in a State

```javascript
// Get all carriers in Texas (first 100)
const browseState = async (state, limit = 100) => {
  const response = await fetch(
    `/api/carriers/otrucking/state/${state}?limit=${limit}`,
    {
      headers: {
        'Authorization': `Bearer ${yourJwtToken}`
      }
    }
  );
  
  return await response.json();
};

const texasCarriers = await browseState("TX", 100);
console.log(`Found ${texasCarriers.results.length} carriers in Texas`);
```

### Example 3: Batch Search Multiple Carriers

```javascript
// Search for multiple carriers at once
const batchSearch = async (queries) => {
  const response = await fetch(`/api/carriers/otrucking/batch-search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${yourJwtToken}`
    },
    body: JSON.stringify({ queries })
  });
  
  return await response.json();
};

// Search for 5 carriers
const results = await batchSearch([
  "ABC Transportation",
  "1234567",
  "Premier Logistics",
  "XYZ Hauling",
  "9876543"
]);

console.log(`Found ${results.totalResults} carriers`);
```

### Example 4: Create Lead from Search Result

```javascript
// After finding a carrier, save as lead
const carrier = carriersFromSearch[0];

const createLead = async (carrier) => {
  const response = await fetch(`/api/leads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${yourJwtToken}`
    },
    body: JSON.stringify({
      carrierName: carrier.companyName,
      dotNumber: carrier.dotNumber,
      email: carrier.enrichedData?.email,
      phone: carrier.enrichedData?.phone,
      status: 'New',
      priority: 'Medium',
      notes: `Found via otrucking.com\nEquipment: ${carrier.equipment.join(", ")}\nFleet: ${carrier.powerUnits} units`
    })
  });
  
  return await response.json();
};

await createLead(carrier);
```

---

## 🔑 Key Information

### What otrucking.com Provides
- ✅ Company names
- ✅ DOT numbers
- ✅ MC numbers
- ✅ Headquarters location
- ✅ Equipment types
- ✅ Fleet size (power units)
- ✅ Operating status
- ❌ NO emails (these come from enrichment services)

### What Email Enrichment Provides
- ✅ Business email addresses
- ✅ Phone numbers
- ✅ Physical addresses
- ✅ Website URLs
- ✅ Company size
- ✅ Industry classification
- ✅ Contact confidence scores

### Data Flow

```
User Query
    ↓
OTrucking.com Search
    ↓ (carrier data)
Email Enrichment Service
    ↓ (Hunter, Apollo, ZoomInfo)
Combined Result
    ↓
API Response to Frontend
    ↓
Save to Database
```

---

## 🐛 Troubleshooting

### Problem: "404 Not Found" when searching
- **Solution**: Check that server is running with `npm run dev`
- Make sure you're authenticated (JWT token in headers)

### Problem: Emails are null/empty
- **Solution**: Set up email enrichment API keys in `.env`
- Make sure your free trial quotas haven't been exceeded
- Some carriers may genuinely not have public email data

### Problem: "Carrier not found"
- **Solution**: Try searching by DOT# instead of company name
- Try a different spelling
- Use state filter to narrow results

### Problem: Slow API responses
- **Solution**: This is normal for batch searches
- Add state filters to reduce dataset
- Cache results in your database

---

## 📊 Database Integration

To save carrier data to your database:

```javascript
// After enrichment, insert into carriers table
const insertCarrier = async (carrier) => {
  const response = await fetch(`/api/carriers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${yourJwtToken}`
    },
    body: JSON.stringify({
      dotNumber: carrier.dotNumber,
      carrierName: carrier.companyName,
      hqCity: carrier.location.split(',')[0],
      hqState: carrier.state,
      phone: carrier.enrichedData?.phone,
      email: carrier.enrichedData?.email,
      website: carrier.enrichedData?.website,
      vehicleCount: carrier.powerUnits,
      operatingStatus: carrier.status
    })
  });
  
  return await response.json();
};
```

---

## 🎯 Next Steps

1. **Configure API Keys**
   - Sign up for Hunter.io free trial
   - Add to `.env`
   - Test with `node test-otrucking.js`

2. **Create Frontend Components**
   - Search bar for carriers
   - Results table with emails
   - Save as lead button

3. **Build Automations**
   - Batch search weekly for new entrants
   - Auto-save prospects to database
   - Send email notifications

4. **Track Metrics**
   - How many leads generated per month
   - Email verification rates
   - Conversion from lead to customer

---

## 📞 Support

**Issues?**
- Check `OTRUCKING_INTEGRATION.md` for full documentation
- Run `node test-otrucking.js` to diagnose
- Check backend logs for error details
- Verify `.env` configuration

**Questions?**
- What data do I get from otrucking.com? → See "What otrucking.com Provides" above
- How do I get email addresses? → Use email enrichment services
- Can I search all 4.4M carriers? → Yes, search by name or DOT#
- Are there rate limits? → Scraper has built-in delays for ethical usage

---

Happy lead generation! 🚀

