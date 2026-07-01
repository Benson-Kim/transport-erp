-- Normalize the one queried address key to an indexable column (issue #14).
--
-- getClients() filters on billingAddress->>'country'. A JSON path predicate is
-- not indexable. Add a STORED generated column derived from the JSON so the
-- value is always consistent with billingAddress (no dual-write), and index it.
-- The remaining address fields stay in the billingAddress JSON.
--
-- Idempotent: guarded with IF NOT EXISTS.

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "billingCountry" TEXT
  GENERATED ALWAYS AS ("billingAddress" ->> 'country') STORED;

CREATE INDEX IF NOT EXISTS "clients_billingCountry_idx"
  ON "clients" ("billingCountry");
