# Contributing — Transport ERP (own-codebase-review hardening)

These rules are the Prompt 0 ground rules from the hardening plan (#62),
encoded so they survive the plan. Read them before touching money, auth,
or the schema.

## Ground rules

- Work on `own-codebase-review`; feature branches MR back into it. One
  logical concern per commit; reference the work item ("Refs #45").
- **Manual issue close**: `Closes #N` does NOT auto-close on this branch
  (non-default target). After merge, close the issue manually citing the
  merge commit + green pipeline.
- **Pipeline trigger constraint (operational)**: MR pipelines produce jobs
  ONLY when triggered by @arts.benson.create - pipelines auto-created by
  other identities fail instantly with zero jobs. Never merge on a
  zero-jobs "failure" and never treat it as a code problem.
- Verify claims against source before changing; cite file:line in commit
  bodies. Trust the issue tracker's current state over any prose plan.
- Every change ships with tests and passes: type-check, lint:check,
  build, test:unit, and (for schema/DB work) test:db + drift-check.

## KNOWN CORRECTIONS (the review had exactly two systematic errors)

1. `formatPercentage` divide-by-100 + Intl percent style is a net
   identity: percent-POINT call sites (VAT 21 -> "21%") are CORRECT. Only
   StatsCard's fraction input and one stray literal '%' were wrong (fixed
   in !17 via formatPercent vs formatPercentPoints). Do NOT "fix" correct
   call sites.
2. `src/proxy.ts` IS the running middleware (Next 16 convention, Node
   runtime). Do NOT rename to middleware.ts; do NOT add an edge-safe
   auth.config.ts split. See ADR 0006.

## Single sources of truth (extend, never fork)

| Concern | Module |
|---|---|
| Money math | `src/lib/pricing.ts` (ADR 0004) |
| Revenue recognition | `src/lib/revenue.ts` (ADR 0005) |
| RBAC matrix | `src/lib/permissions.ts` + `src/lib/rbac.ts` (ADR 0003) |
| Document numbering | `generateDocumentNumber(tx, prefix)` - allocate INSIDE the create transaction |
| Rate limiting | `src/lib/rate-limiter.ts` (Postgres; Redis is off the table) |
| Audit rows | `createAuditLog` (field-diffs + redaction registry `src/lib/audit-diff.ts`) |
| Signup authority | `src/lib/auth/signup-allowlist.ts` |
| Logging | `src/lib/logger.ts` (the ONE console seam; #42) |
| Backups | `src/lib/backup.ts` (#39) |
| Scheduled work | `src/lib/jobs/runner.ts` registry via `/api/jobs/run` (#38) |
| Theme tokens | globals.css `:root` + `@theme inline` (ADR 0007) |
| Security headers | `src/lib/security-headers.ts` (+ nonce CSP, #63) |
| Reporting time zone | UTC (ADR 0002) |

## Database / migrations

- Migrations stay idempotent: the migrate-fresh CI job re-applies raw SQL
  (IF NOT EXISTS / guarded DO blocks).
- **drift-check allowlist rule**: any new SQL-managed object Prisma cannot
  express (partial indexes, generated columns, partitions, extensions,
  trgm indexes, functions) must be added to the exact-name allowlist in
  `.gitlab-ci.yml` IN THE SAME MR, or the job fails.
- Money invariants live as CHECK constraints (#11): app validation is UX,
  Postgres is the guarantee.
- New query patterns add an EXPLAIN assertion to
  `tests/db/query-plans.test.ts` in the same MR; add indexes only when the
  plan proves them missing.

## Testing

- Jest is decided (`jest.config.ts`; `test:unit` no-DB, `test:db` against
  Postgres 16). Do NOT introduce Vitest.
- ts-jest is installed `--no-save` in CI until the locked-lockfile pass
  (#59) - do not silently change that contract; the same pass owns adding
  pino/@sentry/nextjs (logger seam) and Playwright (e2e + axe).

## Product rules

- No dead affordances: a shown control/route/setting works or is removed.
- No `as any`; typed DTOs in, typed Prisma inputs out; extract pure logic
  from 'use server' files so it is unit-testable.
- No new frameworks/state libraries/dependencies without justification;
  every abstraction needs >=2 real call sites. Scale via Postgres,
  presigned URLs, and the job runner - not new infrastructure.
