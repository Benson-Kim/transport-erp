# ADR 0002: Canonical reporting time zone is UTC

Status: Accepted (2026-07-05, Phase 5, #65)

## Context

Service dates are stored in `timestamp(3)` (without time zone) columns
holding UTC instants. Report month windows (`lastMonthsRange`) and the
dashboard chart month keys were computed with server-local date math
(date-fns `startOfMonth`/`subMonths`, `Date#getMonth`). CI and the current
deployment run in UTC, so the defect was latent - but any non-UTC
deployment would bucket boundary services (e.g. `2019-01-31T23:30:00Z`)
into the wrong month, in the window filter AND in the GROUP BY labels.

## Decision

All month bucketing - report ranges, SQL `date_trunc` grouping, dashboard
chart month keys - is pinned to **UTC**:

- JS boundaries use `Date.UTC` month arithmetic (`lastMonthsRange`,
  `utcMonthStart`), never local-time date-fns month helpers.
- Month labels use `Intl.DateTimeFormat` with `timeZone: 'UTC'`
  (`utcMonthKey`).
- SQL keeps `date_trunc('month', "date")` on the naive-UTC `timestamp`
  column, which is session-TZ independent. Casting to `timestamptz` is
  forbidden in report SQL: that is what would re-introduce session-TZ
  dependent bucketing.

Spanish fiscal reporting nominally follows Europe/Madrid; switching the
canonical reporting zone to Europe/Madrid would be a single deliberate
change at these three seams, applied to BOTH sides of the boundary at
once. Until then, UTC is the one canonical zone.

## Consequences

- Month totals are deterministic across deployments and TZ configs.
- `tests/unit/report-range-utc.test.ts` locks the boundary behaviour.
- Deployment env `TZ` must not influence report output; a tests/db
  month-boundary fixture run under a non-UTC TZ belongs in the #59
  gap-fill pass.
