# Warehouse and delivery scan report

This replaces the previous database-only Scan Report update. Deploy both the customer portal backend and frontend. Keep existing environment files. Run npm ci and npm run build for the frontend and deploy dist. Restart/redeploy the portal backend using its normal start command. No new SQL or driver app update is required.

## Two independent stages
- Warehouse received: stored jobs.barcodes matched against jobs.scans.
- Driver delivery scan: mealcart_parcel_scans matched to the same job and printed label.
- Delivery completed: recorded evidence in mealcart_delivery_completions. A driver scan alone does not mean the order is completed.

Route records supply the planning date and created-at snapshot identity. Delivery evidence is joined by job ID, DO number, route ID and snapshot, with the job scheduled date matching the route date. Duplicate delivery scan events count once per label. Driver IDs and timestamps are shown in parcel details. Warehouse history retains staff details. Driver-scanned labels without a warehouse scan are explicitly flagged.

The page has compact warehouse/delivery columns, separate summary counts, and filters for missing warehouse scans, awaiting delivery scans, and driver-scanned labels missing warehouse receipt. View details for the parcel-by-parcel journey. Main CSV export contains both stage totals and exceptions. The existing missing-label preview/export remains warehouse-only and is labelled accordingly. Unsynced phone work cannot appear until uploaded.

The customer portal must connect to the same PostgreSQL database/schema as the route planner. If the driver evidence tables are absent, delivery data displays Unavailable rather than zero scans. Existing warehouse data remains usable. Other database errors remain errors.

Customer access remains restricted through jobs.user_id. Admin and staff retain operational access. No Detrack fallback is used by this report. Other legacy integration endpoints are outside this change.

Changed files from the original upload: frontend src/pages/ScanReports.tsx, src/services/scanReportService.ts, new src/components/ScanJourney.tsx; backend src/controllers/scanReportController.js, new src/controllers/scanReportStages.js.

Validation: 25 targeted checks with mocked database/HTTP responses and rendered comparison components passed; frontend TypeScript and production build passed; backend syntax passed. A live database/deployed app test was not performed.
