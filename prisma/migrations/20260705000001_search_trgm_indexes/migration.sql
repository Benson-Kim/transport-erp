-- #46: index-backed contains-search. The list/search UIs issue leading-
-- wildcard ILIKE ('%term%') over serviceNumber/driverName/vehiclePlate and
-- client/supplier names; btree indexes cannot serve those, so every
-- keystroke was a sequential scan over the largest tables. pg_trgm GIN
-- indexes make ILIKE '%term%' a bitmap index scan.
--
-- SQL-managed (Prisma cannot express extensions or gin_trgm_ops indexes):
-- the extension and these five index names are enumerated in the
-- drift-check allowlist in the same MR, per the standing rule.
--
-- Idempotent: IF NOT EXISTS guards for the migrate-fresh raw re-apply loop.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "services_serviceNumber_trgm_idx"
  ON "services" USING GIN ("serviceNumber" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "services_driverName_trgm_idx"
  ON "services" USING GIN ("driverName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "services_vehiclePlate_trgm_idx"
  ON "services" USING GIN ("vehiclePlate" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "clients_name_trgm_idx"
  ON "clients" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "suppliers_name_trgm_idx"
  ON "suppliers" USING GIN ("name" gin_trgm_ops);
