# Delivery and collection service types

1. Run Mealcart_Booking_Types_PgAdmin.sql (also backend migrations/booking_service_types.sql) in pgAdmin FIRST. It adds jobs.delivery_type if absent and ensures collections.collection_type exists. Existing collection values are preserved. Historical delivery types cannot be recovered from a field that was never saved: these display Not recorded. No invented backfill is applied.
2. Deploy this customer portal backend.
3. Rebuild the customer portal frontend with npm ci and npm run build, then deploy dist. Keep your existing environment files.

Single delivery bookings now pass delivery_type through the create payload and persist it in Job.create and Job.upsert. Delivery updates support an optional delivery_type while preserving the existing value when omitted. Collection type was already stored; the list mapper now includes it. Both types are returned separately from the delivery/collection category and displayed beneath the category in the Jobs table and in the detail window.

Bulk delivery uploads accept Delivery Type or Service Type, defaulting to Home Delivery when omitted. Bulk collections retain their existing Collection Type support. Types are trimmed and limited to 100 characters. No changes to the route planner or Android app are needed. The combined warehouse/delivery scan report update is retained.

Validation: 34 targeted checks passed using mocked persistence/HTTP and rendered scan components; frontend production build and TypeScript passed; edited backend files passed syntax checks. A live database/deployed-app test was not performed.
