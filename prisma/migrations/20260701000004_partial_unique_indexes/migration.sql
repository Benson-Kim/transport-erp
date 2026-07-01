-- Partial-unique + composite/partial indexes (issue #13; coordinate with #48).
--
-- Reusable codes are unique only among non-deleted rows so the code can be
-- reused after a soft delete. Immutable business numbers (serviceNumber,
-- invoiceNumber, paymentNumber, orderNumber) remain globally unique and are
-- not touched here.
--
-- Idempotent: drop the Prisma-managed *_key indexes if present, then create the
-- partial-unique indexes if absent.

-- clients.clientCode
DROP INDEX IF EXISTS "clients_clientCode_key";
CREATE UNIQUE INDEX IF NOT EXISTS "clients_clientCode_active_key"
  ON "clients" ("clientCode") WHERE "deletedAt" IS NULL;

-- suppliers.supplierCode
DROP INDEX IF EXISTS "suppliers_supplierCode_key";
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_supplierCode_active_key"
  ON "suppliers" ("supplierCode") WHERE "deletedAt" IS NULL;

-- companies.code
DROP INDEX IF EXISTS "companies_code_key";
CREATE UNIQUE INDEX IF NOT EXISTS "companies_code_active_key"
  ON "companies" ("code") WHERE "deletedAt" IS NULL;

-- companies.vatNumber
DROP INDEX IF EXISTS "companies_vatNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "companies_vatNumber_active_key"
  ON "companies" ("vatNumber") WHERE "deletedAt" IS NULL;

-- Composite partial index for the common live-services list query
-- (filter deletedAt IS NULL, order/filter by status + date).
CREATE INDEX IF NOT EXISTS "services_status_date_active_idx"
  ON "services" ("status", "date") WHERE "deletedAt" IS NULL;
