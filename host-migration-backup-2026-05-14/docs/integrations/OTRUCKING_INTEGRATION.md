# OTrucking.com Integration Guide

## Overview

This integration allows you to:
1. **Search carriers** on otrucking.com (4.4M+ FMCSA-registered carriers)
2. **Extract carrier information** (DOT#, location, equipment, fleet size)
3. **Get contact details** INCLUDING EMAIL ADDRESSES directly from otrucking.com
4. **Enrich data further** with additional emails from Hunter.io, Apollo, ZoomInfo, RocketReach, and Clearbit
5. **Browse carriers by state** to build targeted lead lists
6. **Batch search multiple carriers** at once

## Important Note

**Good news! otrucking.com DOES provide carrier email addresses!** 

The contact information (email, phone, address, company officer) is displayed on each carrier's detail page and our scraper extracts it automatically. You can also optionally enrich further with additional contact sources if needed.

## API Endpoints

### 1. Search OTrucking & Enrich with Email

Get carriers from otrucking.com + find their emails

```bash
GET /api/carriers/otrucking/search?query=trucking&state=CA&enrichEmail=true
```

**Parameters:**
- `query` (required): Company name or DOT number
- `state` (optional): 2-letter state code (CA, TX, FL, etc.)
- `enrichEmail` (optional, default=true): Whether to enrich with email data

**Example Response:**
```json
{
  "source": "otrucking.com",
  "totalResults": 2,
  "results": [
    {
      "companyName": "ABC PARKING LOT SERVICES LLC",
      "dotNumber": "4263728",
      "location": "UTICA, MI",
      "state": "MI",
      "powerUnits": 63500,
      "equipment": ["Flatbed", "Dump Truck", "Box Truck"],
      "status": "Active",
      "detailUrl": "https://otrucking.com/carrier/...",
      "enrichedData": {
        "email": "dispatch@abctrucking.com",
        "phone": "(555) 123-4567",
        "address": "123 Main St, Utica, MI 48317",
        "website": "www.abctrucking.com",
        "dataSources": ["Hunter.io", "Apollo.io"],
        "additionalEmails": ["owner@abctrucking.com"]
      }
    }
  ]
}
```

### 2. Get Detailed Carrier Info

Get full details for a specific carrier from otrucking.com

```bash
GET /api/carriers/otrucking/detail/:dot
```

**Example:**
```bash
GET /api/carriers/otrucking/detail/4263728
```

### 3. Browse Carriers by State

Get list of carriers in a specific state

```bash
GET /api/carriers/otrucking/state/:stateCode?limit=50
```

**Parameters:**
- `stateCode` (required): 2-letter state abbreviation
- `limit` (optional, default=50): Max results to return

**Example:**
```bash
GET /api/carriers/otrucking/state/TX?limit=100
```

### 4. Batch Search Multiple Carriers

Search for multiple carriers at once

```bash
POST /api/carriers/otrucking/batch-search
Content-Type: application/json

{
  "queries": ["ABC Trucking", "1234567", "XYZ Transport", "5678901"]
}
```

**Response:**
```json
{
  "source": "otrucking.com",
  "queriesSubmitted": 4,
  "totalResults": 12,
  "results": [
    {
      "companyName": "ABC TRUCKING INC",
      "dotNumber": "1234567",
      ...
    },
    ...
  ]
}
```

## Setup & Configuration

### 1. Environment Variables

Your `.env` file should include email enrichment service keys:

```
# OTrucking.com Settings
OTRUCKING_SCRAPE_DELAY=500  # Milliseconds between requests (respectful)

# Email Enrichment Services (optional but recommended)
HUNTER_IO_API_KEY=your_key_here
APOLLO_API_KEY=your_key_here
ZOOMINFO_API_KEY=your_key_here
ROCKETREACH_API_KEY=your_key_here
CLEARBIT_API_KEY=your_key_here
```

### 2. Install Dependencies

Already installed in your project:
```bash
npm install axios cheerio
```

### 3. Database Setup

Carrier data is stored in your existing tables:

- **carriers table**: Basic FMCSA data (DOT, MC, name, location, etc.)
- **enriched_carrier_data table**: Email, phone, website (from enrichment services)

## Usage Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

// 1. Search carriers and get emails
async function findCarriersWithEmails() {
  const response = await axios.get('/api/carriers/otrucking/search', {
    params: {
      query: 'trucking',
      state: 'CA',
      enrichEmail: true
    },
    headers: {
      'Authorization': `Bearer ${YOUR_JWT_TOKEN}`
    }
  });
  
  console.log(response.data.results);
}

// 2. Browse all Texas carriers
async function browseTexasCarriers() {
  const response = await axios.get('/api/carriers/otrucking/state/TX', {
    params: { limit: 100 },
    headers: {
      'Authorization': `Bearer ${YOUR_JWT_TOKEN}`
    }
  });
  
  return response.data.results;
}

// 3. Batch search
async function batchSearch() {
  const response = await axios.post('/api/carriers/otrucking/batch-search', 
    {
      queries: [
        'Premier Transportation',
        '1234567',
        'ABC Logistics',
        '9876543'
      ]
    },
    {
      headers: {
        'Authorization': `Bearer ${YOUR_JWT_TOKEN}`
      }
    }
  );
  
  return response.data.results;
}
```

### cURL Examples

```bash
# 1. Search for "trucking" in California
curl -X GET "http://localhost:4000/api/carriers/otrucking/search?query=trucking&state=CA&enrichEmail=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 2. Get details for DOT 1234567
curl -X GET "http://localhost:4000/api/carriers/otrucking/detail/1234567" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 3. Browse Texas carriers (first 50)
curl -X GET "http://localhost:4000/api/carriers/otrucking/state/TX?limit=50" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 4. Batch search
curl -X POST "http://localhost:4000/api/carriers/otrucking/batch-search" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "queries": ["ABC Trucking", "1234567", "XYZ Transport"]
  }'
```

## Data Returned

### Carrier Object Structure

```javascript
{
  // From otrucking.com
  "companyName": "ABC PARKING LOT SERVICES LLC",
  "dotNumber": "4263728",
  "mcNumber": null,
  "location": "UTICA, MI",
  "state": "MI",
  "powerUnits": 63500,
  "equipment": ["Flatbed", "Dump Truck", "Box Truck"],
  "status": "Active",
  "detailUrl": "https://otrucking.com/carrier/...",
  "source": "otrucking.com",
  
  // Enriched data (if enrichEmail=true)
  "enrichedData": {
    "email": "dispatch@abctrucking.com",
    "phone": "(555) 123-4567",
    "address": "123 Main St, Utica, MI 48317",
    "website": "www.abctrucking.com",
    "dataSources": ["Hunter.io", "Apollo.io"],
    "additionalEmails": ["owner@abctrucking.com"],
    "additionalPhones": ["(555) 123-4568"]
  }
}
```

## Integration with Your System

### 1. Save Carriers to Database

After searching, save carriers to your `carriers` table:

```sql
INSERT INTO carriers (
  dot_number, 
  carrier_name, 
  hq_city, 
  hq_state, 
  phone, 
  email, 
  website, 
  vehicle_count, 
  operating_status
) VALUES (
  '4263728',
  'ABC PARKING LOT SERVICES LLC',
  'UTICA',
  'MI',
  '(555) 123-4567',
  'dispatch@abctrucking.com',
  'www.abctrucking.com',
  63500,
  'Active'
);
```

### 2. Create Leads from OTrucking Results

Convert search results to leads in your system:

```javascript
async function saveLead(userId, carrierData) {
  const response = await axios.post('/api/leads', {
    userId,
    carrierName: carrierData.companyName,
    dotNumber: carrierData.dotNumber,
    email: carrierData.enrichedData?.email,
    phone: carrierData.enrichedData?.phone,
    status: 'New'
  });
  
  return response.data;
}
```

## Performance Tips

1. **Use Batch Search** for multiple carriers instead of individual searches
2. **Cache Results** - Don't search the same carrier twice within 24 hours
3. **Rate Limiting** - Add delays between requests (already built-in: 500ms)
4. **Filter First** - Use state filters to narrow down results
5. **Async Processing** - Use queue system for large batch searches

## Troubleshooting

### "No carriers found"
- Check spelling of company name
- Try using DOT number instead
- Verify state code is correct (2 letters)

### Emails are null
- Ensure email enrichment API keys are configured in `.env`
- Check that Hunter.io/Apollo quotas aren't exceeded
- Some carriers may not have public email data available

### Slow responses
- Batch searches with 50+ queries take time (intentional - respectful scraping)
- Add state filters to reduce result set
- Cache previous results

## Ethical Scraping

This integration respects otrucking.com's terms:
- ✅ User-Agent headers included
- ✅ Delays between requests (500ms)
- ✅ No aggressive parallel requests
- ✅ Scraping public search results (allowed)
- ✅ Public information only

## Rate Limits

- **otrucking.com**: No public rate limits published
- **Your API**: Apply your own rate limiting via `express-rate-limit`
- **Enrichment APIs**: See individual service documentation

## Next Steps

1. ✅ Test the endpoints with cURL
2. ✅ Set up email enrichment API keys
3. ✅ Integrate results into your lead management system
4. ✅ Build dashboards to track carrier data
5. ✅ Automate batch searches for new entrants

## Support

For issues or questions:
- Check your backend logs for error messages
- Verify `.env` configuration
- Test enrichment API keys individually
- Check otrucking.com is accessible from your network
