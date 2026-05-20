# FMCSA Endpoint Audit

## Scope

This audit covers the DOT Analytics page and the related frontend and backend files that participate in FMCSA carrier lookup, SAFER snapshot lookup, SMS safety lookup, licensing and insurance lookup, and QCMobile access.

Primary files reviewed:

- `backend/public/dot-analytics.html`
- `backend/public/assets/js/app.js`
- `backend/public/assets/js/api.js`
- `backend/public/assets/js/carrier-profile.js`
- `backend/public/carrier-profile.html`
- `backend/public/lead-desk.html`
- `backend/routes/carrierRoutes.js`
- `backend/controllers/carrierIntelligenceController.js`
- `backend/controllers/localCarrierController.js`
- `backend/services/fmcsaService.js`
- `backend/services/newVentureService.js`
- `backend/services/insuranceEnrichmentService.js`
- `backend/services/carrierImportService.js`

## Executive Summary

- No FMCSA `webKey` is exposed in the browser code reviewed for DOT Analytics or related pages.
- No frontend file currently calls `mobile.fmcsa.dot.gov` directly.
- The FMCSA `webKey` is only referenced in `backend/services/fmcsaService.js`.
- DOT Analytics currently calls your own backend routes first, which is the right security posture.
- Direct browser links to official SAFER, SMS, and Licensing/Insurance pages do not expose the `webKey`, so those links can remain browser links.
- DOT Analytics DOT lookups use the live profile route, but MC and carrier-name lookups currently go through `GET /api/carriers?...`, which resolves to `listLocalCarriers()` unless `live=true` is supplied.
- `backend/public/assets/js/carrier-profile.js` currently assigns both `saferLink` and `smsLink` to the SMS Complete Profile URL. That is a link-target bug, not a `webKey` leak.

## DOT Analytics Call Flow

1. `backend/public/dot-analytics.html` loads `backend/public/assets/js/app.js`.
2. `searchCarrier()` in `backend/public/assets/js/app.js:270` calls `API.searchCarrier()` in `backend/public/assets/js/api.js:132`.
3. `API.searchCarrier()` sends:
   - `GET /api/carriers/{dot}` for DOT-only lookups at `backend/public/assets/js/api.js:143`
   - `GET /api/carriers?mc=...` or `GET /api/carriers?name=...` at `backend/public/assets/js/api.js:144`
4. `GET /api/carriers/{dot}` reaches `getCarrierIntelligenceProfile()` through `backend/routes/carrierRoutes.js`.
5. `GET /api/carriers?...` reaches `getCarrierIndex()` in `backend/routes/carrierRoutes.js:33`, which defaults to `listLocalCarriers()` unless `live=true` is present or the base route is `/api/carrier`.

## External Endpoint Inventory

| External endpoint | Where it is called | Browser `webKey` exposure? | Move to backend proxy? | Notes |
| --- | --- | --- | --- | --- |
| `https://mobile.fmcsa.dot.gov/qc/services/carriers/{dot}?webKey=...` | `backend/services/fmcsaService.js:457`, `backend/services/fmcsaService.js:468` in `fetchQcMobileCarrier()` | No | Yes, keep server-only | This is the sensitive QCMobile call. The `webKey` is already server-only today. |
| `https://mobile.fmcsa.dot.gov/qc/services/carriers/docket-number/{mc}?webKey=...` | `backend/services/fmcsaService.js:457`, `backend/services/fmcsaService.js:468` in `fetchQcMobileCarrier()` | No | Yes, keep server-only | Same security requirement as DOT lookup. |
| `https://data.transportation.gov/resource/az4n-8mr2.json` | `backend/services/fmcsaService.js:5`, `backend/controllers/localCarrierController.js:565`, `backend/controllers/localCarrierController.js:760`, `backend/services/newVentureService.js:4`, `backend/services/insuranceEnrichmentService.js:9`, `backend/services/carrierImportService.js:8` | No | Already backend-only | Public Socrata census endpoint. Safe without `webKey`, but backend use is still preferable for consistency and caching. |
| `https://data.transportation.gov/resource/qh9u-swkp.json` | `backend/controllers/carrierIntelligenceController.js:243`, `backend/controllers/localCarrierController.js:705`, `backend/services/insuranceEnrichmentService.js:8` | No | Already backend-only | Public licensing and insurance dataset. |
| `https://ai.fmcsa.dot.gov/SMS/Search/Index.aspx` | `backend/services/fmcsaService.js` in `fetchSmsSafetyByDot()` | No | Already backend-only | HTML search POST used to locate SMS carrier pages. |
| `https://ai.fmcsa.dot.gov/SMS/Carrier/{dot}/CompleteProfile.aspx` | `backend/services/fmcsaService.js` in `fetchSmsSafetyByDot()`, `backend/public/assets/js/app.js:1561`, `backend/public/assets/js/carrier-profile.js:67`, `backend/public/assets/js/carrier-profile.js:70` | No | Mixed | Backend fetch is correct for data extraction. Browser links can stay direct because they do not use a secret. |
| `https://ai.fmcsa.dot.gov/SMS/Carrier/{dot}/Overview.aspx?FirstView=True` | `backend/controllers/carrierIntelligenceController.js:102`, `backend/public/assets/js/app.js:654` | No | No | This is only surfaced as an outbound official link. |
| `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string={dot}` | `backend/services/fmcsaService.js` in `fetchSaferSnapshotByDot()`, `backend/controllers/carrierIntelligenceController.js:99`, `backend/public/assets/js/app.js:652`, `backend/public/assets/js/app.js:1560`, `backend/public/lead-desk.html:2436`, `backend/public/carrier-profile.html:652` | No | Mixed | Backend fetch is correct for data extraction. Browser links can stay direct. |
| `https://li-public.fmcsa.dot.gov/LIVIEW/pkg_carrquery.prc_carrlist?n_dotno={dot}` | `backend/controllers/carrierIntelligenceController.js:100`, `backend/public/assets/js/app.js:653`, `backend/public/lead-desk.html:2437`, `backend/public/carrier-profile.html:653` | No | No | Outbound official link only. No secret involved. |

## Internal App Entry Points Used by DOT Analytics and Related Pages

| App endpoint | Where it is called | Upstream FMCSA-family source behind it | Browser `webKey` exposure? | Proxy recommendation |
| --- | --- | --- | --- | --- |
| `GET /api/carriers/{dot}` | `backend/public/assets/js/api.js:143`, `backend/public/lead-desk.html:1726`, `backend/public/carrier-profile.html:896` | `carrierIntelligenceController -> fmcsaService -> QCMobile/SMS/SAFER/Socrata` | No | Keep as backend route |
| `GET /api/carriers?mc=...` | `backend/public/assets/js/api.js:144` | `carrierRoutes.getCarrierIndex() -> listLocalCarriers()` by default | No | Consider switching future live MC lookups to a dedicated backend proxy route |
| `GET /api/carriers?name=...` | `backend/public/assets/js/api.js:144` | `carrierRoutes.getCarrierIndex() -> listLocalCarriers()` by default | No | Consider switching future live name lookups to a dedicated backend search route |
| `GET /api/carriers/search?query=...&limit=1` | `backend/public/carrier-profile.html:890` | `searchCarrierIntelligence()` -> live lookup helpers | No | Keep as backend route |
| `GET /api/carriers/{dot}/sms` | `backend/public/lead-desk.html:2689`, `backend/public/carrier-profile.html:897` | `getCarrierIntelligenceSafety()` -> SMS/SAFER helper logic | No | Keep as backend route |
| `GET /api/carriers/{dot}/licensing-insurance` | `backend/public/lead-desk.html:2692`, `backend/public/carrier-profile.html:898` | `getCarrierIntelligenceLicensingInsurance()` -> Socrata insurance helper logic | No | Keep as backend route |

## Security Findings

### 1. FMCSA `webKey` is not exposed in frontend code

Searches across the reviewed frontend files found no `FMCSA_WEBKEY`, `webKey`, `mobile.fmcsa.dot.gov`, or `qc/services` usage. The sensitive `webKey` only appears in:

- `backend/services/fmcsaService.js:3`
- `backend/services/fmcsaService.js:458`
- `backend/services/fmcsaService.js:468`

### 2. QCMobile should remain proxied through the backend

Any future browser feature that needs QCMobile should call a backend route and never call `mobile.fmcsa.dot.gov` directly from JavaScript. QCMobile uses the `webKey`, so it should remain server-only.

### 3. Official SAFER, SMS, and LI links do not need proxying for secrecy

The direct official links in the UI do not include secrets. They are just outbound navigation links, so they can stay as plain browser links unless you later want analytics, availability control, or HTML normalization.

## Functional Findings

### 1. DOT Analytics MC and name lookup are not using the live search route

`backend/public/assets/js/api.js:144` sends non-DOT searches to `GET /api/carriers?...`.

That route reaches `getCarrierIndex()` in `backend/routes/carrierRoutes.js:33`, which defaults to `listLocalCarriers()` instead of `searchCarrierIntelligence()` unless:

- the base route is `/api/carrier`, or
- `live=true` is present

This is not a `webKey` leak, but it does mean the current live-lookup behavior differs by search type.

### 2. Carrier profile direct-link helper is miswired

`backend/public/assets/js/carrier-profile.js:67` and `backend/public/assets/js/carrier-profile.js:70` both point to:

- `https://ai.fmcsa.dot.gov/SMS/Carrier/{dot}/CompleteProfile.aspx`

So the helper currently assigns the "safer" link to an SMS URL. This is a UI/data-link correctness issue, not a security issue.

## Recommendation

- Keep all QCMobile access behind backend routes.
- Leave direct SAFER, SMS, and licensing/insurance outbound links alone for now.
- Use a dedicated backend FMCSA proxy route for any future live carrier lookup that needs the QCMobile `webKey`.
- Revisit the DOT Analytics MC/name path later if you want those searches to guarantee live upstream data instead of the default local-carrier path.

## Implemented Backend Proxy

This audit resulted in a new authenticated backend route:

- `GET /api/fmcsa/carrier-search?dot={dot}`
- `GET /api/fmcsa/carrier-search?mc={mc}`

Implementation details:

- Route file: `backend/routes/fmcsaRoutes.js`
- Controller: `backend/controllers/fmcsaController.js`
- Service wrapper: `backend/services/fmcsaService.js`

Behavior:

- Reads `FMCSA_WEBKEY` from the backend environment only
- Never returns or exposes the `webKey`
- Returns `503` if `FMCSA_WEBKEY` is not configured
- Returns `404` if QCMobile has no matching carrier
- Requires authentication through `authRequired`
