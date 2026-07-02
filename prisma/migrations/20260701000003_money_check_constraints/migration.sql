-- Database-level money integrity (issue #11).
--
-- These CHECK constraints guarantee correct money regardless of application
-- bugs. Decimal(10,2) columns make the totals equality exact. Each constraint
-- is dropped-if-exists first so this migration is idempotent.

-- services: non-negative cost and sale amounts
ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_costAmount_nonneg_check";
ALTER TABLE "services"
  ADD CONSTRAINT "services_costAmount_nonneg_check" CHECK ("costAmount" >= 0);

ALTER TABLE "services" DROP CONSTRAINT IF EXISTS "services_saleAmount_nonneg_check";
ALTER TABLE "services"
  ADD CONSTRAINT "services_saleAmount_nonneg_check" CHECK ("saleAmount" >= 0);

-- invoices: paid amount within [0, total]
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_paidAmount_range_check";
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_paidAmount_range_check"
  CHECK ("paidAmount" >= 0 AND "paidAmount" <= "totalAmount");

-- invoices: total must equal subtotal + tax - irpf (irpf may be null)
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_total_composition_check";
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_total_composition_check"
  CHECK ("totalAmount" = "subtotal" + "taxAmount" - COALESCE("irpfAmount", 0));

-- invoices: component sign constraints (#11 sign-off, !15 round 2). Without
-- these, the composition equality could be satisfied by mutually cancelling
-- negatives (subtotal = -100, tax = -21, total = -121). Credits/corrections
-- are explicitly NOT negative invoices: Spanish invoicing law (RD 1619/2012)
-- requires facturas rectificativas - separate documents in their own
-- numbering series (see #30) - and overpayments are modelled as
-- payment/credit entries (see #31), never as paidAmount > totalAmount.
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_subtotal_nonneg_check";
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_subtotal_nonneg_check" CHECK ("subtotal" >= 0);

ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_taxAmount_nonneg_check";
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_taxAmount_nonneg_check" CHECK ("taxAmount" >= 0);

ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_irpfAmount_nonneg_check";
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_irpfAmount_nonneg_check"
  CHECK ("irpfAmount" IS NULL OR "irpfAmount" >= 0);
