# ADR 0005: Delivery-based revenue recognition

Status: Accepted (retro-documented 2026-07-05; decision landed with #33/!29)

## Decision

Revenue is recognized when the SERVICE IS DELIVERED, not when it is
invoiced or paid: `RECOGNIZED_REVENUE_STATUSES` (src/lib/revenue.ts) =
COMPLETED and INVOICED. DRAFT/CONFIRMED/IN_PROGRESS are pipeline;
CANCELLED contributes zero (non-destructively - stored figures survive,
#28).

Every revenue surface consumes the single definition: reports SQL
(lib/reports/queries.ts), dashboard aggregates (dashboard-actions,
dashboard-helpers), client stats (client-actions). Nothing re-types the
status list.

Month bucketing for all recognized-revenue reporting is pinned to UTC -
ADR 0002 governs; both the JS window math and the SQL grouping follow it.

## Consequences

tests/unit/revenue.test.ts locks the definition;
tests/unit/report-dto.test.ts and tests/db/reports.test.ts lock the math
and SQL against it. Changing recognition policy (e.g. cash-basis) is a
ONE-file change plus a migration note here.
