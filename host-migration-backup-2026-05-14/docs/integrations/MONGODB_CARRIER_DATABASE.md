# MongoDB Carrier Database Backend

This backend stores FMCSA carrier data locally in MongoDB so the website can search your own database instead of hitting SAFER/FMCSA for every page view.

## Folder Structure

```text
backend/
  config/
    mongo.js
  controllers/
    localCarrierController.js
  cron/
    carrierUpdateCron.js
  models/
    Carrier.js
    CarrierChange.js
  routes/
    carrierRoutes.js
    leadRoutes.js
  scripts/
    seedCarriers.js
    runCarrierUpdate.js
  services/
    carrierImportService.js
    safeScrapingService.js
  server.js
  package.json
```

## MongoDB Setup

Install MongoDB locally or use MongoDB Atlas.

Local example:

```bash
mongod --dbpath C:/data/db
```

Add these values to `backend/.env`:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/mytruckingleads
MONGODB_MAX_POOL_SIZE=20

FMCSA_IMPORT_BATCH_SIZE=1000
FMCSA_REQUEST_DELAY_MS=500
FMCSA_REQUEST_RETRIES=3

CARRIER_HISTORY_ENABLED=true
CARRIER_CRON_ENABLED=true
CARRIER_CRON_SCHEDULE=0 2 * * *
CARRIER_CRON_TIMEZONE=America/New_York
```

Optional:

```env
SOCRATA_APP_TOKEN=your_data_transportation_gov_app_token
FMCSA_DAILY_IMPORT_LIMIT=0
FMCSA_DAILY_WHERE=
PUBLIC_CARRIER_LOOKUP_ENABLED=false
PUBLIC_LEAD_LOOKUP_ENABLED=false
```

`FMCSA_DAILY_IMPORT_LIMIT=0` means no artificial limit. For testing, use a small value like `100`.

## Install

```bash
cd backend
npm install
```

## Seed The Database

Small test import:

```bash
npm run seed:carriers -- --limit=100
```

Full import:

```bash
npm run seed:carriers
```

Targeted live SAFER/FMCSA refresh for specific DOT numbers, including your existing enrichment flow for contact email:

```bash
npm run seed:carriers -- --dots=1234567,2345678
```

The bulk seed uses the FMCSA Company Census dataset because it is suitable for large imports. The targeted DOT mode uses the existing enrichment API plus live FMCSA/SAFER lookup path for deeper profile and email data.

## Enrich Insurance Dates

Renewal leads require `insuranceExpirationDate`. The FMCSA Company Census file often does not include that field, so the backend also imports FMCSA `ActPendInsur - All With History`, which contains active/pending insurance implementation dates including `cancl_effective_date`.

Pull insurance dates for the next 365 days:

```bash
npm run enrich:insurance
```

Pull a specific window:

```bash
npm run enrich:insurance -- --from=2026-05-01 --to=2026-06-30
```

Small test run:

```bash
npm run enrich:insurance -- --limit=500
```

The importer stores:

- Insurance Expiration/Cancellation Effective Date
- Insurance Effective Date
- Insurance Company
- Policy Number
- Form Code
- Insurance Type

It creates a partial carrier record if the insurance dataset contains a DOT number that has not been imported from the census file yet.
By default it also hydrates those DOT numbers from the FMCSA Company Census file in small batches so renewal rows include carrier name, state, phone, email, and fleet size when available.

## Daily Cron

Option 1: run inside the Express server:

```env
CARRIER_CRON_ENABLED=true
CARRIER_CRON_SCHEDULE=0 2 * * *
```

Then:

```bash
npm run start
```

Option 2: run once from an external scheduler:

```bash
npm run update:carriers
```

Use Windows Task Scheduler, cron, Railway cron, Render cron, or GitHub Actions to run that command daily.

`npm run update:carriers` also imports insurance dates unless `CARRIER_CRON_INSURANCE_ENABLED=false`.

## API Endpoints

The server exposes both `/api/...` and non-API aliases for the new carrier lead routes.
In production, public carrier lookup and public lead lookup are controlled separately with
`PUBLIC_CARRIER_LOOKUP_ENABLED` and `PUBLIC_LEAD_LOOKUP_ENABLED`.

```text
GET /api/carriers
GET /api/carriers/:dot
GET /api/leads/renewals?days=30
GET /api/leads/new
```

Search examples:

```bash
curl "http://localhost:4000/api/carriers?state=TX&authorityStatus=Active&page=1&limit=50"
curl "http://localhost:4000/api/carriers?dot=3637136"
curl "http://localhost:4000/api/leads/renewals?days=30&state=CA"
curl "http://localhost:4000/api/leads/new?days=14"
```

Live FMCSA fallback remains available:

```bash
curl "http://localhost:4000/api/carrier?dot=3637136"
curl "http://localhost:4000/api/carriers?live=true&dot=3637136"
```

## Indexes

`Carrier.js` defines indexes for:

- Unique `dotNumber`
- `address.state`
- `insuranceExpirationDate`
- `authorityStatus`
- `dateCreated`
- `isNewLead` and `newLeadSince`
- Compound state/status and insurance/status filters
- Text search across legal name, DBA name, and DOT number

## Historical Changes

When an existing carrier changes, the importer updates only changed fields and writes change records to `carrierchanges`.

Disable history if needed:

```env
CARRIER_HISTORY_ENABLED=false
```
