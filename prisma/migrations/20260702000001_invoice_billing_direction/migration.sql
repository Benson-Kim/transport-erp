-- #30 (ADR 0001): invoice billing direction - sales + purchase on one model.
-- Idempotent (matches this repo's migration convention, cf. 20260701000007).

-- 1. Direction enum.
DO $$ BEGIN
  CREATE TYPE "InvoiceDirection" AS ENUM ('SALES', 'PURCHASE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. New columns. Every pre-ADR row is supplier-linked, so backfill
--    PURCHASE, then require the column: callers must state the direction
--    explicitly (no column default on purpose).
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "direction" "InvoiceDirection";
UPDATE "invoices" SET "direction" = 'PURCHASE' WHERE "direction" IS NULL;
ALTER TABLE "invoices" ALTER COLUMN "direction" SET NOT NULL;

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "externalReference" TEXT;

-- 3. supplierId becomes optional (SALES invoices have no supplier). The
--    existing FK action (RESTRICT) is untouched - dropping NOT NULL does
--    not alter the constraint.
ALTER TABLE "invoices" ALTER COLUMN "supplierId" DROP NOT NULL;

-- 4. Client FK. RESTRICT: financial documents never silently lose their
--    party (matches the supplier FK behaviour).
DO $$ BEGIN
  ALTER TABLE "invoices"
    ADD CONSTRAINT "invoices_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "clients"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Indexes for direction-filtered AR/AP views and the client join.
CREATE INDEX IF NOT EXISTS "invoices_clientId_idx" ON "invoices"("clientId");
CREATE INDEX IF NOT EXISTS "invoices_direction_idx" ON "invoices"("direction");

-- 6. XOR party constraint (ADR 0001; #11 CHECK family): exactly the party
--    matching the direction - never both, never neither.
DO $$ BEGIN
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_party_matches_direction" CHECK (
    ("direction" = 'SALES'    AND "clientId" IS NOT NULL AND "supplierId" IS NULL) OR
    ("direction" = 'PURCHASE' AND "supplierId" IS NOT NULL AND "clientId" IS NULL)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
