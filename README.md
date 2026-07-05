# Transport ERP

Spanish (EU) freight-brokerage ERP: the margin between the client sale and
the supplier cost is the product. Services, clients, suppliers, loading
orders, invoicing (sales + registered purchase invoices), payments,
reports, documents.

Stack: Next.js 16 (App Router, `src/proxy.ts` middleware convention - see
ADR 0006), NextAuth v5, Prisma 6 + PostgreSQL 16, Tailwind v4, Backblaze
B2 (S3-compatible), Resend, react-hook-form + zod. Tests: Jest.

## Setup

```bash
npm ci
cp .env.example .env.local     # fill in the values below
npx prisma generate
npm run prisma:migrate         # applies migrations (dev)
npm run prisma:seed            # sample data + test users
npm run dev
```

### Required environment

| Variable | Notes |
|---|---|
| `DATABASE_URL` | postgresql:// URL, Postgres 16 |
| `AUTH_SECRET` | REQUIRED in every environment (NextAuth v5 name - v5 throws MissingSecret without it). `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` / `AUTH_URL` | app origin |

### Optional integrations (the app boots without them - features degrade, #58)

| Variable | Enables |
|---|---|
| `RESEND_API_KEY`, `EMAIL_FROM*` | outbound email (runtime config can also come from Settings -> Email, #40) |
| `B2_*` | document storage, PDF archiving, backups |
| `GOOGLE_CLIENT_ID/SECRET` | Google sign-in |
| `AUTH_ALLOWED_SIGNUP_DOMAINS/EMAILS` | signup allow-list (#23) - empty denies all NEW sign-ups |
| `ENABLE_USER_REGISTRATION` | /register page (fail closed, #35) |
| `CRON_SECRET` | the job runner `/api/jobs/run` (#38) - disabled while unset |
| `BACKUP_RESTORE_DATABASE_URL` | in-app backup restore VERIFICATION target (#39) - never the primary |
| `CSP_ENFORCE_NONCE` | flips the #63 nonce CSP from report-only to enforced |

See `.env.example` for the full annotated list.

### Seed credentials (dev/test ONLY - the prod seed is guarded)

Password for all seed users: `password123`

- `superadmin@example.com` (SUPER_ADMIN)
- `admin@example.com`, `manager@`, `accountant@`, `operator@example.com`

`prisma:seed:prod` refuses to run unless
`ALLOW_PROD_SEED=I_UNDERSTAND_THIS_DESTROYS_DATA` - the seed wipes all
data and plants known credentials.

## Scripts

- `npm run dev` / `build` / `start`
- `npm run type-check` / `lint:check` / `format:check`
- `npm run test:unit` - pure unit tests (no DB)
- `npm run test:db` - integration suite against a real Postgres
  (constraints, numbering races, query plans, retention)
- `npm run prisma:migrate` / `prisma:seed` / `prisma:studio`

## CI gates (.gitlab-ci.yml)

phase0-gate (type-check, lint, build) - test-unit - console-leak-gate
(advisory, #42) - database stage: migrate-fresh (idempotency re-apply),
drift-check (exact-name allowlist for SQL-managed objects),
test-db, backup-restore-check (dump -> restore proof, #39).

## Operations

- Health: `GET /api/health` (readiness: DB + migrations), `?probe=live`
  (liveness). Entrypoint modes: `MIGRATE_ONLY=true` one-shot migration
  job; `RUN_MIGRATIONS=false` + wait-on-readiness for multi-replica (#41/#44).
- Scheduled work: external cron -> `POST /api/jobs/run` with
  `Authorization: Bearer $CRON_SECRET` and `{"job": "email-queue" |
  "audit-maintenance" | "backup"}` (#38).
- Logging: JSON lines via `src/lib/logger.ts`; requestId correlates with
  audit rows (#21/#42).

## Documentation

- `CONTRIBUTING.md` - ground rules, single sources of truth, the two
  KNOWN CORRECTIONS, CI constraints.
- `docs/adr/` - 0001 invoice billing direction, 0002 UTC reporting,
  0003 RBAC, 0004 money/Decimal, 0005 revenue recognition, 0006 proxy.ts
  convention, 0007 theme tokens.
- Hardening plan and phase ledger: work item #62.
