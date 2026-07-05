# ADR 0004: Money is Prisma.Decimal end-to-end

Status: Accepted (retro-documented 2026-07-05; decision landed Phase 3, #25)

## Decision

- Money is `Prisma.Decimal` from the database to the DTO boundary. JS
  `Number` is never used for money ARITHMETIC; `decimalToNumber` exists
  only at display/DTO exits.
- `src/lib/pricing.ts` is the ONLY module where money math lives
  (margin/markup/VAT/IRPF/totals, `round2`, `toDecimal`, `ZERO`). Extend
  it; never fork it.
- `src/lib/revenue.ts` `RECOGNIZED_REVENUE_STATUSES` is the ONLY revenue
  recognition definition (see ADR 0005). Never re-type the status list.
- The database enforces the invariants the app assumes: the #11 CHECK
  family (non-negative money, paidAmount <= totalAmount, total
  composition) - application validation is UX, Postgres is the guarantee.
- Derived money (invoice paidAmount/paymentStatus) is recomputed from
  SUM(payments) inside ONE Serializable transaction; there are never two
  independent writers of a derived money column.

## Consequences

tests/unit/pricing.test.ts + tests/db/money-constraints.test.ts and
invoice-payments.test.ts lock the policy. Aggregations happen in SQL
(Decimal-summed), not by streaming rows into JS floats (#33).
