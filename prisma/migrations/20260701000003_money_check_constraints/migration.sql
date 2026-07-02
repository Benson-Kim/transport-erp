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
