# FMCSA / Motus Modernization Report

## Summary

This update preserved the current FMCSA carrier intelligence workflow, kept `FMCSA_WEBKEY` backend-only, improved live search accuracy for DOT/MC/name lookups, added Motus-aware official link handling, and introduced a provider-style FMCSA source abstraction so future Motus APIs can be added without rewriting the frontend.

## Security Review Findings

- No reviewed frontend file exposes `FMCSA_WEBKEY`.
- No reviewed frontend file directly calls `mobile.fmcsa.dot.gov/qc/services`.
- QCMobile requests remain backend-only.
- FMCSA secrets remain environment-variable based on the backend.
- The authenticated `/api/fmcsa/carrier-search` proxy route remains mounted under Express and does not return the `webKey`.

Verification notes:

- A frontend search for `FMCSA_WEBKEY`, `webKey`, and `mobile.fmcsa.dot.gov/qc/services` returned no matches in `backend/public`.
- `/api/fmcsa` is mounted in `backend/server.js`.

## Live Search Improvements

- DOT searches continue to use the live intelligence profile route.
- Explicit MC searches now use the live FMCSA-backed search path instead of the ambiguous local `/api/carriers?...` path.
- Explicit carrier-name searches now use the live FMCSA-backed search path instead of the ambiguous local `/api/carriers?...` path.
- Single-result free-text profile lookups with `limit=1` are treated as live lookups so the standalone profile page also benefits.
- Broad multi-result search flows still preserve cached/local search behavior so the site keeps its multi-match UX.
- Frontend carrier objects are normalized in `backend/public/assets/js/api.js` so DOT, MC, and name searches return a more consistent shape to the UI.

## FMCSA Proxy Validation

Verified route:

- `GET /api/fmcsa/carrier-search?dot={dot}`
- `GET /api/fmcsa/carrier-search?mc={mc}`

Validation:

- Route file: `backend/routes/fmcsaRoutes.js`
- Controller: `backend/controllers/fmcsaController.js`
- Mounted in Express: `backend/server.js`
- Service uses `FMCSA_WEBKEY` from environment variables through `backend/services/fmcsaService.js`
- The response never returns `FMCSA_WEBKEY`

## Official Link Fixes

- Fixed `backend/public/assets/js/carrier-profile.js` so `saferLink` points to the actual SAFER snapshot URL instead of the SMS Complete Profile URL.
- Preserved the SMS link.
- Updated official-link renderers to:
  - relabel `SAFER Snapshot (Legacy)`
  - keep `SMS Safety Data`
  - add `Motus Registration Portal`
  - show the Motus transition notice

## Motus Modernization

Motus support was added anywhere official FMCSA links are rendered:

- DOT Analytics profile rendering in `backend/public/assets/js/app.js`
- standalone carrier profile page in `backend/public/carrier-profile.html`
- homepage carrier modal in `backend/public/index.html`
- lead desk carrier profile modal in `backend/public/lead-desk.html`

Standard notice now shown with official links:

`FMCSA is transitioning registration services to Motus. Some legacy SAFER registration functions may move to Motus over time.`

## FMCSA Source Abstraction

The FMCSA service now exposes a provider-style abstraction in `backend/services/fmcsaService.js`.

Supported providers today:

- `qcmobile`
- `censusDot`
- `censusName`
- `sms`
- `safer`
- `motus`

Key changes:

- Added exported provider definitions.
- Added `getCarrierData()` orchestration.
- Kept `fetchCarrierByDotOrMc()` as the compatibility wrapper so existing callers continue working.
- Added Motus metadata now so a future Motus API can plug into the provider registry without changing frontend callers.

## Resiliency Improvements

- Standardized the fallback message to:

`Live FMCSA data is temporarily unavailable. Showing saved carrier data where available.`

- Applied the fallback message across:
  - carrier profile fallback responses
  - explicit live search fallback responses
  - SMS safety fallback responses
  - licensing and insurance fallback responses
  - frontend alert/rendering helpers

- Existing fallback sources remain in place:
  - Mongo cache
  - local carrier records
  - Postgres fallback
  - previous live sync data

## Files Modified

- `backend/controllers/carrierIntelligenceController.js`
- `backend/public/assets/js/api.js`
- `backend/public/assets/js/app.js`
- `backend/public/assets/js/carrier-profile.js`
- `backend/public/carrier-profile.html`
- `backend/public/index.html`
- `backend/public/lead-desk.html`
- `backend/server.js`
- `backend/services/fmcsaService.js`

## Files Created

- `backend/controllers/fmcsaController.js`
- `backend/routes/fmcsaRoutes.js`
- `backend/tests/integration/test-fmcsa-carrier-search.js`
- `docs/reports/FMCSA_ENDPOINT_AUDIT.md`
- `docs/reports/FMCSA_MOTUS_MODERNIZATION_REPORT.md`

## Verification

Passed:

- `node --check backend/controllers/fmcsaController.js`
- `node --check backend/controllers/carrierIntelligenceController.js`
- `node --check backend/routes/fmcsaRoutes.js`
- `node --check backend/server.js`
- `node --check backend/services/fmcsaService.js`
- `node --check backend/public/assets/js/api.js`
- `node --check backend/public/assets/js/app.js`
- `node --check backend/public/assets/js/carrier-profile.js`
- `node backend/tests/integration/test-fmcsa-carrier-search.js`

Verified behavior:

- No frontend `FMCSA_WEBKEY` or direct QCMobile endpoint usage was found in `backend/public`
- `/api/fmcsa` is mounted in `backend/server.js`
- QCMobile remains backend-only

## Recommended Next Steps

1. Add an integration test that exercises `searchCarrierIntelligence()` for `mc` and `name` queries so the new live-search preference stays covered.
2. If FMCSA publishes a Motus API, implement the `motus` provider in `backend/services/fmcsaService.js` and keep the frontend unchanged.
3. Consider a small shared frontend helper for official FMCSA/Motus links so `index.html`, `lead-desk.html`, and `carrier-profile.html` stop duplicating the same rendering logic.
4. When you are ready, deploy and smoke-test:
   - DOT lookup
   - MC lookup
   - name lookup
   - carrier profile official links
   - fallback behavior when live FMCSA requests fail
