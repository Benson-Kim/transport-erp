# ADR 0001: Invoice billing direction — one model, direction discriminator

- Status: **Proposed** (ratify before any #30/#31 implementation commit)
- Date: 2026-07-02
- Work items: #30 (invoices), #31 (payments), #33 (revenue reports), #11 (money CHECKs)
- Deciders: transport-erp maintainers

## Context

The schema and the product disagree about who gets billed. Evidence (all `prisma/schema.prisma`, branch `own-codebase-review`):

1. `model Invoice` has a **required `supplierId`** and **no `clientId`** — as modelled, every invoice is a purchase invoice received from a supplier.
2. `model Client` carries `autoInvoice Boolean @default(false)` — a sales-side affordance: clients are expected to be invoiced.
3. `model Company` carries `invoicePrefix` — a prefix for invoices the brokerage ISSUES, which only makes sense for sales invoices.
4. `ServiceStatus.INVOICED` is an elevated transition gated by `services:mark_billed` (Phase 2), and the revenue reports count INVOICED services as recognized revenue — revenue comes from billing CLIENTS.
5. `model Invoice` carries `irpfRate`/`irpfAmount` and `model Supplier` carries `irpfRate` — IRPF retention (Spain) applies to invoices RECEIVED from suppliers (the payer withholds), i.e. the purchase side.
6. `InvoiceItem.serviceId` optionally links line items to services — needed on BOTH sides: a service has a sale (client) and a cost (supplier).

A freight brokerage bills clients for the sale amount (sales invoices, the revenue) and is billed by suppliers for the cost amount (purchase invoices). The margin between the two is the product. The current model can only represent half of the business.

## Decision

**One `Invoice` model with a `direction` discriminator and an XOR party constraint.** Not two models.

```prisma
enum InvoiceDirection {
  SALES     // issued by us to a Client (revenue)
  PURCHASE  // received from a Supplier (cost)
}
```

Schema changes (migration sketch — apply only after this ADR is Accepted):

- Add `direction InvoiceDirection` — **backfill existing rows to `PURCHASE`** (every existing row is supplier-linked), then make it required. No default in the schema afterwards: callers must state the direction explicitly.
- Add optional `clientId String?` + relation to `Client` (plus `@@index([clientId])`).
- Make `supplierId` **optional** (currently required).
- DB CHECK (belongs with #11's money CHECKs; name `invoices_party_matches_direction`):

```sql
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_party_matches_direction" CHECK (
  ("direction" = 'SALES'    AND "clientId" IS NOT NULL AND "supplierId" IS NULL) OR
  ("direction" = 'PURCHASE' AND "supplierId" IS NOT NULL AND "clientId" IS NULL)
);
```

- Numbering: separate `DocumentCounter` scopes per direction — `INV-YYYY` (sales, issued by us; Spanish rules require a sequential issued series) and `RINV-YYYY` (purchase registration numbers). Purchase invoices additionally store the supplier's own invoice number in a new `externalReference String?` column — we REGISTER received invoices, we do not issue their numbers.
- IRPF: `irpfRate`/`irpfAmount` stay nullable and are populated on **PURCHASE** invoices only (defaulted from `Supplier.irpfRate`, overridable per invoice). Enforced in the action layer; a CHECK is not warranted because a rate of 0 is legitimate on both sides.

## Consequences

- **#31 (payments/reconciliation) builds ONE pipeline** covering both directions: `Payment` already links only to `Invoice`; direction determines cash flow sign in reports, nothing else. `paidAmount` is DERIVED from `SUM(payments)` inside one Serializable transaction (the hardened !17 transaction shape: caller-only permission facts outside, row reads + state assertions + writes + history + audit inside, invariants re-asserted in the UPDATE's WHERE). `payment.amount <= remaining balance` is enforced in the tx AND backstopped by #11's CHECK.
- **`ServiceStatus.INVOICED` means SALES-invoiced** (client billed). Purchase invoice registration never changes service status. This keeps the revenue reports (#33) and the state machine (`src/lib/service-status.ts`) coherent: INVOICED = recognized revenue.
- **`src/lib/pricing.ts` `irpfAmount()` gains its production call sites** on the purchase-invoice path (it currently has none — flagged in !17's review). If #30 lands without consuming it, delete the export.
- Sales invoice creation can be driven from services (INVOICE the sale amounts of selected COMPLETED services via `InvoiceItem.serviceId`); `Client.autoInvoice` becomes implementable instead of a dead flag.
- Queries stay simple: one table, `WHERE direction = 'SALES'` for revenue/AR views, `'PURCHASE'` for AP views; the partial-index conventions from #13 apply per direction if volume warrants.

## Alternatives considered

- **B: Two models (`SalesInvoice` / `PurchaseInvoice`).** Rejected: duplicates items/payments/numbering/audit relations and every action + page; `Payment` would need a polymorphic or doubled FK; violates the one-canonical-implementation rule for what is 90% shared shape. The two sides differ by party and by numbering semantics — one column and one constraint express both.
- **C: Status quo (supplier-only) + treat INVOICED services as the sales ledger.** Rejected: a service is not an invoice — no dueDate, no number series, no partial payments, no VAT breakdown per legal document; month-end AR would not exist.
- **D: `direction` inferred from which FK is set (no explicit column).** Rejected: implicit discriminators rot — the CHECK above is only writable because direction is explicit, and reports filter on an indexed enum instead of `IS NULL` gymnastics.

## Acceptance hooks (from the Phase 4 plan)

- ADR committed and schema reflects it (this file → Accepted → migration commit referencing #30).
- `Invoice.paidAmount == SUM(payments)` after any payment op — invariant test, both directions (#31).
- Documents/PDF (#34) and reports (#33) read `direction`, not FK-null-ness.
