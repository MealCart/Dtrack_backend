# Mealcart database-only backend

Deploy this complete backend, replacing the older source files. Keep your current database, authentication, email and upload environment settings. No schema migration is required for this update. Node.js 20 or later is required for native fetch.

- All booking reads, edits, cancellation, search, warehouse scans, bulk booking, calendar and report operations use PostgreSQL.
- Existing legacy job-list URL names remain as database compatibility aliases so older portal builds continue to work. There are no external API credentials or provider request URLs in those handlers.
- `/detrack-sync/preview` and `/detrack-sync/commit`, legacy group lookup and external vehicle lookup return HTTP 410. Nothing is imported. Use Users/customer selection and the Mealcart route planner for drivers.
- A missing warehouse job returns HTTP 404. It is never imported and no scans or labels are invented for it.
- Warehouse scan writes lock the booking row and retain existing scan history. Labels use stored barcode values; label generation initializes barcodes only if none exist. Combined labels read booking metadata from the database.
- Customer reads and changes use `user_id` ownership. Administrative access is retained. Legacy database columns such as `detrack_id` and historic source values are retained for compatibility; they do not cause network calls.

## Driver evidence and POD

`GET /api/generate-pod/:doNumber` and `/api/download-pod/:doNumber` generate a PDF from the owned `jobs` row. They require status `completed` or `delivered`. The PDF includes stored delivery information, completion timestamp and driver ID, all stored completion photos, and the signature if present.

The source columns are `jobs.completion_photos`, `completion_signature_url`, `completion_driver_id`, and `completion_recorded_at`. No driver-app changes are included. If an older completed row has no photos or signature, the PDF explicitly states that no evidence was recorded. Warehouse scanning never supplies proof of delivery.

Only the saved completion-media URLs are fetched, from the Mealcart driver backend. Redirects are rejected and each image has a size/time limit. Broken images fail the POD request rather than silently producing a report without the stored evidence. Supported images: JPEG and PNG.

Default media origin: `https://mealcart-router-backend.onrender.com`. This matches the existing driver backend; no new settings are needed when it remains there.

Optional settings if hosting changes:

```
DRIVER_MEDIA_BASE_URL=https://mealcart-router-backend.onrender.com
POD_MEDIA_ORIGINS=https://your-approved-image-host.example
```

The second setting is a comma-separated list of additional HTTPS origins. Do not include trailing paths. External Detrack hosts remain blocked even if added to this setting.

Remove obsolete `DETRACK_API_KEY`, `DETRACK_API_URL` and `DETRACK_DN_API_URL` from Render when convenient; they are no longer read by the backend. The startup and test endpoints no longer log or expose their contents.

## Deployment checks

After deployment, test as a customer and as admin: search a known delivery and collection; open details; edit/cancel a pending test booking; generate single and combined labels; scan a known barcode and a nonexistent job; generate a POD for a completed delivery with actual driver photos. Confirm another customer's records are inaccessible. Existing sync controls in an old frontend intentionally show the retired-endpoint error.

Automated checks cover database-only routing, scoping, guarded writes, missing scans, retained evidence, PDF image/signature pages, blocked media hosts and no provider fallback. Live Render credentials and a real driver-media file were not used in automated tests.

Validation commands: `npm ci`, then `npm test`. The lockfile includes the existing date-fns and date-fns-tz dependencies and matches package.json.

## Existing Zebra app compatibility

The existing installed staff app can continue using `/job-by-donumber` and `/scan-box` without any mobile rebuild. Lookup first checks the exact owned DO number, then stored printed barcode prefixes. Optional leading # characters and trailing scanner whitespace are matched safely. Ambiguous matches fail with HTTP 409, and no external lookup or import occurs. Scans are recorded using the original stored barcode value. `/job-by-barcode` remains available for future clients but is not required by the installed app.
