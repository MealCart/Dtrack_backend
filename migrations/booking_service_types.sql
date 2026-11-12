BEGIN;

-- Delivery type is missing from jobs. Do not invent values for historical rows.
ALTER TABLE public.jobs
    ADD COLUMN IF NOT EXISTS delivery_type VARCHAR(100);

-- Already present in your database; this makes the script safe for other installs.
ALTER TABLE public.collections
    ADD COLUMN IF NOT EXISTS collection_type VARCHAR(100);

COMMIT;

SELECT table_name, column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'jobs' AND column_name = 'delivery_type')
    OR (table_name = 'collections' AND column_name = 'collection_type'))
ORDER BY table_name;
