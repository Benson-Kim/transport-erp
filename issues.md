## Transport ERP: Deep Code Review

I've read the schema, all server actions, the auth stack (`auth.ts`, `auth-helpers.ts`), RBAC (`permissions.ts`, `rbac.ts`), the Prisma client, DB helpers, the rate limiter, settings actions, and the route middleware. Below are concrete findings grounded in your actual code, ordered by severity. This is long because you asked for it; treat it as a backlog, not a single MR.

Before anything else: there are **compile-breaking / auth-breaking bugs in the hot path**. Those come first.

#### P0 — Bugs that break the build or auth right now

1. **`prisma.ts` never imports `PrismaClient`.** `createPrismaClient()` calls `new PrismaClient(...)` but the file only imports `withAccelerate`. This will not type-check and will crash at runtime. Everything depends on this module.

2. **`signInWithCredentials` references an undefined `result`.** In `src/actions/auth-actions.ts`, `signIn('credentials', { ... redirect: false })` is called but its return value is never assigned, then the code does `if (result?.error)`. `result` doesn't exist. This is the entire credentials login path. It "works" only because the `catch` swallows the `ReferenceError`, which means your login success/error signaling is effectively broken and relying on exception fallthrough.

3. **The Accelerate extension is unconditional but the client is generated with `--no-engine` only in one script.** `prisma:generate` uses `--no-engine` (Accelerate/Data Proxy) while `prisma:generate:prod` does not. `.$extends(withAccelerate())` is always applied. If `DATABASE_URL` is a direct Postgres URL (as your backup code assumes with `pg_dump` parsing `postgresql://`), Accelerate expectations and engine mode will mismatch across environments. Pick one connection strategy and make generate flags consistent.

4. **`auth.config.ts` is an empty file (0 bytes) — a dead stray file; delete it.** CORRECTED (verified against the stack): this project is on Next 16, where the middleware convention is `proxy.ts` and it runs on the **Node.js runtime**. The NextAuth v5 edge-safe split-config pattern is therefore NOT required here — `proxy.ts` calling the full `auth()` (Prisma, bcrypt, nodemailer) is legitimate on the Node runtime. The only defect is the stray empty file.

5. **CORRECTED — `src/proxy.ts` IS the correct middleware convention on Next 16.** Next 16 renamed `middleware.ts` to `proxy.ts` (root or `src/`), running on the Node.js runtime; a default export plus `config.matcher` is auto-run. Route protection and the `x-pathname`/`x-user-*` headers DO execute. Do NOT rename to `middleware.ts` (deprecated on 16) and do NOT add an edge-safe split. Remaining real work: add the missing public routes (`/resend-verification`, `/check-email`) to `PUBLIC_ROUTES`, and verify at boot that unauthenticated requests to protected routes redirect to `/login`.

#### P0 — Security

6. **`requirePermission` is called but its result is discarded in a way that's fine — the real gap is inconsistent enforcement.** Read-heavy functions like `getServiceWithDetails`, `getServiceActivity`, and `duplicateService` do **not** call `requireAuth`/`requirePermission` at all (compare to `getService`, which does). Any code path that reaches these leaks full service, client, supplier, and audit data with no auth check. Every exported server action must start with an auth + permission gate; today it's ad hoc.

7. **No object-level authorization (IDOR).** `getService(id)`, `updateService(id, ...)`, `deleteService(id)` check the _role-level_ permission (`services:view`) but never call `checkResourceOwnership`. You wrote `checkResourceOwnership` and `checkResourcePermission` in `rbac.ts` but **they are never used anywhere**. An OPERATOR who can `edit` services can edit _any_ service, not just assigned ones, despite your permission matrix implying ownership boundaries. This is the single biggest security gap for a multi-tenant-ish ERP.

8. **`bulkDeleteServices` ignores `deletedAt` and status.** It `updateMany` on `{ id: { in } }` with no `deletedAt: null` filter and no completed/invoiced guard, so it re-stamps already-deleted rows and can soft-delete invoiced services that `deleteService` for completed items would normally block via `edit_completed`. `bulkUpdateServices` similarly bypasses the completed-status permission check that single `updateService` enforces. Bulk paths must apply the same invariants as single-item paths.

9. **`auditPermissionCheck` writes `action: 'PERMISSION_CHECK' as any`** — that value is not in the `AuditAction` enum. If ever called it throws at the DB. Either add the enum value or remove the function.

10. **PII / financial data in audit logs, unbounded.** `createAuditLog` stores full `oldValues`/`newValues` of the entire record via `structuredClone`. For `services` that includes cost, sale, margin, internal notes, driver names. Audit logs have no retention/partitioning and `oldValues`/`newValues` are unbounded `Json`. Over time this table dominates DB size and leaks sensitive fields to anyone with `audit_logs:view`. Store field-level diffs, not whole records, and redact `internalNotes`/pricing where appropriate.

11. **Rate limiter is in-memory and per-process.** `RateLimiter` uses a `Map` in module scope. On serverless/multi-instance (Vercel, multiple containers) each instance has its own map, so 5 attempts/instance × N instances defeats the limit. Also `increment` doesn't run when the account is locked, and `check` never increments — the counting logic has an off-by-one where the _fifth_ attempt is what trips the lock only on the _next_ call. Move to Redis/Postgres-backed limiting keyed by IP+email, and lock proactively.

12. **`pg_dump`/backup shells out with unsanitized parsed DB credentials and password in env.** `executeBackup` interpolates `host`, `port`, `user`, `database` straight into an `exec` string. If any of those contain shell metacharacters (they can, via URL-encoding), that's command injection. Password is passed via `PGPASSWORD` (OK) but the command uses string interpolation instead of `execFile` with an args array. Use `execFile('pg_dump', [...])`. Also, DB backup/restore triggered from a web request is dangerous; this belongs in a cron/job runner, not a server action.

13. **Password reset & verification tokens are stored as plaintext, single-use but not hashed.** `generateToken` returns a hex string stored raw in `verification_tokens`. Anyone with read access to that table (or a leaked backup) can reset any password. Hash tokens at rest (store SHA-256, compare hashes). Also `TOKEN_PREFIX.PASSWORD_RESET = '[REDACTED]'` — that looks like a secret-scanner false-positive replacement got committed into the actual source. The prefix constant is corrupted; `generatePasswordResetToken` builds identifiers with `[REDACTED]` as the literal prefix. Confirm this string is intentional (it almost certainly is a bug from a redaction tool).

14. **OAuth users default to `VIEWER` and are auto-created.** Google sign-in creates any Google account as a VIEWER. Combined with the possibly-inactive middleware, anyone with a Google account can create a session. Gate OAuth to an allow-list of domains/invited emails for an internal ERP.

#### P1 — Data model & financial integrity

15. **Money invariants live only in application code, not the database.** The schema has zero `CHECK` constraints. There is nothing preventing negative `costAmount`, `saleAmount`, `paidAmount > totalAmount`, or `margin` inconsistent with `saleAmount - costAmount`. In `updateService` the margin math runs _outside a transaction_ and is recomputed in JS with floating point (`saleAmount * (saleVatRate/100)`) then rounded — Decimal precision is lost the moment you do `Number(...)`. For an ERP, do money math in `Prisma.Decimal` (or SQL) and add DB `CHECK` constraints: `costAmount >= 0`, `saleAmount >= 0`, `paidAmount >= 0 AND paidAmount <= totalAmount`, `totalAmount = subtotal + taxAmount - COALESCE(irpfAmount,0)`.

16. **Invoice/payment domain is modeled but has no server actions.** There is no `invoice-actions.ts` or `payment-actions.ts`. `Invoice.paidAmount`/`paymentStatus` can drift from the sum of `Payment.amount` with nothing keeping them consistent. When you build it: recompute `paidAmount` from payments inside a `Serializable` transaction, and derive `paymentStatus`. Never let two writers set `paidAmount` independently.

17. **`Invoice.supplierId` but no `clientId`.** An invoice links to a `Supplier` and to `InvoiceItem`→`Service`, but a customer invoice in a transport brokerage is billed _to a client_. Right now you invoice suppliers only, yet services have both a client (sale side) and supplier (cost side). This looks like a domain modeling gap: you likely need both purchase invoices (from suppliers) and sales invoices (to clients), or at least a `type` discriminator. Clarify the billing direction before it calcifies.

18. **Service-number generation races and reuses deleted numbers.** `createService` uses `prisma.service.count()` then `count + 1`. Two concurrent creates get the same number; a soft-deleted service still counts, but if you ever hard-delete you get collisions. Your own `generateUniqueIdentifier` helper (which reads the max existing number) is better but _also_ races. The correct fix is a Postgres sequence per prefix/year, or a `SELECT ... FOR UPDATE` on a counters table inside the create transaction. The `@unique` on `serviceNumber` will throw P2002 under load today.

19. **`updateService` doesn't write `ServiceStatusHistory`.** You have a `ServiceStatusHistory` model and a `statusHistory` relation, but status transitions in `updateService`/`markServiceComplete`/`archiveService` never insert history rows — they only write audit logs. The status-history table is dead. Either populate it (inside the same transaction as the status change) or drop it.

20. **No status-transition state machine.** `updateService` will happily move `CANCELLED` → `IN_PROGRESS` or `INVOICED` → `DRAFT`. Define allowed transitions and reject illegal ones. This is where things "break at midnight."

21. **Soft-delete + unique columns collide.** `clientCode`, `supplierCode`, `serviceNumber`, `invoiceNumber`, `vatNumber` are globally `@unique`, but you soft-delete. You can never re-create a client with a code whose predecessor was soft-deleted. For codes that should be reusable use a partial unique index (`WHERE deleted_at IS NULL`); for immutable business numbers (invoice/service) keep the global unique. Decide per field.

22. **`Json` fields you query/report on should be normalized.** `Client.billingAddress`/`shippingAddress` are `Json`. Any report that filters by city/country/postal code can't use an index and can't be constrained. Since Spain-specific VAT/IRPF logic exists, address country matters for tax. Promote address to columns (or a shared `Address` table) as you correctly suspected. Keep `metadata` as `Json`.

23. **Missing composite indexes for real query patterns.** `getServices` filters/sorts on `clientId`, `supplierId`, `status`, `date`, plus joins to `client.name`. You have single-column indexes and `[date, status]`, but common filters like `(clientId, date)`, `(supplierId, date)`, `(status, date)` and the `deletedAt` partial pattern aren't covered. Also every list query filters `deletedAt: null` but there's no partial index `WHERE deleted_at IS NULL`. Add those; measure with `EXPLAIN`.

24. **`getServices` search does 4-way `contains` `insensitive` (`ILIKE %term%`) across joined tables.** Leading-wildcard ILIKE can't use a btree index and the client-name search forces a join scan. At a few thousand services this table-scans. Use Postgres `pg_trgm` GIN indexes or full-text search (`tsvector`) for `serviceNumber`, `driverName`, `vehiclePlate`, and client name.

#### P1 — Correctness & consistency in actions

25. **Mutations are not transactional.** `createService`/`updateService` do: compute → `prisma.service.create/update` → `createAuditLog` → (should) status history. These are separate awaits. If the audit insert fails, the service change is already committed → silent audit gaps. Wrap each mutation in `withTransaction` (you already wrote it) and pass `tx` to `createAuditLog`. Right now `createAuditLog` always uses the global `prisma`, so it can't join a transaction even if you wanted it to — refactor it to accept an optional `tx`.

26. **`withTransaction` uses `Serializable` for everything.** That's the safest but will cause serialization failures under concurrency with no retry logic. Add retry-on-40001 (serialization failure) with backoff, and reserve `Serializable` for money-critical paths; default others to `ReadCommitted`.

27. **`Object.fromEntries(Object.entries(saveData).filter(...)) as any` is a landmine.** Both create and update spread arbitrary validated-but-untyped fields into Prisma with `as any`. This bypasses Prisma's type safety entirely — a renamed schema field or an extra form field silently writes or throws at runtime. Replace with explicit field mapping (a typed DTO → typed Prisma input). This is the root cause that makes the "replace `any`" suggestion urgent, not cosmetic.

28. **`getService` returns `saleAmount: Number(service.saleAmount || 0)` but the field is non-nullable Decimal.** Minor, but the `|| 0` fallbacks across the file hint the author was unsure of nullability. Align the code with the schema's non-null Decimals and stop coercing money through JS `Number` (precision loss beyond 2 decimals, and >15 significant digits breaks).

29. **`generateLoadingOrder`, `sendServiceEmail`, `generateBulkLoadingOrders` are stubs that still write audit logs / documents.** `generateLoadingOrder` inserts a `Document` row pointing at a nonexistent PDF path with `fileSize: 0`, and logs `GENERATE_DOCUMENT`. So the UI will show documents that don't exist. Either implement or make them no-op with a clear "not implemented" error — don't create phantom records.

30. **`revalidatePath('/services')` but your routes live under `(dashboard)`.** Confirm the revalidation paths match the actual URL segments. Route groups `(dashboard)` don't appear in the URL, so `/services` is likely correct — but `/services/${id}` detail revalidation and the reports pages (`/reports/margins`, `/reports/revenue`) are never revalidated after service mutations, so margin reports go stale.

#### P2 — Operability, reliability, scalability

31. **No health/readiness endpoint wired up.** You have `checkDatabaseHealth()` in db-helpers but no `/api/health` route using it. Add liveness (process up) and readiness (DB reachable, migrations applied) endpoints for your container orchestrator; `docker-entrypoint.sh` should wait on readiness.

32. **No structured logging or error tracking.** Everything is `console.error`/`console.warn`. In production you can't correlate a failed mutation with a user/request. You already generate `requestId` in the AuditLog schema but never populate it. Add a request-scoped logger (pino) + Sentry, and thread `requestId` through actions and audit logs.

33. **`EmailQueue` model exists but nothing consumes it.** Emails are sent inline in the request path (`emailService.sendTemplate` during login/register/reset). A slow SMTP/SES call blocks the auth response, and a failure throws in the login flow (verification email failure would block an otherwise valid "please verify" message). Move sends to the queue + a worker; the schema is already there and unused.

34. **Prisma singleton skips `globalForPrisma` in production**, so in dev you reuse the client (good) but in a long-lived prod server every module import that isn't cached could create clients. More importantly `getPrismaClient()` returns `null as unknown as Client` during build — any top-level query at build time silently NPEs. Ensure no RSC does DB work at module scope.

35. **No connection pooling story.** With Accelerate you're fine, but if `DATABASE_URL` is direct Postgres in prod (backup code assumes it is) and you're on serverless, you'll exhaust connections. Decide: Accelerate/pooler everywhere, or a pooled `DATABASE_URL` + `directUrl` for migrations (the `directUrl` line is commented out in the schema).

36. **`xlsx@0.18.5` (SheetJS) has known prototype-pollution/ReDoS CVEs** and the npm version is unmaintained; use the vendor CDN build or migrate to `exceljs`. Run `npm audit` in CI. `puppeteer` full (not `puppeteer-core`) will download Chromium in your Docker build — pin and cache it, or use `@sparticuz/chromium`.

37. **`getServices` returns `{ services, total }` but no pagination metadata / max page size cap.** `pageSize` is attacker-controlled (`filters.pageSize || 50`) with no upper bound — a client can request `pageSize: 1000000` and OOM the server. Cap it (your `getPaginationParams` caps at 100; the service action doesn't use it). Centralize pagination as you suggested, and enforce the cap server-side.

#### P2 — Testing (the real gap)

Your stack is Jest (installed) — pick Jest _or_ Vitest, not both in docs. There are currently **no test files in the tree**. Highest-ROI tests, in order:

- **Pure functions first (no DB):** `hasPermission`/`canAccessRoute` in `permissions.ts` — full role×resource×action matrix; margin/VAT math extracted out of the actions into a testable `pricing.ts`; `checkPasswordStrength`; token expiry logic.
- **RBAC integration:** each server action rejects unauthenticated and under-privileged callers (viewer cannot mutate, accountant cannot touch settings, operator cannot edit completed).
- **IDOR:** once you add ownership checks, test that user A cannot read/edit user B's service.
- **Money invariants:** payment cannot exceed invoice total; status transitions rejected when illegal.
- **E2E (Playwright):** login → create client → supplier → service → (invoice → payment once built).

Extract the calculation and status-transition logic out of the `'use server'` files into plain modules so they're unit-testable without mocking Next.js.

#### P3 — Structure, UI, docs (your original list, refined)

- Rename schema header `// Enterprise Dashboard Database Schema` → Transport ERP (trivial; do it in the same MR as constraint additions).
- The two `hasPermission` implementations disagree: `auth-helpers.ts` has a _second_, simpler `hasPermission(role, action, resource)` with different rules (e.g., MANAGER gets `services:*`) than `permissions.ts`. **Delete the one in `auth-helpers.ts`** — divergent permission logic is how privilege bugs ship. Single source of truth.
- Duplicate/confusing config: `prisma.config.ts` (root), `prisma/prisma.config.ts`, and `prisma.config.ts` referenced in package — consolidate.
- `entrypoint.sh` vs `docker-entrypoint.sh` — two entrypoints; document which is used.
- README around workflows + seed credentials + sequence diagram: good, keep, but do it _after_ the domain (invoice direction, status machine) is settled so the docs don't lie.
- Reusable table/filter hooks and consistent loading/empty/error states: agreed, but P3 versus the P0/P1 correctness work.

## Transport ERP: Module-by-Module Deep Trace (v2)

I re-read the modules I'd only inferred before. Some earlier claims were confirmed, some I'm now **correcting** with evidence, and there's a batch of new findings. Each item cites the file and the specific code that proves it. Severity: **P0** breaks prod/security now, **P1** correctness/integrity, **P2** scale/ops.

### Corrections to my previous review (important, be honest)

- **Email queue is NOT unused.** `src/lib/email/service.ts` has a full `queueEmail`/`processQueue`/`processQueueJob` with retry/backoff. My earlier "the schema is there and unused" was wrong. The real problem is narrower (below): nothing _calls_ `processQueue` (no cron/worker), and there's a serialization bug.
- **`client-actions.ts` is well-built**, not part of the `as any` problem. It uses typed `Prisma.ClientCreateInput`/`UpdateInput`, real `getRequestMeta()`, VAT dedup. The `as any` issue is specific to `service-actions.ts` and `user-actions.ts`. So the fix is "bring services/users up to the client-actions standard," not a blanket rewrite.
- **`serviceFilterSchema` already caps `pageSize` at `.max(100)`** (`service-schema.ts`). But `getServices` in `service-actions.ts` takes `ServiceFiltersAPI` and does `filters.pageSize || 50` **without parsing through the schema**, so the cap isn't enforced on that path. The cap exists; it's just bypassed. Refined finding below.

---

### Module: `lib/email/service.ts`

- **P1 — Queue payload double-serialization corrupts data.** `queueEmail` stores `data: JSON.stringify(data)` into a Prisma `Json` column (`EmailQueue.data Json`). Prisma then JSON-encodes the string _again_, so the row holds a JSON string of a JSON string. On read, `processQueueJob` does `JSON.parse(job.data)` once — but `job.data` is already a parsed object (Prisma decodes `Json`), so `JSON.parse(object)` throws / coerces. The queue path is broken end-to-end. Fix: pass the object directly (`data: data as Prisma.InputJsonValue`) and drop both the `stringify` and the `parse`.
- **P1 — No consumer for `processQueue`.** There is no route, cron, or worker calling it (confirmed: no `/api/cron`, no job runner in the tree). With `queue.enabled=true`, mails enqueue and never send. With it `false`, `queueEmail` sends inline. So today all real sends are inline in the request path (login/register/reset), which blocks auth responses on Resend latency.
- **P1 — `processQueueJob` has no concurrency guard.** It flips `status: 'processing'` but two workers/instances running `processQueue` will both `findMany` the same `pending` rows before either updates them → duplicate sends. Needs `updateMany({ where: { id, status: 'pending' }, data: { status: 'processing' }})` and act only if `count === 1` (optimistic claim), or `SELECT ... FOR UPDATE SKIP LOCKED`.
- **P2 — `EmailService` is a process singleton caching `config` and the `Resend` client.** Settings changed via `settings-actions.saveEmailSettings` (DB) won't affect this instance until `reloadConfig()` is called, which nothing calls. Two sources of email config (env-based `getEmailConfig()` here vs. DB `SettingKey.EMAIL` in settings-actions) that never reconcile. Pick one source of truth.
- **Good:** environment recipient guarding (`resolveRecipients`) and `logEmail` swallowing its own failures are correct patterns. Keep.

### Module: `actions/dashboard-actions.ts`

- **P0 — `unstable_cache` wraps per-user data, cross-user leak.** `getDashboardData` is wrapped in `unstable_cache(..., ['dashboard-data'], { tags:['dashboard'] })`. The cache key is the static string `'dashboard-data'`; the `userId` arg is commented out and not part of the key. Every user shares one cached dashboard. Also **there is no auth check at all** in this action (no `requireAuth`/`requirePermission`) — it's the one action with zero gating. Add gating and include a stable per-scope key (or don't cache per-user data with `unstable_cache`).
- **P0/P1 — `refreshDashboardData` calls `revalidateTag('dashboard', 'default')`.** `revalidateTag` takes a single string argument; the second arg is invalid and this won't type-check / no-ops. Should be `revalidateTag('dashboard')`.
- **P1 — Revenue uses `status === COMPLETED` only, excludes `INVOICED`.** `currentRevenue` aggregates `status: ServiceStatus.COMPLETED`. But a completed service that gets invoiced becomes `INVOICED` (per your status flow), so it silently drops out of revenue. Client stats in `client-actions.calculateClientStats` correctly count both COMPLETED and INVOICED as completed — so the two "completed revenue" definitions disagree across modules. Pick one definition of "recognized revenue" and share it.
- **P1 — `_count: true` typed as `_count: { _all: number }`.** The `groupBy` uses `_count: true` but the cast `ServiceGroupResult` expects `_count._all`. At runtime `_count` is a number, so `s._count._all` is `undefined` → every stat reads `?? 0` and silently reports **0 active/completed services**. This is a real "dashboard always shows zero" bug hidden by the `as unknown as` cast.

### Module: `actions/user-actions.ts`

- **P0 — `getUser` uses `findUnique({ where: { id, deletedAt: null }})`.** `deletedAt` is not part of a unique index, so `findUnique` with a non-unique filter is invalid in Prisma and throws at runtime. Same anti-pattern the codebase repeats. Use `findFirst`.
- **P1 — `sortBy` field injection via `orderBy: { [sortBy]: sortOrder }`** exists in `client-actions.getClients` too, but there `sortBy` is a `z.enum([...])` (safe). In `service-actions.getServices` the `sortKeyMap` guards it (safe). Good — but confirm any other list action validates sort keys against an allowlist before trusting them.
- **P1 — `updateUser` spreads `Object.fromEntries(...) as any` into `prisma.user.update`.** Same landmine as services. The `updateUserSchema` includes a `status: 'inactive'` concept that is then mapped ad hoc (`validatedData.status === 'inactive'`) while `isActive` is the actual column — a status/isActive dual representation that can desync. Map explicitly.
- **P1 — Session invalidation is incomplete for JWT strategy.** `deleteUser`/`toggleUserStatus`/`resetUserPassword` call `prisma.session.deleteMany`, but `auth.ts` uses `session: { strategy: 'jwt' }`. **JWTs aren't stored in the `sessions` table**, so deleting rows does nothing — a deactivated user keeps a valid JWT until it expires (up to 30 days). This is a real security gap: "disable user" doesn't disable them. You need either a token version/`isActive` re-check in the `jwt`/`session` callback (query DB or a denylist), or switch to database sessions.
- **Good:** privilege-escalation guards (can't change own role, can't demote super admin unless super admin, can't self-delete) are correct and match the matrix.

### Module: `auth.ts` / `auth-helpers.ts` (re-confirmed + new)

- **P0 confirmed — duplicate divergent `hasPermission`.** `auth-helpers.ts` exports a second `hasPermission(role, action, resource)` with **different rules and reversed argument order** vs. `permissions.ts` `hasPermission(role, resource, action)`. Two different permission engines; whichever is imported changes the answer. Delete the one in `auth-helpers.ts`.
- **P0 confirmed — the JWT session never re-checks `isActive`/`role` from DB.** The `jwt` callback only reads `user` on initial sign-in; subsequent requests trust the token. Combined with the session-deletion no-op above, role changes and deactivations don't take effect until token expiry. Re-fetch critical fields in the `jwt` callback (with a short cache) or add a `tokenVersion` bumped on security events.
- **P1 — `signIn` callback for credentials returns `!!user.emailVerified`, but `authorize` already throws on unverified.** Redundant, and the OAuth branch auto-allows any account whose email exists and is active, defaulting new Google users to `VIEWER` (re-confirmed in the `Google.profile` callback). For an internal ERP, gate OAuth to an invited-email/domain allowlist.
- **P1 — `authorize` sends a verification email on every failed-because-unverified login** with no rate limit on that path (the rate limiter increments only on bad password/missing user, not on the unverified branch). An attacker who knows an unverified email can trigger unlimited verification emails. Move the send behind the rate limiter or the queue.
- **P2 confirmed — `TOKEN_PREFIX.PASSWORD_RESET = '[REDACTED]'`.** This literal is used to build and match reset-token identifiers. It "works" only because generate and verify use the same constant, but it's clearly a secret-scanner artifact committed to source and is fragile/confusing. Rename to a real prefix like `'password-reset:'` and **hash tokens at rest** (still plaintext in `verification_tokens`).

### Module: `lib/storage/service.ts`

- **P1 — `validateFile` allows files with no detectable magic bytes.** `fileTypeFromBuffer` returns `undefined` for many legitimate-but-unsniffable types (CSV, plain text) _and_ for disguised content; the code only rejects when `fileType` is truthy **and** mismatched (`if (fileType && !allowed)`). So a file whose content can't be sniffed passes MIME validation on extension alone. For an ERP accepting uploads, reject unknown magic bytes for binary types, and never trust extension for executables.
- **P1 — No auth/authorization anywhere in storage.** `storageService` methods (`getFile`, `getPresignedDownloadUrl`, `deleteFile`) take a raw `key` with no ownership check. If any action or route exposes these by key, that's a direct object-storage IDOR. Presigned download URLs also don't scope to the requesting user. Gate at the action layer and validate the key prefix belongs to the caller's tenant/record.
- **P2 — `uploadLargeFile` and `getFile` buffer whole files into memory.** `getFile` does `Buffer.concat(chunks)` of the entire object; large documents will OOM. Stream to the client instead. The commented-out retry/timeout block suggests prior reliability pain; the current `Upload` path is fine, but downloads aren't streamed.
- **Good:** `Upload` (multipart) with `leavePartsOnError:false`, `generateFileName` sanitization, and structured `StorageError` are solid.

### Module: `actions/service-actions.ts` (re-confirmed, with exact traces)

- **P0 confirmed — read actions with no gating:** `getServiceWithDetails`, `getServiceActivity`, `duplicateService` (calls `getService` which _is_ gated, but the wrapper isn't), `generateBulkLoadingOrders` (only `documents:create`, no auth). Compare to `getService`/`getServices` which call `requirePermission('services','view')`. Inconsistent by function.
- **P0 confirmed — no ownership enforcement / IDOR.** `checkResourceOwnership` and `checkResourcePermission` in `rbac.ts` are never imported anywhere (confirmed across all actions read). An OPERATOR edits any service.
- **P1 confirmed — bulk ops bypass invariants.** `bulkDeleteServices` has no `deletedAt: null` filter and no completed/invoiced guard; `bulkUpdateServices` skips the `edit_completed` check that single `updateService` enforces.
- **P1 confirmed — non-transactional mutations + Decimal precision loss.** `updateService` computes `margin`/VAT in JS floats then `Number(x.toFixed(2))`, writes service, then `createAuditLog` as separate awaits. `createAuditLog` always uses the global `prisma` (can't join a tx). `ServiceStatusHistory` is never written by any status change (confirmed — no `serviceStatusHistory.create` in the codebase).
- **P1 confirmed — `serviceNumber` race.** `createService` uses `prisma.service.count() + 1`; concurrent creates collide on the `@unique`. `generateUniqueIdentifier` (used by clients) is better but still races.

### Cross-cutting (re-confirmed against multiple files)

- **P0 — `prisma.ts` missing `import { PrismaClient }`** and `signInWithCredentials` referencing undefined `result` — both re-confirmed. These are the two that make me want you to run `npm run type-check` first; everything else is moot if the build is red.
- **RETRACTED — `src/proxy.ts` is correct on Next 16** (middleware renamed to proxy; Node runtime). Route protection executes. The empty `auth.config.ts` is a dead file to delete; no edge split is needed.
- **P1 — Two permission systems, three "completed revenue" definitions, two email-config sources.** The recurring theme is **duplicated logic that has already drifted**. Consolidate to single sources: one `hasPermission`, one `recognizedRevenue()` helper, one email config.
- **P1 — `findUnique` with non-unique `where` (`deletedAt: null` / composite non-keys)** appears in `getService` (uses `findFirst`, good), `getUser` (uses `findUnique`, bug), and `getServiceWithDetails` (uses `findFirst`, good). Audit every `findUnique` for non-unique filters.

## `src/lib/**` Deep Trace: Findings by File + Usage

### `lib/utils/export.ts` — the most dangerous utility here

This file mixes two unrelated concerns and one of them is a latent production crash.

- **P0 — `getEnv` throws on any missing var, and it's called at module-load / config-build time across the app.** `getEnv` does `if (!value) throw`. It's used in `storage/utils.ts:getB2Config()` (parsed eagerly in `b2-client.ts` constructor via `getInstance()` at import), and in `settings-actions.ts:getB2Config()`/`getEnv('DATABASE_URL')`. Because `b2Client = B2StorageClient.getInstance()` runs its constructor `this.config = getB2Config()` **at import time**, any module that transitively imports storage will crash the entire route/server if a single `B2_*` var is unset — even for requests that never touch storage. An ERP that hasn't configured Backblaze yet can't boot. Make config lazy (build on first use) and return typed errors, not throw-at-import.
- **P1 — `getEnv` empty-string trap.** `if (!value)` rejects legitimately empty values and treats `'0'`/`''` as missing. For flags this is subtly wrong. Distinguish "unset" (`value === undefined`) from "empty".
- **P1 — `getEnv` is a server-only concern living in a file that also holds browser-only `exportToCsv`/`exportToExcel`.** Those two functions call `document`, `URL.createObjectURL`, `navigator`, and dynamically import `xlsx`. Colocating `getEnv` (server) with DOM code means any server module importing `getEnv` pulls the `xlsx`/DOM code graph into the server bundle. Split into `lib/env.ts` (server) and `lib/utils/export.ts` (client). Also `'use client'` is missing on the export file despite DOM usage.
- **P1 confirmed — `xlsx` (SheetJS) via `await import('xlsx')`** is the vulnerable npm build (prototype pollution / ReDoS, unmaintained on npm). Migrate to `exceljs` or the vendor tarball. Trace: `exportToExcel` is the only consumer.
- **P2 — Duplicated B2 config.** `export.ts`/`settings-actions.ts` and `storage/utils.ts` each build a B2 config from env with **different defaults** (`us-west-004` vs `us-east-005` vs `us-west-000` commented) and different validation (settings uses a hand-rolled `validateB2Config`; storage uses `b2ConfigSchema`). Two sources of truth for the same bucket. Consolidate on the Zod schema in `storage/schema.ts`.

### `lib/utils/formatting.ts` — money formatting is wrong for an ERP

- **P1 — `formatCurrency` forces `maximumFractionDigits: 0`.** Every currency amount is rendered with **no decimals**: `€1,234.56` shows as `€1,235`. For a finance/invoicing system this is a correctness bug, not cosmetic — margins, invoice totals, and payments all display rounded. Use 2 decimals (or currency-aware `Intl` defaults).
- **P1 — `locale` is computed once at module load** from `navigator.language` (client) or hard `'en-US'` (server). This means **SSR renders one locale and the client hydrates with another** → React hydration mismatch, and server-rendered money never respects the user's `Company.currency`/`language` (which you store per client in the schema). Compute locale/currency per call from the data, not a module-level constant.
- **CORRECTED — `formatPercentage(value)` divides by 100 AND `Intl` percent style multiplies by 100 — net identity for percent-point inputs.** `formatPercentage(18.5)` renders `18.5%`; `formatPercentage(21)` renders `21%`. Percent-point call sites across the app are CORRECT and must not be "fixed". The only genuinely wrong call sites are (a) FRACTION inputs (`completedServices / totalServices` in StatsCard → renders `0.6%` instead of `60%`) and (b) `ClientDetail`'s stray literal `%` appended after the helper (`18.5%%`). The fraction-vs-points ambiguity in the API is still worth a typed split, but current outputs are right everywhere except those two.

### `lib/utils/number-format.ts` — a whole feature that isn't wired up

- **P1 — Configurable document numbering exists but is ignored by the code that creates numbers.** This file (`validateNumberFormat`, `generateNumberPreview`, tokens `NNNNN`/`YYYY`) backs the `SettingKey.NUMBER_SEQUENCES` setting saved by `settings-actions.updateNumberSequences`. But `service-actions.createService` hardcodes `SRV-${year}-${count+1}` and `client-actions` uses `generateUniqueIdentifier('CLI', ...)` with a fixed `PREFIX-YEAR-NNNNN`. So the admin can configure a format that has **zero effect**. Either wire generation through the configured format or remove the setting UI. Right now it's a lie to the user.
- **P2 — `generateNumberPreview` builds `new RegExp(token, 'g')` from tokens and `replaceAll(regExp, ...)`.** Tokens are constants so it's safe today, but `replaceAll(new RegExp(...))` per-iteration re-scans and the ordering relies on array order rather than longest-match; `YY` inside `YYYY` is handled by ordering, which is fragile. A single tokenizer pass is safer.

### `lib/utils/dashboard-helpers.ts` — reinforces the dashboard bugs

- **P1 — "Last 6 months" buckets are built with `subDays(now, i*30)`.** 30-day steps don't align to calendar months; near month boundaries you get duplicate or missing month keys, so a service can land in a bucket that was never initialized (silently dropped) or two "months" collapse. Use `subMonths` + `startOfMonth` (you already import `startOfMonth`). This directly corrupts the dashboard charts.
- **P1 — Three different "revenue-eligible status" definitions, now confirmed in one repo:**
  - `dashboard-actions.ts` aggregate: `COMPLETED` only.
  - `dashboard-helpers.aggregateRevenueByMonth`: `COMPLETED || INVOICED || ARCHIVED`.
  - `client-actions.calculateClientStats`: `COMPLETED || INVOICED` counts as completed.
    The KPI cards and the revenue chart on the **same dashboard page** will disagree. Extract one `RECOGNIZED_REVENUE_STATUSES` constant and one helper; this is the clearest "collect small things" win.
- **P2 — `saleAmount?: any` / `margin: any`.** Decimal values flow through as `any` then `Number(x)`. Same precision loss as the actions. Type these as `Prisma.Decimal` and sum with a Decimal-safe reducer.

### `lib/table-helpers.ts` — client-side table ops that fight the server

- **P1 — This entire module does in-memory sort/filter/paginate/aggregate, but the server actions already paginate at the DB.** If components use `paginate()`/`filterBySearch()` on a page of 50 rows, users see "filtered" results that only cover the current page, not the dataset. This is a classic ERP bug: "search shows nothing" because it searches the 50 loaded rows. Decide: server-side (preferred for scale) or client-side, not both. Trace which tables import these before deleting.
- **P1 — `sortData`/`multiSort` compare with `aValue < bValue` on `unknown`.** For Decimal-as-string ("1000" vs "9") and dates-as-strings this is lexicographic, so money and dates sort wrong. Needs type-aware comparators.
- **P2 — `aggregate('sum'/'avg')` uses `Number(item[field] || 0)`** — again Decimal→float. Fine for display totals, wrong for anything authoritative.

### `lib/toast.ts` — API mismatch that will surface at runtime

- **P1 — `toast.success(title, description?)` but callers pass a single message.** In `export.ts`, calls are `toast.success('Exported N rows to CSV')`, `toast.warning('No data to export')`, `toast.error('Failed to export CSV file')` — single-arg, which is fine. But confirm the toast **renderer** consumes `variant`/`description`; the store looks correct. Lower risk than I initially weighted. Keep, but add a typed `message` alias to avoid title/description confusion.
- **P2 — `crypto.randomUUID()` in a Zustand store used during SSR.** If a toast is ever created server-side, `crypto.randomUUID` needs the Web Crypto global; fine in modern Node/Edge but worth guarding.

### `lib/storage/b2-client.ts` + `service.ts` + `utils.ts` + `constants.ts` + `schema.ts`

- **P0 confirmed — eager singleton construction crashes boot.** `export const b2Client = B2StorageClient.getInstance()` → constructor → `getB2Config()` → `getEnv('B2_APPLICATION_KEY_ID')` (throws if unset). Any import chain reaching storage kills the process. `initialize()` is lazy, but the **config parse is not**. Make the constructor store nothing and defer `getB2Config()` into `initialize()`/`getClient()`.
- **P1 — `testConnection()` is commented out in `initialize()`.** So `initialized = true` is set even if credentials are invalid; the first real `getFile`/upload fails deep in a request instead of at a health check. Re-enable a cheap readiness probe (the `ListObjectsV2 MaxKeys:1` you already wrote) behind the health endpoint, not on every init.
- **P1 confirmed — `validateFile` MIME bypass.** `if (fileType && !restrictions.mimeTypes.includes(fileType.mime))` only rejects when sniffing succeeds. Unsniffable or `undefined` content passes on extension alone. For `documents`/`spreadsheets` this lets a mislabeled file through. Also `constants.ts` `spreadsheets` allows `text/csv` where `fileTypeFromBuffer` returns `undefined` for CSV → always passes without content check. Require a positive magic-byte match for binary types; allow a text-type allowlist explicitly.
- **P1 — No authorization anywhere in storage; `getPresignedDownloadUrl(key)` takes a raw key.** No caller-scoping. Combined with `Document.filePath` being a stored key, if any action returns a presigned URL by key without ownership check, that's object-store IDOR. `uploadUserAvatar(userId, ...)` names files `avatar-${userId}.jpg` in a **public** bucket path — predictable public URLs for every user's avatar (enumeration). Prefer random keys + signed URLs even for avatars, or accept public but non-enumerable names.
- **P1 — `getFile` buffers the whole object (`Buffer.concat`)** → OOM risk for large docs; stream instead.
- **P2 — `console.log` of config in `createClient()`** prints endpoint/bucket/flags on every client creation. Noise + minor info leak in shared logs. Remove or gate behind debug.
- **P2 — `schema.ts` default region `us-east-005` vs `utils.ts`/settings defaults differ.** Same duplication noted above; the schema default never applies because `utils.ts` passes an explicit (possibly empty) `region`. Empty string fails `z.string()`? No — `z.string()` accepts `''`, so an empty region silently ships to S3. Require non-empty or rely on the schema default (don't pass the key when unset).

### `lib/email/config.ts` — environment logic that will surprise operators

- **P1 — In `production`, `restrictions.allowedDomains: []` and `testRecipients: []` means no guardrails**, which is intended, but `sending.enabled: true` with `queue.enabled: true` while **nothing runs the queue** (no consumer of `EmailService.processQueue`, confirmed across the tree). Net effect in prod: `queueEmail` writes rows that never send, and the inline `sendTemplate` calls in auth flows bypass the queue. So prod email is half-queued, half-inline, and the queued half is dark. This is the operability landmine.
- **P1 — Config precedence conflicts with DB settings.** `getEmailConfig()` reads `RESEND_API_KEY` and forces provider = Resend implicitly (the `EmailService` only ever constructs `Resend`). But `settings-actions.testEmailConfiguration` supports `resend|sendgrid|ses|smtp` from DB (`SettingKey.EMAIL`). So the "email settings" screen lets you configure SendGrid/SES/SMTP that the **actual sender ignores** — it always uses Resend from env. Two email subsystems that don't talk. Unify: the runtime sender must read the same config the settings UI writes.
- **P2 — `resolveEnvironment()` keys off `NODE_ENV`/`APP_ENV`** while other modules key behavior off `NODE_ENV === 'production'` (prisma logging) and `NEXT_PHASE` (prisma client). No single environment abstraction. Centralize env resolution.

### `lib/utils/date-formats.ts` — solid, with one caveat

- **Good.** `toDate` guards invalid dates; locale-aware `date-fns` usage is correct. This is the model the rest of the lib should follow.
- **P2 — `locales: Record<string, any>`** loses type safety and only wires `en/fr/es`; `Client.language` defaults to `es` and can be other codes → silent fallback to `enUS`. Fine, but log/track unmapped languages so you know when to add one.

---

### Cross-lib themes (the "midnight" patterns)

1. **Eager, throwing config at import time** (`getEnv` + `b2Client` singleton) is the highest-severity systemic issue in `lib/`: a single unset env var takes down unrelated routes at boot. Everything config-related should be lazy and return typed results.
2. **Decimal→`Number` everywhere** (`dashboard-helpers`, `table-helpers`, `formatting`, both actions). Money loses precision the moment it enters JS math. Introduce a `Money`/Decimal helper and forbid `Number(decimal)` via lint.
3. **Duplicated-but-divergent logic**: B2 config (×3), revenue-status definition (×3), email config (env vs DB), permission engine (×2, from v2). Each pair has already drifted. Consolidation is the single highest-leverage refactor.
4. **Configurable features that aren't wired**: number-sequences format, multi-provider email, `ServiceStatusHistory`. The UI implies capabilities the backend ignores — worse than missing features because users trust them.
5. **Server/client boundary bleed**: `export.ts` colocates `getEnv` (server) with DOM export (client); `formatting.ts` reads `navigator` at module scope → hydration mismatch.

---

Reading the remaining `lib` files to close out the library trace.

This is the decisive discovery: **there are two entirely separate `EmailService` classes**, and it changes several earlier conclusions. Let me read the two schema files that back them to nail down the divergence, then I'll give the final lib report.

That confirms the full picture. `design-tokens.ts` is a clean typed constant file (low risk, no need to read all 322 lines). The email discovery is the headline. Here is the final `lib/` report closing out the unread files.

## `src/lib/**`: Final Trace (unread files closed)

The big one: **there are two completely separate, conflicting email subsystems in the codebase.** This reframes several earlier v2/v3 findings.

### Two `EmailService` classes coexist (P0 — architectural)

- **`lib/email/service.ts`** — class `EmailService` (singleton via `getInstance()`), Resend-only, DB-backed queue (`prisma.emailQueue`), React-Email rendering, env-aware `getEmailConfig()` from `config.ts`. This is the one `index.ts` exports as `emailService` and that `auth.ts`/`auth-actions.ts` actually import.
- **`lib/email/email.ts`** — a **second** class also named `EmailService`, instantiated at module load as `export const emailService = new EmailService()`, **nodemailer/SMTP-based**, with its own in-memory queue (`this.emailQueue: EmailOptions[]`), its own `loadConfig()` reading a _different_ env var set (`EMAIL_PROVIDER`, `EMAIL_SERVER_HOST`, `SENDGRID_API_KEY`, `AWS_*`), validated by a _different_ schema (`validations/mail-schema.ts`), and default from-address `noreply@enterprise-dashboard.com` (the old project name).

Consequences, traced:

- **Import ambiguity is a live bug.** `index.ts` does `export const emailService = EmailService.getInstance()` importing from `./service`. But `email.ts` _also_ exports `export const emailService`. Any code doing `import { emailService } from '@/lib/email/email'` gets the SMTP one; `from '@/lib/email'` gets the Resend one. Two singletons, two configs, two queues, two behaviors — determined solely by import path. This is exactly how "emails send in staging but not prod" mysteries happen.
- **My v2 claim "email queue is unused" and v3 "queue is dark" both need refinement:** `service.ts` has a DB queue with no consumer (still true), while `email.ts` has an in-memory queue that processes immediately but **loses everything on restart/crash** and doesn't survive multi-instance. Neither is production-grade.
- **`email.ts` is largely stubs.** `aws-ses` case creates no transporter (falls through, `this.transporter` stays null → send throws). `resend` uses `smtp.resend.com` SMTP (Resend has no SMTP like that in the way implied) — a placeholder. `logEmailEvent` just `console.log`s (no DB write), unlike `service.ts` which writes `EmailLog`. So the two subsystems even disagree on whether email events are persisted.
- **Provider config conflict is now three-way:** `email.ts` env (`EMAIL_PROVIDER`/SMTP), `service.ts`/`config.ts` env (Resend), and `settings-actions.ts` DB (`SettingKey.EMAIL`, supports resend/sendgrid/ses/smtp). Three sources, none authoritative.

**Action:** delete `lib/email/email.ts` and `validations/mail-schema.ts` entirely (the Resend `service.ts` path is the one wired into auth), then make the runtime sender read the DB `SettingKey.EMAIL` that the settings UI writes so the "Email settings" screen isn't a no-op. Grep for imports of `@/lib/email/email` and the SMTP helpers (`sendVerificationEmail`/`sendPasswordResetEmail` exported from `email.ts`) before deleting — those helper names collide with logic in `auth-helpers.ts`/`auth-actions.ts` and could be silently imported from the wrong file.

- **P1 — `email.ts` `initializeTransporter()` is `async` but called un-awaited in the constructor.** `send()` can run before the transporter is set (race), throwing "transporter not initialized" on the first email after boot. `service.ts` avoids this by lazy Resend init. Another reason to drop `email.ts`.
- **P1 — `email.ts` `loadConfig()` calls `emailConfigSchema.parse(config)`** where `smtp.auth.user/pass` default to `''`. Empty strings pass `z.string()`, so a misconfigured SMTP silently "validates" and then fails at send time with a cryptic nodemailer error. Fail fast on required-when-provider-selected fields.

### `lib/email/index.ts` (P1)

- **`import { EmailService } from "./service"` is imported but unused** (only the re-export and `getInstance()` are used) — dead import, and `getEmailConfig` is re-exported from `./config` with a missing semicolon (harmless, but the file mixes a value export of a bound method `emailService.send.bind(...)`). Binding methods at module load means `this.config` is frozen to first-load env; combined with the singleton, runtime settings changes never apply. Same "reloadConfig never called" issue from v3, now confirmed at the export layer.

### `lib/cn.ts` (P1 — real bug) vs missing `lib/utils/cn.ts`

- **`lib/utils/cn.ts` does not exist (404).** So all imports must target `@/lib/cn`. Worth a grep: if any file imports `@/lib/utils/cn`, it's a broken import. (I flagged `cn` as low-risk earlier; the 404 makes the _path_ the risk.)
- **P1 — `utils.grid()` and `variants()` generate dynamic Tailwind classes.** `classes.push(\`grid-cols-${cols.base}\`)` and `md:grid-cols-${cols.md}` build class names at runtime. **Tailwind's JIT compiler cannot see dynamically-constructed class strings**, so unless these exact classes appear literally elsewhere or are safelisted, they are purged from the production CSS and the grid silently doesn't apply. This is a classic "works in dev, breaks in prod build" bug. Same risk for any interpolated color/ring token. Fix: map to a static lookup of full class strings, or safelist.
- **P2 — `focusRing`/`utils.*` are computed by calling `cn(...)` at module load.** Fine functionally, but references `ring-primary-500`, `text-error-600`, `ring-offset-background` — confirm these tokens exist in the Tailwind theme; `design-tokens.ts` uses `primary.DEFAULT` (hex) not a `primary-500` scale, so `ring-primary-500` may not resolve. The design-token file and the Tailwind class names may be two disconnected color systems.

### `lib/design-tokens.ts` (P2)

- **Good and clean:** strictly typed via `@/types/styles`, single source, documented WCAG intent. This is the quality bar to hold the rest of `lib` to.
- **P2 — Token/Tailwind mismatch (as above).** `design-tokens` exposes semantic hex values consumed directly in `service-helpers.ts` (`SERVICE_STATUS_CONFIG` uses `designTokens.colors.status.active.bg` as inline style values), while `cn.ts`/components use Tailwind class names like `text-error-600`. You have **two parallel styling systems** — inline hex tokens and Tailwind utility classes — that can drift (e.g., a status color updated in tokens won't change a Tailwind-classed badge). Pick one: either drive Tailwind theme _from_ `design-tokens`, or use tokens everywhere via inline styles/CSS vars.

---

### Updated `lib/` scorecard (all files now read)

- **Clean / keep:** `date-formats.ts`, `design-tokens.ts`, `cn.ts` (fix the dynamic-class bug), `storage/errors.ts`, `storage/constants.ts`, `storage/schema.ts`, `permissions.ts` (the matrix itself), `service-helpers.ts`.
- **Fix in place:** `rate-limiter.ts` (in-memory/multi-instance), `db-helpers.ts` (tx-aware audit, sequence numbering), `formatting.ts` (decimals + SSR locale + percentage double-scale), `dashboard-helpers.ts` (month bucketing + revenue-status unification), `number-format.ts` (wire it up or remove), `table-helpers.ts` (server vs client duplication), `utils/export.ts` (split server/client, replace `xlsx`, lazy `getEnv`), `storage/service.ts` (MIME bypass, streaming, authz), `storage/b2-client.ts` (lazy config, re-enable readiness probe).
- **Delete (duplicates that have drifted):** `lib/email/email.ts` + `lib/validations/mail-schema.ts` (superseded by `email/service.ts` + `config.ts`); the second `hasPermission` in `auth-helpers.ts` (from v2); consolidate the ×3 B2 config builders.

### The through-line across all of `lib/`

Every serious issue in this layer is one of **four recurring patterns**:

1. **Duplicated subsystems that diverged** — email (×2 classes), permission engine (×2), B2 config (×3), revenue-status (×3), styling (tokens vs Tailwind). Highest leverage: consolidate to one of each.
2. **Config resolved eagerly at import and throwing** — `getEnv`, `b2Client` singleton, both email singletons binding config at load. Make all config lazy + typed + reconcilable with DB settings.
3. **Money/dates through `Number`/lexicographic compare** — precision and sort correctness across `formatting`, `dashboard-helpers`, `table-helpers`.
4. **Features wired in the UI/schema but dead in the engine** — number-sequence formats, multi-provider email settings, `ServiceStatusHistory`. These erode user trust the most.

The library trace is now complete: I've read every file under `src/lib/**`. Remaining unread areas of the repo are `src/components/**`, `src/app/**` (routes/pages), `src/hooks/**`, `src/types/**`, `prisma/seed.ts`, and the Docker/entrypoint scripts.

## `src/components/**` Deep Trace: Findings + Cross-Layer Connections

I read the security-critical and highest-traffic components (`PermissionGuard`, `use-permissions`, `Amount`, `DataTable`, `Table`, `Input`, `FormField`, `login-form`, `ErrorBoundary`, `PricingCalculator`, `ServicesTable`, plus both barrels). First, two **corrections** to keep myself honest, then the findings.

**Corrections to my earlier passes:** `src/lib/utils/cn.ts` **does exist** (a 404 last round was a transient fetch failure) — so it's not a broken import, it's a **duplicated file** (`@/lib/cn` and `@/lib/utils/cn` are byte-identical, including the same dynamic-Tailwind `utils.grid()` bug in both). And `Table.tsx`/`TimeInput` etc. exist; my "missing barrel exports" suspicion was wrong (the recursive tree was paginated). Both retracted.

### The money-display bugs are now confirmed end-to-end (P1, user-visible)

The `formatting.ts` defects I flagged in the lib pass are consumed directly by the components that show money to users:

- **`formatCurrency` with `maximumFractionDigits: 0` → every euro amount is rounded to whole numbers.** Traced consumers: `ServicesTable` stats bar (`Sale Total`, `Cost Total`) and the `cost`/`sale` columns; `PricingCalculator` uses its own `.toFixed(2)` locally but the **table and cards** show `€1,235` for `€1,234.56`. On an invoicing system the list and detail views disagree with the form. This is the highest-impact usability bug in the UI.
- **CORRECTED — these `formatPercentage` call sites are RIGHT** (the helper divides by 100 and `Intl` percent style multiplies back; percent-points in → correct percent out). Re-adjudicated:
  - `ServicesTable` stats: `avgMarginPercent = (totalMargin/totalSale)*100` → then `formatPercentage(avgMarginPercent)` → renders correctly (an 18% margin renders as "18%").
  - `ServicesTable` margin column: same, `marginPercent = (margin/sale)*100` then `formatPercentage(...)`.
  - `PricingCalculator` margin %: `formatPercentage(marginPercent)` where `marginPercent` prop is already a percent.
    RETRACTED: margin percentages are NOT shown 100× too large — these call sites render correctly and must not be changed. The only genuine `formatPercentage`-adjacent defects are `StatsCard`'s fraction input (`completed/total` → `0.6%`) and `ClientDetail`'s stray literal `%`.
- **`Amount` (used in the margin column) passes `value` straight to `formatCurrency`**, so margins are also whole-euro-rounded. And `Amount` uses classes `text-positive`/`text-negative`/`text-neutral-amount` and `amount`/`amount-large` — **custom utility classes** that must exist in the Tailwind layer; if they were added via `@layer` in global CSS, fine, but they're not in `design-tokens`/`cn.ts` `utils`, so verify they resolve or amounts render unstyled.

### `PricingCalculator.tsx` — the margin math is duplicated and can diverge from the server (P1)

- **Client recomputes margin/VAT independently of the server action.** `PricingCalculator` computes `costVatAmount`, `saleVatAmount`, totals, markup, ROI in the browser; `service-actions.createService`/`updateService` recompute them again server-side (the v1 finding). Two implementations of the same money math = they _will_ drift (e.g., the client's "Markup %" `(margin/costAmount)*100` has no server equivalent stored). Extract one shared pure `pricing.ts` used by both the Controller and the action.
- **P1 — Tailwind class bug in "Margin %" cell.** The `cn(...)` uses `marginPercent >= 20 && 'text-green-600...'` then a **ternary** `marginPercent >= 10 ? 'text-yellow-600...' : 'text-red-600...'`. Because both are passed to `cn`, a value ≥20 gets **both** green _and_ yellow classes (yellow wins by source order) — so a healthy 30% margin shows yellow "needs attention" coloring. Logic bug: should be `if/else if/else`, not two independent expressions.
- **P1 — `margin`/`marginPercent` are props, not derived from watched values.** The parent (`ServiceForm`) must recompute and pass them on every keystroke; if it memoizes on the wrong deps, the margin panel goes stale while the cost/sale inputs update. Verify `ServiceForm` recomputes on `watch()` changes (I haven't read `ServiceForm` yet — flagging as a connection to check).
- **P1 — Hidden legacy fields `sale`/`totalCost` bound to `saleAmount`/`costAmount` via `<input type="hidden" value={...}>` inside a `Controller`.** This double-binds: `Controller`'s `field.value` and the `value` prop fight. `serviceSchema` requires `totalCost > 0.01`, so this hidden plumbing is load-bearing for validation — fragile. The v2 finding that `service-actions` strips `totalCost/sale/kilometers/pricePerKm/extras` before saving confirms these are vestigial; remove the legacy fields from schema+form together.
- **P1 — `distance` is reused as "kilometers" for auto-calc**, but `distance` is also a real DB column (integer km). `watch('distance')` feeds `kilometers * pricePerKm`, conflating "route distance" with "billing basis." Domain smell: distance-based pricing and stored distance shouldn't be the same field.
- **P2 — `setTimeout(handleAutoCalculation, 0)` after each keystroke** to read freshly-set RHF values is a race workaround; use `form.getValues()` in the handler or compute inline.

### `ServicesTable.tsx` — links to the pagination/authorization findings (P1)

- **P1 — Stats bar aggregates only the current page.** `stats` is `services.reduce(...)` over the `services` prop, which is one paginated page (≤ `pageSize`). The bar is labeled "Total value of displayed services" (tooltip is honest) but users read "Sale Total" as the dataset total. On page 2 of 10 the numbers change confusingly. Either label it "This page" prominently or compute true totals server-side (a `sum` aggregate alongside the `count`).
- **P1 — Client-side `DataTable` search over server-paginated data (the v3 `table-helpers` concern, now confirmed in `DataTable`).** `DataTable.filteredData` filters the in-memory `data` (one page). `ServicesTable` passes `searchable` off here, but any table that enables `DataTable`'s `searchable` will "search" only the loaded page while a server `search` param also exists — two search mechanisms, inconsistent results. Standardize on server search; drop `DataTable`'s built-in filter or clearly scope it.
- **P1 — Row actions link to routes that don't exist yet.** `Generate Invoice` → `/invoices/new`, `Generate Loading Order` → `/loading-orders/new`. Per the app tree, there is **no `invoices` or `loading-orders` route group** under `(dashboard)`. These menu items 404. Connects to the v2 domain gap (no invoice actions/pages). Gate these behind a feature flag or remove until the invoice module lands.
- **P1 — `hasPermission` gates menu items client-side only.** `Delete`/`Edit`/`Generate Invoice` visibility uses `hasPermission(userRole,...)`, but the underlying `deleteService` action _does_ re-check (good). However `duplicate` has **no permission gate at all** (always shown) and routes to `/services/new?duplicate=`, which calls `duplicateService` — and per v2 that action only checks `services:create`, not ownership. So a VIEWER sees Duplicate; clicking it hits an action that will reject, producing a confusing failure instead of a hidden control. Gate `duplicate` with `services:create`.
- **P2 — `defaultSort={{ key: sortBy }}` but `DataTable` also has internal `useTableSort`.** Sorting state is driven by URL params in `ServicesTable` (`handleSort` pushes to router) _and_ tracked internally by `DataTable`'s `useTableSort`. Two sources of sort truth; the visual sort arrow (`DataTable` internal) can desync from the actual server sort (URL). Make `DataTable` fully controlled for sort when `onSort` is provided.

### `DataTable.tsx` — the shared table has real defects (P1)

- **P1 — Virtual scroll is structurally broken.** It renders virtual rows as `<Table.Row style={{ transform: translateY(...) }}>` **inside a normal `<tbody>`** without the required absolute-positioning/height-spacer wrapper that `@tanstack/react-virtual` needs. `transform` on `<tr>` elements is unreliable and there's no total-height spacer, so `virtualScroll` will render overlapping/misplaced rows. Either implement the virtualizer's container/spacer contract properly or drop `virtualScroll` until done.
- **P1 — `ErrorState` "retry" calls `globalThis.location.reload()`.** Full page reload as the only recovery is heavy and loses state; for a server-action-driven table it should call a passed `onRetry`/`router.refresh()`. Also `DataTable` defines a **local** `ErrorState` that shadows the imported `ErrorState` from `@/components/ui` (name collision, confusing).
- **P2 — `handleClear` in `Input` does `document.querySelector(\`input[value="${internalValue}"]\`)`.** This is a DOM-scraping hack that (a) breaks with duplicate values, (b) fails for special characters, (c) is SSR-unsafe. The component is already controlled internally — just synthesize the event from the ref. This is in the base `Input` used everywhere.

### `Input.tsx` — controlled/uncontrolled anti-pattern (P1, affects every form)

- **P1 — `Input` maintains its own `internalValue` state seeded from `value` but never syncs on prop change.** `const [internalValue, setInternalValue] = useState(value || '')`. When a parent (RHF `reset`, edit-form prefill, `setValue`) changes `value`, `internalValue` does **not** update (no `useEffect` on `value`). Result: editing an existing service/client won't reflect programmatic value changes, and `PricingCalculator`'s `setValue('costAmount', calculated)` won't visually update the cost input. This is a classic React controlled-input bug and it's in the base input used by **every form in the app**. It also makes `Input` simultaneously controlled (internal state) and fed a `value` prop → React's "controlled/uncontrolled" warnings. Fix: either be fully controlled (use `value` directly, no internal state) or add a sync effect.
- **P1 — `register('...')` from RHF spreads `onChange`/`ref`/`name`, but `Input` intercepts `onChange` into `handleChange` and keeps internal state.** In `login-form`, `{...register('email')}` passes RHF's onChange, but `Input`'s internal-state path can swallow updates. It "works" for login because fields start empty, but combined with the sync bug it's why prefilled edit forms misbehave. RHF-controlled inputs should not hold their own value state.

### `use-permissions.ts` + `PermissionGuard.tsx` — correct logic, one systemic caveat (P1)

- **Logic is sound** and uses the canonical `permissions.ts` `hasPermission` (not the divergent `auth-helpers` one) — good.
- **P1 (connection) — client permission checks trust `session.user.role` from `useSession`, which is the JWT that never re-checks `isActive`/role (v2 P0).** So after an admin changes a user's role or deactivates them, `PermissionGuard`/`usePermissions` keep showing the old permissions until the 30-day token refreshes. The UI gating is only as correct as the stale JWT. This ties the component layer directly to the auth P0.
- **P2 — `PermissionButton` renders a bare `<button>`** not the design-system `Button`, so it bypasses all button styling/variants and the `focusRing`. Inconsistent with the rest of the UI and an a11y regression (no disabled styling beyond the attribute).
- **P2 — `Show`/`Hide` are named as if permission-related but just take a boolean `when`.** Minor, but they live in `PermissionGuard.tsx` implying authorization semantics they don't have.

### `login-form.tsx` — depends on the broken action (P0 connection)

- **P0 (connection) — `onSubmit` reads `result.success`/`result.error` from `signInWithCredentials`, which per v1 references an undefined `result` and only "works" via the swallowing `catch`.** So the form's error branch (`setError('root', ...)`) receives whatever the action's exception-fallthrough returns, not real auth errors. Login error UX is effectively non-functional until the action bug is fixed.
- **P2 — `handleSubmit(onSubmit) as any`.** The `as any` cast hides a real type mismatch between `LoginFormData` (with optional `rememberMe`) and the resolver; worth resolving properly rather than casting.

### `Table.tsx`, `FormField.tsx`, `ErrorBoundary.tsx` — mostly fine

- **`Table.tsx` (P2):** uses classes `hover:bg-support-rowHover`, `bg-support-rowSelected`, `table-header`, `table-cell`, `table` — again **custom classes not in `design-tokens`/`cn.ts`**. If they live in a global `@layer components`, fine; if not, tables render unstyled. This "phantom class" pattern (`amount`, `input`, `input-error`, `form-label`, `text-danger`, `support-*`) recurs across `Amount`, `Input`, `FormField`, `Table` — there's clearly a global CSS layer I haven't read (`src/styles/`). **Strong recommendation: read `src/styles/` next**, because half the UI's styling depends on classes defined outside Tailwind's token system, and if any were renamed the components silently lose styling.
- **`FormField.tsx` (P2 — a11y):** `label` uses `htmlFor={id}` but the `id` is optional and almost never passed by callers (`login-form` doesn't pass one), so labels aren't associated with inputs → screen-reader and click-to-focus break. And the error uses `role="alert"` but isn't linked via `aria-describedby` to the input (the `Input` builds its own `${props.id}-error` which also needs an id). Wire `id` through `FormField`→`Input` consistently.
- **`ErrorBoundary.tsx` (P2):** solid, but `componentDidCatch` only `console.error`s — connect it to the (currently absent) error-tracking/Sentry from v2 P2, and it doesn't reset on route change (a stuck error persists across navigation). Add a `key`/reset-on-navigation or a `resetKeys` prop.

### `ui/index.ts` barrel (P2)

- **Barrel re-exports everything** (`export * from './Table'`, `./Toast`, `./Tabs`, `./Textarea`, `./Switch`, `./Tooltip`, `./TimeInput` — all confirmed to exist as files). The risk here is **bundle/circular**: `DataTable` imports `{ ... } from '@/components/ui'` (the barrel) which imports `DataTable` back → a circular import through the barrel. This can cause `undefined` component references at module init in some bundlers ("Element type is invalid"). Import siblings by direct path inside `ui/` components, reserve the barrel for outside consumers. `TimeInput` is exported twice (lines duplicate) — dead giveaway the barrel is hand-maintained and drifting.

---

### Component-layer through-line (connecting to prior passes)

Every serious component finding traces to one of these roots:

1. **The `formatting.ts` money bug** surfaces on every list, card, and calculator → whole-euro rounding (`formatCurrency`). CORRECTED: the 100× percentage claim is retracted — `formatPercentage` percent-point call sites render correctly.
2. **Duplicated logic drifting** — margin math (client `PricingCalculator` vs server action), `cn.ts` (×2 files), sort/search (DataTable internal vs URL/server), two `ErrorState`s. Same pattern as lib.
3. **Stale JWT permissions** make all client-side `PermissionGuard`/menu gating advisory only; ties to the auth P0.
4. **Controlled/uncontrolled `Input`** is a base-component defect that quietly breaks every edit form and the pricing auto-calc.
5. **Phantom CSS classes** (`amount`, `input`, `table`, `support-*`, `text-danger`) mean styling correctness depends on an unread global stylesheet — a real "works until someone renames a class" risk.
6. **UI references a non-existent invoice/loading-order module** → dead menu items that 404, matching the v2 domain gap.

### `ServiceForm.tsx` — the parent that reveals several confirmed and new defects

- **P0 (data integrity) — cancelling a service resets prices in the UI but the checkbox toggles are ephemeral, and the mode/status flow can lose data.** In edit mode, ticking "Cancelled" calls `setValue('costAmount', 0)`, `setValue('saleAmount', 0)`, `setValue('status','CANCELLED')`. If the user then unticks it, **the original cost/sale are gone** (set to 0, not restored). Combined with v1's `updateService` which also zeroes amounts when `cancelled`, a mis-click that's then reverted silently destroys the financial figures on save. Prices must not be destructively overwritten in the form; derive the zeroing server-side at the moment of actual cancellation, reversibly.
- **P1 — `getSmartDefaults()` spreads `...service` / `...sourceService` (typed `any`) directly into RHF defaults.** `service` is the full DB record including `serviceNumber`, `createdAt`, `margin`, `costVatAmount`, `deletedAt`, relations — none of which are in `serviceSchema`. RHF will hold junk fields, and on submit `serviceSchema.parse(data)` either strips or (for `z.coerce.date()` on string dates) mis-coerces. This is the client-side twin of the server's `as any` spread (v1/v2). The edit form is effectively untyped. Type `service`/`sourceService` and map explicitly to `ServiceFormData`.
- **P1 (confirmed) — the controlled/uncontrolled `Input` bug bites here.** Because base `Input` seeds `internalValue` once and never syncs on `value` change (component pass), `ServiceForm`'s many `<Input {...field} value={field.value || ''}>` fields won't reflect `reset(parsed.data)` (draft restore) or `reset(getSmartDefaults())` (Save & New) — the RHF state resets but the visible inputs keep stale text. Draft-restore and Save-&-New will look broken to users. Root cause is the base `Input`, surfaced by this form.
- **P1 — margin/percent computed here and passed to `PricingCalculator`, but with different guards than server.** `margin = saleAmount && costAmount ? saleAmount - costAmount : 0`. If `costAmount` is `0` (valid — a free/cost-absorbed leg), `saleAmount && costAmount` is falsy → margin shows `0` instead of `saleAmount`. The server (`updateService`) computes `saleAmount - costAmount` unconditionally. So the UI margin and the stored margin **disagree whenever cost is 0**. Also the "Quick Info" sidebar formats margin as `€{margin.toFixed(2)} ({marginPercent.toFixed(1)}%)` — hand-rolled, bypassing `formatCurrency`/`formatPercentage`, so this one spot shows correct decimals while the table (via `formatCurrency`) rounds and (via `formatPercentage`) multiplies ×100. Three margin renderings, three behaviors, on screens the user flips between.
- **P1 — `useEffect` recomputes `totalCost` from `distance * pricePerKm` but `pricePerKm` isn't a real form field consistently.** `distance` is a genuine DB column (route km), yet it's multiplied by `pricePerKm` to auto-fill `totalCost` (a legacy/validation-only field). Editing distance for reporting purposes silently rewrites the cost basis. Domain conflation confirmed from both `ServiceForm` and `PricingCalculator`.
- **P1 — Auto-save writes full form (incl. `internalNotes`, prices) to `localStorage` under `service-form-draft`.** `useAutoSave(formValues, { key: 'service-form-draft' })` persists client financial + internal notes in plaintext localStorage, restored on any later visit on that browser (shared workstations in a transport office are common). Also the draft is a single global key, so drafts from different services collide. Scope by user/service and consider not persisting internal notes / prices, or encrypt.
- **P1 — `Esc` shortcut is advertised but not implemented.** The sidebar shows a `Esc → Cancel` keyboard hint, but only `Ctrl/Cmd+S` is wired. Users will press Esc expecting cancel and lose nothing/everything unpredictably. Either implement or remove the hint (usability trust, same "dead affordance" pattern as the dead invoice menu items).
- **P2 — `Save & New` and `Save` both `type="submit"` in the same form; `Save & New` sets state `setSaveAndNew(true)` in `onClick` then relies on the submit handler reading it.** React state updates are async; the submit fires with the click, but `saveAndNew` is set in the same tick — there's a race where `onSubmit` may read the stale `false`. Use a ref or pass an argument to `handleSubmit`.
- **P2 — `useEffect` for `Ctrl+S` depends on `[handleSubmit]` but calls `onSubmit` (closure over `saveAndNew`, `service`, `mode`).** Stale-closure risk: the keyboard save may use outdated `saveAndNew`/`mode`.
- **P2 — Completing a service says "move it to archive," but `setValue('status','COMPLETED')` sets COMPLETED, not ARCHIVED.** The label lies about the outcome; and there's a separate `ARCHIVED` status + `archiveService` action (v1). Terminology/behavior mismatch that will confuse operators about where their service went.

### `Select.tsx` — the custom dropdown has a real correctness bug and an a11y gap

- **P1 — `renderCustom` defaults to `true`, but `PricingCalculator` passes `searchable={false}` and relies on the custom dropdown; meanwhile the value/onChange contract is a fake event.** `handleSelect` builds `{ target: { value } } as React.ChangeEvent`. Consumers do `onChange={(e) => field.onChange(e.target.value)}` — works for the happy path, but the synthetic event has no `name`, no `type`, so if any consumer spreads `{...register('x')}` onto `Select` (RHF native registration), it breaks (no `name`). Confirm no `Select` uses `{...register}`; the safe pattern is `Controller` (which `PricingCalculator` does). Flagging because it's a footgun for the next dev.
- **P1 — Custom dropdown filters options client-side by `label`.** `ClientSelector`/`SupplierSelector` presumably wrap this with the full client/supplier list. For a transport company with thousands of clients, loading **all** of them into a `Select` and filtering in-memory won't scale (and the parent `getClientsAndSuppliers` fetches all active with no limit — ties to a server finding). Needs async/paged search for the selectors. (I should read `ClientSelector` to confirm.)
- **P1 — Keyboard navigation is a stub.** `ArrowDown/ArrowUp` do `e.preventDefault()` with a comment "Implement keyboard navigation logic" — so the custom `role="listbox"` is not keyboard-operable (only Escape works). This is a WCAG 2.1 keyboard-operability failure for a primary form control used across every form. Either implement roving-tabindex navigation or fall back to the native `<select>` (`renderCustom={false}`) which is fully accessible.
- **P1 — `forwardRef<HTMLSelectElement>` but in custom mode the `ref` is never attached to any element.** RHF or focus-management relying on the ref silently no-ops in custom mode; only the native fallback attaches `ref`.
- **P2 — Selected style uses `bg-primary-50 text-primary` and `focus:border-primary`.** `primary-50` is a Tailwind scale token; `design-tokens` defines `primary.DEFAULT` (hex), not a `-50`/`-500` scale. Same phantom-class concern as before — confirm the Tailwind theme actually defines the `primary-*` scale or these are inert.
- **P2 — `value` compared with `option.value` via `===` where VAT rates are passed as `String(field.value)` and options are `'0'|'10'|'21'` strings, but currency options are plain strings.** Works, but the `costVatRate`/`saleVatRate` round-trip (`String()` out, `Number()` back in) is fragile; a `0` VAT (valid) stringifies to `'0'` which is truthy-safe here, but any place using `value &&` would drop it.

### `Checkbox.tsx` — one genuine visual bug, otherwise decent

- **P1 — Indeterminate state is broken.** The real `<input>` gets `className={cn(..., 'sr-only')}` and the visible box is a sibling `<div>` using `peer-checked:` variants. But **`indeterminate` is only an input DOM property, not an attribute/class** — the component renders a `<Minus>` icon when `indeterminate` is true, yet it never sets `inputRef.current.indeterminate = true`, and the visible `<div>` has no `peer-indeterminate` styling. Worse: when `indeterminate` is true it shows `<Minus>` but the box only turns colored via `peer-checked`, so an indeterminate-but-unchecked box shows a white minus on a white background (invisible). `DataTable`'s "select all" uses `indeterminate` → the tri-state header checkbox is visually wrong. Fix: set the DOM `.indeterminate` via ref effect and add explicit indeterminate styling.
- **P1 — `onChange`/`onCheckedChange` double-declared and RHF-incompatible.** The interface declares both `onCheckedChange` and `onChange`, and `handleChange` calls `onCheckedChange?.(checked)` then `props.onChange?.(e)`. In `login-form`, `<Checkbox {...register('rememberMe')} />` passes RHF's `onChange` via `...props`, so it works. But in `ServiceForm`, `<Checkbox checked={field.value} onCheckedChange={...} />` uses the boolean API and manually calls `field.onChange(checked)` — two different integration styles for the same component. Also `checked` is passed as a **controlled** prop while the input is otherwise uncontrolled (no `onChange` wired to RHF in the `onCheckedChange` path unless the caller remembers) → the "controlled without onChange" React warning, and the checkbox can appear stuck.
- **P2 — The visible box is a `<div>` sibling relying on `peer-checked`, but the input is `sr-only` and the `<div>` isn't inside a `<label>`.** Clicking the visible box does **not** toggle the hidden input (no `htmlFor` association wrapping the visual element; the `label` is a separate sibling with `htmlFor={props.id}` which is only set if the caller passes `id` — and `ServiceForm`/`DataTable` don't pass `id`). Net: in many places the checkbox is only clickable via the tiny label text, not the box. A11y + usability defect on every table row's select checkbox.
- **P2 — `aria-describedby` and `htmlFor` all key off `props.id`, which is almost never provided.** Same missing-`id` plumbing as `FormField`/`Input`. Screen readers won't associate label/description/error. Systemic: the design system assumes an `id` that callers don't pass.

---

### New cross-cutting patterns from this batch

1. **Destructive `setValue(0)` on cancel** (ServiceForm) + **server zeroing** (updateService) = irreversible financial data loss on a reverted mis-click. This is a genuine "midnight" data-integrity bug, not cosmetic.
2. **Margin is now computed in four places with four behaviors:** `ServiceForm` (falsy-cost guard bug), `PricingCalculator` (client), `ServicesTable` (client, ×100 percent), and the server actions. They disagree. One `pricing.ts` used everywhere is non-negotiable for a finance system.
3. **The base inputs (`Input`, `Checkbox`, `Select`) are all "half-controlled"** — internal state or DOM properties not synced with the `value`/`checked`/`indeterminate` props. This silently breaks edit-prefill, draft-restore, Save-&-New, and tri-state selection across the whole app. Fixing the three primitives fixes dozens of downstream forms.
4. **Missing `id` plumbing** breaks label association and `aria-describedby` in `FormField`, `Input`, `Checkbox`, `Select` uniformly — a repo-wide a11y regression with one shared fix (generate/forward ids via `useId`).
5. **Keyboard affordances advertised but unimplemented** (`Select` arrow keys, `ServiceForm` Esc) — dead affordances that erode trust, same class as the dead invoice/loading-order menu items.
6. **Selectors likely load full datasets** (`Select` in-memory filter + `getClientsAndSuppliers` unbounded) — a scale cliff for clients/suppliers.

## Components (batch 3): layout, settings, bulk, forms

### P0 — `UserManagement.tsx`: Rules of Hooks violation (runtime crash)

`rowActions` is a `useCallback` passed to `DataTable`, and **inside it calls `const permissions = usePermissions();`** — a hook invoked inside a callback that runs per-row during render. This violates the Rules of Hooks: React will throw "Rendered more hooks than during the previous render" / "Invalid hook call" as soon as the user table renders with a variable number of rows, or crash when the row count changes. It's masked only because the code then **ignores** the computed `actions` array entirely and renders a **second, hardcoded** `items={[...]}` list with no permission filtering. So two bugs in one function:

1. The hook call will crash under React's rules (especially in prod/StrictMode).
2. Even if it didn't, the permission-filtered `actions` (built with `permissions.can(...)`) are computed, `console.log`ged, then discarded — the actual dropdown shows Edit/Deactivate/Delete to **any** admin regardless of the granular `users:create/manage/delete` checks. The `deleteUser`/`toggleUserStatus` actions do re-check server-side (good), but the UI lies about capability. Move `usePermissions()` to component top level; render the filtered `actions`.

Also here: **`console.log(actions)`** left in production code (leaks user data to the browser console on every render).

### P1 — `UserManagement`: client-side dependency check is advisory only

`confirmDelete` blocks deletion if `deleteConfirm._count.services > 0`. But `_count.services` comes from the initial server payload and can be stale; the authoritative guard is `bulkDeleteUsers`/`deleteUser` server-side (which v2 confirmed checks `services: { some: {} }` for bulk but **`deleteUser` does not** re-check service dependencies — only super-admin/self guards). So single-delete can orphan services if the client count is stale. The real fix is server-side dependency enforcement in `deleteUser`.

### P1 — `EmailConfig.tsx` sharpens the email-config split-brain (v3)

This settings form writes `email.provider ∈ {resend,sendgrid,ses,smtp}` plus `apiKey`/`host`/`port`/`user`/`password`/`secure` into `SettingKey.EMAIL` (via `settings-actions`). But the **runtime sender** (`lib/email/service.ts`) is Resend-only and reads `getEmailConfig()` from **env**, never from this DB setting. So an operator configuring SendGrid/SES/SMTP here changes nothing about actual sending — confirmed from both ends now (UI writes DB, sender reads env). Additionally:

- **P1 — `apiKey`/`password` round-trip through the form.** On edit, the form must be pre-filled with the stored secret to avoid wiping it on save — meaning the **plaintext API key/SMTP password is sent to the browser** and sits in React state/DOM. Secrets should be write-only (show `••••`, only update if changed), never hydrated to the client. This is a real secret-exposure path.
- **P2 — SES "credentials as JSON in a single `apiKey` field."** Pasting `{"accessKeyId":...,"secretAccessKey":...}` into one text input is fragile and encourages copy-paste of long-lived AWS keys; `settings-actions.sendTestEmail` `JSON.parse`s it. Structured fields + validation would be safer.

### P1 — `RelatedDocuments.tsx`: `window.open(doc.filePath)` — broken and an IDOR vector

`handleDownload`/`handleView` do `window.open(doc.filePath, '_blank')`. But `Document.filePath` is a **B2 object key** (e.g. `documents/loading-...pdf`), not a public URL. Two problems:

1. It won't open (relative key resolves against the app origin → 404), so document view/download is **non-functional**.
2. If the bucket were public and `filePath` were a URL, this bypasses the presigned-URL/authorization layer entirely — anyone with a key opens the file. The correct path is a server action returning `storageService.getPresignedDownloadUrl(key)` scoped to the caller's permission (ties to the storage-authz P1 from the lib pass). Also `generateLoadingOrder` (v1) creates `Document` rows with `fileSize: 0` and a fake path, so this component will render phantom, unopenable documents.

### CORRECTED — `RevenueChart.tsx` and `ServicesTable` actually agree

This chart computes `avgMarginPercent = (totalMargin/totalRevenue)*100` and renders it with **`.toFixed(1)}%`** directly (correct: shows `18.5%`). `ServicesTable` renders the _same_ concept via `formatPercentage(avgMarginPercent)`, which divides by 100 and re-multiplies via `Intl` percent style — also `18.5%`. RETRACTED: both are correct; the mixed conventions (raw `.toFixed` vs helper) are worth unifying for maintainability, not correctness. (Also `RevenueChart` correctly uses `formatCurrency` for tooltips — but that still whole-euro-rounds per the `formatting.ts` bug.)

- **P2 — `RevenueChart` has its own inline CSV export** (`Blob`/`a.click()`) duplicating `exportToCsv` from `lib/utils/export`. Third CSV implementation in the repo (client-actions server CSV, `export.ts`, and here). Consolidate.

### P1 — `UserForm.tsx`: generated password shown in toast + copied, and weak generation

- **Generated password is surfaced in a toast** (`Password: ${generatedPassword}`) and auto-copied to clipboard. Toasts can be screenshotted/logged; clipboard persists. For an admin-creates-user flow, prefer an invite/set-password link over transmitting a plaintext password through UI toasts.
- **P1 — `Math.random()` for password generation.** `generatePassword` uses `Math.random()` (non-cryptographic) for what becomes a real account credential. Use `crypto.getRandomValues` (the repo already has `generateToken` in `auth-helpers` using it). Predictable RNG for initial passwords is a genuine security weakness.
- **P1 — `email` field disabled on edit but still `{...register('email')}`.** Since `updateUser` spreads validated data, and email is in the schema, a disabled field still submits its value; fine here, but the `status` ↔ `isActive` dual model (v2) shows up again: form uses `status: 'active'|'inactive'`, server maps it. Two representations, drift risk.
- **P2 — `type FormData = typeof isEditing extends true ? ...`** is a no-op conditional type (`isEditing` is a runtime boolean, `typeof isEditing` is `boolean`, so it always resolves to the false branch). Dead type; the `as any` on the resolver hides it. The create/update schema union is not actually discriminated.

### P1 — `Sidebar.tsx` + `navigation-config.ts`: navigation ignores RBAC, and links are broken

- **The sidebar renders `navigation` unfiltered.** `Sidebar` maps `navigation.map(renderItem)` directly — it **never calls `filterNavigationByPermissions`** (which exists in `navigation-config.ts` but is unused), and `NavItem`s have **no `permissions` set** anyway. So every role sees every link including **Settings** (admin-only) and **Reports**. Middleware/`canAccessRoute` will then bounce them (v2), but showing forbidden nav items that redirect-with-error is poor UX and leaks the app's structure. Wire `filterNavigationByPermissions` with real `permissions` per item, using the session role.
- **P1 — Nav points to routes that don't exist.** `documents` children link to `/documents/invoices`, `/documents/loading-orders`, `/documents/delivery-notes`; the app tree has only `(dashboard)/documents` (single page) — no invoices/loading-orders/delivery-notes routes. And `ServicesTable` row actions link to `/invoices/new` and `/loading-orders/new` (different prefix again!). Three different, non-existent document URL schemes. All 404. Ties to the missing invoice/document module (v2 domain gap).
- **P1 — `navigation-config` `permissions` filtering uses `string[]` permission strings** (e.g. `'services:view'`) but nothing populates them; meanwhile `getBreadcrumbs` starts at `/` ("Home") which isn't a real route in the `(dashboard)` group. Dead/duplicated breadcrumb logic alongside `breadcrumbs-utils.ts` (unread, likely a second breadcrumb impl).
- **P2 — Sidebar phantom/broken classes:** `nav-item`, `nav-item-active`, `icon-sm)]`, `layout-sidebar`, `bg-neutral`, `logo`, `avatar`, `badge badge-active`. Note `'ps-9)]'`, `'icon-sm)]'`, `'mt-space-1)]'` — these contain a **literal stray `)]`** (copy-paste artifacts from arbitrary-value syntax). They're invalid class names that Tailwind won't match → indentation/icon sizing silently broken. Concrete typo bugs, not just phantom classes.

### P1 — `MainLayout.tsx`: hydration and effect-dependency issues

- **`toggleSidebarCollapse` reads `isSidebarCollapsed`/`isTablet` but has `[]` deps** (empty). Stale closure: after the first render it always sees the initial `isSidebarCollapsed`, so collapse toggling on tablet flips based on stale state and writes wrong values to localStorage.
- **P1 — Media-query-driven layout renders nothing meaningful during SSR.** `useMediaQuery` returns `false` server-side, so `isDesktop/isTablet/isMobile` are all false on first paint → **no sidebar renders**, then hydrates and pops in. Layout shift + hydration mismatch on every page load. Prefer CSS-driven responsive layout (all three rendered, shown/hidden via Tailwind breakpoints) over JS media queries for structural layout.
- **P2 — Arbitrary CSS-var classes** `bg-(--neutral-50)`, `xl:ml-(--sidebar-desktop)`, `px-(--space-4)`. This is Tailwind v4 arbitrary-property syntax referencing CSS variables — valid only if those vars are defined in the stylesheet. Reinforces that `src/styles/` is load-bearing and unread.

### `Modal.tsx` — mostly strong, one real defect

- **P1 — Compound exports vs. barrel.** `Modal.Header/Body/Footer` are attached at the bottom, and the file `export`s `Modal`, `ModalHeader`, etc. `BulkActions`/`UserManagement` use `<Modal.Body>`/`<Modal.Footer>`. This works only if consumers import the `Modal` that has the statics attached. The `ui/index.ts` barrel does `export * from './Modal'`, which re-exports both `Modal` (with statics) and the standalone `ModalBody` — fine, but the `DataTable`↔barrel circular-import risk (batch 1) could leave `Modal` `undefined` at init in some bundlers, and then `Modal.Body` throws "Cannot read properties of undefined." Worth verifying import order.
- **P1 — `<dialog>` used as a styled div, not a real dialog.** It renders `<dialog aria-modal>` but never calls `.showModal()`; it's shown via conditional render + custom backdrop. The native `<dialog>` top-layer/inert benefits are lost, and a bare `<dialog>` without `open` is `display:none` by default in some UAs unless the stylesheet overrides it — another dependency on `src/styles/`. The custom `useFocusTrap` compensates, but using `<dialog>` semantics without `showModal()` is a footgun.
- **P2 — `initialFocus?: React.RefObject<HTMLElement>` + `setTimeout(...,100)` focus.** The 100ms delay is a race hack; focus-visible fl\ash and potential focus loss if the modal unmounts quickly.
- **Good:** scroll lock, escape handling, focus restore, portal, `aria-labelledby/describedby` — solid a11y foundation.

### `ServicesFilters.tsx` + `BulkActions.tsx`

- **P1 (confirmed connection) — bulk actions call `bulkUpdateServices`/`bulkDeleteServices`/`generateBulkLoadingOrders`,** which per v1/v2 bypass the completed/invoiced guards and (for delete) the `deletedAt: null` filter. `BulkActions` gates buttons by `hasPermission` client-side, but the server bulk paths don't enforce the same invariants as single-item paths. The "type DELETE to confirm" modal is good UX, but it's guarding an action that can soft-delete invoiced services.
- **P1 — `ServicesFilters` "select all" checkbox is a no-op.** `onChange` has `if (e.target.checked) { // Select all logic }` — an empty branch. The header select-all does nothing; only deselect works. And its `Checkbox` `indeterminate` relies on the broken indeterminate rendering (batch 2), so the tri-state is invisible.
- **P1 — Filters export hits `/api/services/export`.** This route isn't in the app tree I mapped (only `api/auth` exists). If missing, Export throws "Failed to fetch data" (the catch shows a toast). Another UI affordance wired to a non-existent endpoint. Also this is a **second** export path (client fetch → `exportToExcel`) alongside `client-actions.exportClients` (server CSV) — inconsistent.
- **P1 — `quickStatusGroups` "Active" filters by only `group.statuses[0]` (`'confirmed'`)** even though the group represents `['confirmed','in_progress']`. So clicking "Active" filters to _confirmed only_, silently dropping in-progress services. The `count: 0` comments show these were never wired to real counts either. Filter semantics don't match their labels.
- **P2 — Debounced search effect depends only on `[debouncedSearch]`** but calls `updateFilter` (closure over `searchParams`). Standard stale-closure risk; on rapid nav the pushed URL can be based on stale params.

---

### Corrections/confirmations this batch

- **Confirmed, not assumed:** `filterNavigationByPermissions` exists but is **unused** (Sidebar renders raw `navigation`); `NavItem.permissions` is never set. So nav is unfiltered — verified by reading both files.
- **Confirmed:** the email settings UI (`EmailConfig`) genuinely supports 4 providers and writes them to DB, while the runtime sender ignores them — both halves now read directly.
- **New severity:** the `usePermissions()`-inside-`useCallback` in `UserManagement` is the first **guaranteed runtime crash** in the component layer (React will throw), outranking the earlier display bugs.

### Updated component-layer pattern summary

1. **A Rules-of-Hooks crash** (`UserManagement`) — must-fix P0, will break the users screen.
2. **Secrets to the client** (`EmailConfig` apiKey/password hydration, `UserForm` password in toast/clipboard, `Math.random` passwords) — security P1 cluster.
3. **Dead/broken navigation & document links** across `navigation-config`, `Sidebar`, `ServicesTable`, `RelatedDocuments` — three different non-existent URL schemes; unfiltered RBAC nav.
4. **Storage access via raw `filePath`** (`RelatedDocuments`) — broken + IDOR-shaped; needs presigned-URL server action.
5. CORRECTED: RevenueChart and ServicesTable margin percentages agree. The remaining dashboard-wide display defect is `formatCurrency` whole-euro rounding.
6. **Bulk actions bypass invariants** (server-side) while the UI confidently gates them.
7. **SSR/hydration + stale-closure** issues in `MainLayout` and filters.
8. **Phantom + literally-malformed CSS classes** (`ps-9)]`, `icon-sm)]`) — `src/styles/` remains the critical unread dependency.

## Components (batch 4): ServiceDetail, SystemSettings, Backup, ServiceActions, StatsCard

### CORRECTED — `StatsCard.tsx`: exactly ONE wrong `formatPercentage` call site (the fraction); the rest are right

The helper divides by 100 and `Intl` percent style multiplies back — net identity for percent-point inputs. Re-adjudicated in `StatsCard`:

- **`formatPercentage(stats.averageMargin)`** — `averageMargin` is percent-points from the DB (`18.5`) → renders **`18.5%`**. Correct; do not change.
- **`formatPercentage(stats.completedServices / stats.totalServices)`** — a _fraction_ (`0.6`) → divided again → renders **`0.6%`** instead of `60%`. **This is the genuinely wrong call site**; pre-multiply by 100 (or add a fraction-aware helper).
- **`formatPercentage(stats.activeServicesChange)`** / `totalRevenueChange` / `averageMarginChange` — percent-points from `calculatePercentageChange` (`12.5`) → renders **`12.5%`**. Correct; do not change.

So on the **main dashboard cards**, only the completion-rate detail (fraction input) is wrong; the headline margin and every trend indicator render correctly. `MiniStats`: the tooltip `${item.change}%` and the card body `formatPercentage(Math.abs(card.change))` both render `12.5%` — they AGREE; the earlier disagreement claim is retracted, as are the wrong-output claims for `ServicesTable` and `ServiceDetail`. The helper's fraction-vs-points ambiguity is still a footgun worth a typed split (`formatPercent(fraction)` vs `formatPercentPoints(points)`), but the only wrong output here is the completion-rate fraction.

- **P1 (confirmed) — `formatCurrency` whole-euro rounding** hits every money value here (`Total Revenue`, `Avg per service`, `averageMarginAmount`). Dashboard shows rounded euros.
- **P1 — Stat card links point to query-param routes that the app doesn't honor.** `/services?status=active` — but `ServicesFilters` maps status via `STATUS_URL_MAP` where `active` isn't a key (`confirmed`/`in_progress` are); `?status=active` won't match any status filter. And `/reports/revenue`, `/reports/margins` exist as routes (per the app tree) but `/services?status=completed` will silently show all services. Dead/mismatched deep-links.

### CORRECTED — `ServiceDetail.tsx`: the VAT/margin `formatPercentage` call sites are RIGHT (other bugs below stand)

- **`formatPercentage(service.costVatRate)` and `formatPercentage(service.saleVatRate)`** — VAT rate is stored as `21.00` percent-points; the helper divides by 100 and `Intl` percent style re-multiplies → renders **`21%`**. Correct — the earlier "2,100%" claim is RETRACTED. Do not change these call sites.
- **`formatPercentage(marginPercent)`** (Badge + Margin % cell) — percent-points in → correct percent out. RETRACTED: not inflated. The "Markup %" raw `.toFixed(2)` is also right; the two conventions coexist but both output correctly.
- **P1 — Margin-% color logic bug (identical to `PricingCalculator`, batch 2):** `cn(marginPercent >= 20 && 'text-green-600', marginPercent >= 10 ? 'text-yellow-600' : 'text-red-600')`. A 30% margin gets both green and yellow → yellow wins. Confirmed the same broken ternary pattern is copy-pasted across `PricingCalculator` and `ServiceDetail`.
- **P1 — `service: any`** again; the component reads `service.client.name`, `service.costVatAmount`, etc. off an untyped object. If the server `getServiceWithDetails` shape changes, this breaks silently at runtime.
- **P2 — `formatCurrency(margin, service.saleCurrency)` for a cross-currency service** displays margin in sale currency even when cost currency differs (the `PricingCalculator` at least warns about this; the detail view doesn't). Domain correctness: margin across currencies is meaningless without conversion.
- **Good:** `internalNotes` correctly marked `print:hidden` — the one place the public/internal split is respected.

### P1 — `SystemSettings.tsx`: confirms the settings→runtime gap end-to-end, plus a wiring bug

- **The manual-backup button never shows its loading state.** `runManualBackup` sets `setSaving('backup')`, but the button disables/labels on `saving === 'backup-manual'` (`{saving === 'backup-manual' ? 'Running Backup...'}`). Since nothing ever sets `'backup-manual'`, the "Running Backup..." text never appears and the Save Changes button (keyed to `saving === 'backup'`) disables instead. Same class of bug as the test-email button (`saving` value mismatch). Copy-paste state-key drift.
- **P1 (confirmed) — `saveEmailSettings(values.email)` writes the multi-provider config to DB, but the runtime sender ignores it** (batch 3 + v3). This screen is the definitive proof: the whole tab persists provider/apiKey/host that `EmailService` (Resend/env) never reads. The "Send Test Email" button _does_ use the DB config (via `testEmailConfiguration` → `settings-actions.sendTestEmail`, which supports all 4 providers), so **test email uses one code path and real email uses another** — a test can pass while production email silently uses different (env) config. This is a genuinely dangerous operability trap: "the test worked, why aren't emails sending?"
- **P1 — Per-section save with one shared dirty form.** Each tab saves only its section via `getValues()`, but the whole form is one RHF instance. If a user edits Email and PDF then clicks "Save Changes" on Email, PDF edits stay in form state unsaved but the form isn't marked clean — navigating away loses them silently (no unsaved-changes guard here, unlike `ServiceForm`).
- **P2 — `loadSettings()` in `useEffect(..., [])`** with no auth-error distinction: a permission failure and a network failure both show "check your permissions," misleading operators.

### P1 — `Backup.tsx`: the scheduling UI describes infrastructure that doesn't exist

- **This configures automatic backup frequency/time/retention, but there is no scheduler.** `settings-actions` has only `runManualBackup` (invoked by a button) and `executeBackup` (the shell-out `pg_dump`). Nothing reads `backup.frequency`/`backup.time` to actually schedule anything — no cron, no job runner (confirmed absent across the repo). So "Enable Automatic Backups," "Next Backup: tomorrow 02:00," and the storage estimate are all **pure UI theater**: the "Next Backup" card computes a time client-side that no server process honors. Users will believe they have nightly backups and have none. This is the single most dangerous "dead feature" in the app for a business (data-loss risk under false confidence).
- **P1 — `getNextBackupTime()` computes in browser-local time** (comment even admits it) while `executeBackup` runs server-side. Even if a scheduler existed, the displayed "next backup" would be wrong for any non-server-timezone user.
- **P1 — `storageLocation` field (S3/path) is collected but ignored.** `executeBackup` hardcodes upload to the B2 bucket from `getB2Config()`; it never reads `backup.storageLocation`. Another configured-but-inert field. And the "What's included: All database tables, user accounts, audit logs" text describes a full `pg_dump` — accurate for `executeBackup`, but there's **no restore path** (the entire `restoreFromBackup` is commented out in `settings-actions`, per v3), so backups can be created but never restored through the app. Backups you can't restore are a false safety net.
- **P2 — `Switch {...field}` in `EmailConfig`/`Backup` spreads RHF `field` onto the custom `Switch` while _also_ passing `checked`/`onCheckedChange`** — the same double-binding controlled/uncontrolled issue as `Checkbox` (batch 2). The switch may not reflect form state on reset.

### P1 — `ServiceActions.tsx`: calls stubbed actions and has a fragile trigger pattern

- **`generate-loading-order` calls `generateLoadingOrder(service.id)` then `window.open(url)`** where `url` is the placeholder path `/documents/loading-orders/${id}.pdf` (the action is a stub, v1) → opens a 404, but toasts "Loading order generated." User sees success, gets nothing. Same for `archive`/`send-email` which are **commented out** — the buttons toast success while doing nothing (`await archiveService` is `//` commented, yet `toast.success('Service archived')` runs). These are actively misleading success messages for no-op actions.
- **P1 — `delete` gating relies on `service.invoice`** (client-provided) to block deleting invoiced services. But the server `deleteService` (v1) has **no invoice check** — it soft-deletes unconditionally. So the real guard is client-side only; a direct action call bypasses it. The UI implies invoiced services are protected; the backend doesn't enforce it.
- **P1 — `cloneElement(trigger, { onClick })` overwrites any existing onClick** and requires `trigger` to accept `onClick`. If the trigger is a `<span>` it's skipped entirely (`trigger.type !== 'span'`) — so a span trigger renders the modal with **no way to open it** (unless `autoOpen`). Brittle imperative pattern; a render-prop or explicit `open` control would be safer.
- **P2 — `service.client.email`** referenced for send-email, but `Client` has `billingEmail`/`trafficEmail`, not `email` (schema, v1). `undefined` shows in the confirmation text.

### `ServiceStatusBadge.tsx` — clean

- **Good, low risk.** Delegates to `getStatusConfig` (from `service-helpers`, already reviewed), graceful fallback for unknown status, size-scaled icons. The only dependency risk is the `Badge` `variant` values (`'active'|'completed'|'cancelled'|'billed'|'archived'|'default'`) matching what `Badge` supports — worth confirming when I read `Badge.tsx`. No new issues.

---

### New/confirmed patterns this batch

1. **CORRECTED — `formatPercentage` is NOT broken across the analytics/detail surface.** Percent-point call sites (cards, tables, VAT rates) render correctly; only `StatsCard`'s fraction input and `ClientDetail`'s stray literal `%` are wrong. The ambiguous fraction-vs-points contract remains a footgun worth a typed split, but this is no longer a top-priority display bug.
2. **"Dead feature" theater is systemic and now includes data-safety:** automatic backups (no scheduler), backup restore (commented out), storage-location field (ignored), number-sequence formats (ignored, v3), multi-provider email (ignored by sender), archive/send-email service actions (commented but toast success), loading-order generation (stub opening a 404). Users are shown capabilities that silently don't work — worst-case being backups.
3. **State-key drift bugs** (`saving === 'backup-manual'` vs `'backup'`, `'email-test'`) cause loading indicators to never show or the wrong control to disable — small, repeated, and confusing.
4. **Test-vs-runtime divergence for email** is a specific operability landmine: the test path and send path use different config sources.
5. **Client-side-only guards presented as protections** (invoiced-service delete block in `ServiceActions`, dependency check in `UserManagement`) — the server doesn't enforce them.
6. **`Switch`/`Checkbox` double-binding** recurs in every settings form.

## Components (batch 5): the primitives — contract mismatches confirmed

The primitives are individually decent, but I found **hard prop-contract mismatches** between them and their consumers that will throw or silently misrender at runtime — and the phantom-class dependency is now proven total.

### P0/P1 — Prop-contract mismatches between primitives and consumers (runtime breakage)

Tracing the primitive APIs against the consumers I already read:

1. **`Card` doesn't accept `padding`/`variant` values that consumers pass, and consumers use `Card.Header`/`Card.Body` that partly don't exist.**
   - `RevenueChart` renders `<Card variant="elevated" padding="none" loading error>` and `<CardHeader title subtitle action />` — those exist. ✅
   - **But `UserForm` uses `<Card.Header title subtitle />` and `<Card.Body>`** — `Card.Header`/`Card.Body` are attached (✅), yet `Card.Header` expects `title`/`subtitle` (✅). OK.
   - **`ServicesFilters` uses `<Card variant="bordered">`** ✅ and `<CardBody>` ✅.
   - **`StatsCard` passes `padding="lg"` / `padding="md"` / `padding="sm"`** ✅.
   - Net: `Card` is fine. Retracting the earlier worry — verified against consumers.

2. **`Alert` icon contract mismatch (P1, real).** `Alert` accepts `icon?: ReactNode | LucideIcon` and handles both element and component. But consumers are inconsistent: `BulkActions` passes `icon={Info}` (component) and `icon={AlertTriangle}` (component) → handled via `typeof icon === 'function'` ✅. `ErrorBoundary`/`ServiceForm` pass `icon={<AlertCircle />}` (element) ✅. `SystemSettings` renders `<Alert variant="error"><AlertCircle/><span/></Alert>` — passes the icon as **children**, not the `icon` prop, so it renders both the default variant icon _and_ the child icon (double icon). Minor, but shows the API is used three different ways.

3. **`Alert` phantom classes are entirely `feedback-*` tokens.** `bg-feedback-success-bg`, `border-feedback-error-border`, `text-feedback-warning-text`, etc. — none are standard Tailwind; all depend on the global theme. If `src/styles` doesn't define the full `feedback-{success,error,warning,info}-{bg,border,text}` matrix, every Alert renders unstyled (invisible colored background). The `content` colors mix conventions: `text-green-700` (standard) alongside `text-feedback-success-text` (custom) in the same variant — so even if custom tokens are missing, the text color partially works. Inconsistent.

### P1 — The phantom-class dependency is now proven total and load-bearing

Every foundational primitive renders its core appearance via **custom classes that must be defined in a global stylesheet** (not Tailwind utilities, not `design-tokens`, not `cn.ts`):

- `Button`: `button`, `button-primary`, `button-secondary`, `button-danger`, `button-ghost`, `icon`
- `Badge`: `badge`, `badge-active`, `badge-completed`, `badge-cancelled`, `badge-billed`
- `Card`: `card`
- `Input`/`Select`: `input`, `input-error`, `input-disabled` (batches 1–2)
- `FormField`: `form-label`, `text-danger` (batch 1)
- `Sidebar`: `nav-item`, `nav-item-active`, `layout-sidebar`, `badge-active` (batch 3)
- `Alert`: `feedback-*` matrix
- `Table`: `table`, `table-header`, `table-cell`, `support-rowHover` (batch 1)

**Consequence:** the visual correctness of the _entire_ UI hinges on one unread global stylesheet (`src/styles/`). If any of these class names were renamed or the file uses Tailwind v4 `@theme`/`@layer` that doesn't emit them, buttons/badges/cards/alerts render as unstyled inline text. This is the highest-leverage unknown remaining. Reading `src/styles/` is now mandatory before any styling conclusion. Two mixed conventions (custom component classes _and_ raw Tailwind utilities like `text-green-700`) mean partial failure modes are likely.

### P1 — `Switch` hardcodes a hex color and breaks the RHF `{...field}` spread

- **`checked ? 'bg-[#166534]'`** — a raw hex green baked into the component, bypassing `design-tokens`/theme entirely. Inconsistent with every other component and unthemeable (dark mode, brand color).
- **Contract mismatch (P1):** `Switch` requires `checked: boolean` and `onCheckedChange` (both non-optional), and accepts **no** `name`/`onChange`/`value`. But `EmailConfig` and `Backup` do `<Switch {...field} id="..." checked={...} onCheckedChange={...} />` where RHF's `field` includes `{ name, value, onChange, onBlur, ref }`. Spreading `field` passes `value`, `onChange`, `onBlur`, `ref`, `name` — **none of which `Switch` accepts**; they land as unknown props on a component that doesn't spread `...props` onto the DOM, so `ref`/`onBlur` are silently dropped (RHF can't register/blur-validate the field) and `value`/`onChange` are ignored (only `checked`/`onCheckedChange` work). It functions only because the callers _also_ pass `checked`/`onCheckedChange` explicitly. So the `{...field}` spread is dead weight that also breaks RHF validation on these switches. Same pattern as the `Checkbox` double-binding (batch 2).

### `Button` — solid, with two notes

- **P2 — `Button` doesn't render `asChild`.** The prop is declared in `ButtonProps` (`asChild?: boolean`) but never used — there's no Slot/child-cloning. Any consumer passing `asChild` (to render a Link as a button) gets a plain `<button>` wrapping the child → invalid nested interactive elements or broken navigation. Dead prop that implies Radix-style composition that doesn't exist. `StatsCard` avoids it by wrapping `<Link><Card/></Link>`, but `Button` inside links elsewhere could double-nest.
- **P2 — `iconPosition="center"` is typed but unhandled** (only left/right render). Center falls through to nothing.
- **Good:** proper `aria-busy`/`aria-disabled`, disabled-blocks-onclick, forwardRef. Depends on `button-*` phantom classes for all actual styling.

### `Badge` — confirms `ServiceStatusBadge` and `UserManagement` variant usage is valid

- Variants `active|completed|cancelled|billed|archived|default` match what `ServiceStatusBadge` maps from `SERVICE_STATUS_CONFIG` (`variant: 'active'|'completed'|'cancelled'|'billed'|'archived'|'default'`) ✅ and what `UserManagement` passes (`'active'|'billed'|'default'|'completed'|'cancelled'`) ✅. **`ServicesFilters` passes `<Badge variant="active" icon={...}>`** — `icon` supported ✅. So the badge contract holds across consumers. `archived`/`default` use inline Tailwind (`bg-neutral-100...`) while the others use phantom `badge-*` classes — mixed convention, partial-failure risk again.

### `Tabs` — solid, one contract note

- **Good accessibility:** `role="tablist"/"tab"/"tabpanel"`, roving `tabIndex`, arrow/Home/End keyboard nav. This is the best-implemented primitive so far.
- **P2 — Uncontrolled internal `activeTab` ignores `defaultTab` changes.** `SystemSettings` passes `defaultTab={activeTab}` and `onChange={setActiveTab}`, treating it as controlled — but `Tabs` only reads `defaultTab` on first render (`useState(defaultTab || ...)`). If the parent tried to programmatically switch tabs, it wouldn't work. `SystemSettings` doesn't, so no live bug, but the "controlled-looking" usage is misleading. Also `content` for all tabs is rendered eagerly into the `tabs` array (each `TabContent` mounts its whole settings form) — only the active one is displayed, but all are constructed every render. For 5 heavy settings forms that's wasteful but not broken.

### `DropdownMenu` — feature-rich but has real bugs

- **P1 — Keyboard focus never initializes and `focusedIndex` desyncs.** On open, `focusedIndex` stays `-1`; the menu `div` has `tabIndex={-1}` and `onKeyDown`, but nothing focuses it on open, so arrow keys don't work until a mouse hover sets `focusedIndex`. And `Enter/Space` act on `enabledItems[focusedIndex]` while the visible focus ring uses a per-item `enabledIndex` recomputed by filtering — if the items list contains dividers/disabled entries, the two index spaces can diverge, so pressing Enter can trigger the **wrong** item. `ServicesTable`/`UserManagement` build menus with dividers and conditional `hasPermission && {...}` entries (which produce `false` in the array!) — see next.
- **P1 — `items` arrays contain `false` from short-circuit gating.** `ServicesTable` builds `[ hasPermission(...) && {...}, {...}, ... ].filter(Boolean)` (it filters — ✅), but `UserManagement`'s discarded `actions` and other call sites pass conditionally. `DropdownMenu` iterates `items.map` and does `'divider' in item` checks — if a `false` slips through unfiltered, `'divider' in false` throws ("Cannot use 'in' operator on false"). `ServicesTable` filters, so safe there; any consumer that forgets `.filter(Boolean)` crashes the menu. Fragile contract; the component should defensively skip falsy items.
- **P2 — `default` case in `handleKeyDown` closes the menu on _any_ other key** (`default: e.preventDefault(); setIsOpen(false)`). Typing a letter (e.g., type-ahead) slams the menu shut. Hostile UX.
- **P2 — Submenu opens on hover (`onMouseEnter`) and on click toggle,** and `onMouseLeave` doesn't close submenus; combined with click-toggle this makes submenu state sticky/confusing. `service-helpers.buildServiceActionsMenu` produces submenus ("Modify" group) that will feel erratic.
- **P2 — Position recalculation on every `scroll` (capture) + `resize`** with `getBoundingClientRect` — fine for a single open menu, but no `requestAnimationFrame` throttle; heavy scroll pages will thrash layout while a menu is open.

---

### Cross-cutting conclusions from the primitives

1. **Contract drift between primitives and consumers is real and in places crash-prone:**
   - `Switch` + RHF `{...field}` breaks validation (EmailConfig, Backup, UserForm).
   - `DropdownMenu` throws if an unfiltered falsy item is passed; keyboard activation can hit the wrong item.
   - `Button.asChild` is a dead prop implying composition that doesn't exist.
     These sit _beneath_ the feature bugs found earlier, so fixing features without fixing primitives leaves latent breakage.

2. **The whole design system is a two-layer styling scheme** — custom semantic classes (`button-*`, `badge-*`, `card`, `input`, `feedback-*`, `nav-item`, `table-*`) presumably defined in `src/styles`, plus ad-hoc raw Tailwind. Wherever they mix in one component (`Badge`, `Alert`), a missing token degrades _partially_, which is harder to detect than total failure. **`src/styles/` is the linchpin** and must be read to know if any of this renders.

3. **Accessibility quality is uneven:** `Tabs`/`Modal` are strong; `Select` keyboard nav is a stub (batch 2); `DropdownMenu` keyboard focus is half-wired; `Checkbox`/`Input`/`FormField` id-association is broken (missing `id` plumbing). A repo-wide `useId` pass would fix the association cluster.

4. **Hardcoded values leak past the token system:** `Switch` `#166534`, `RevenueChart` chart hexes, `PricingCalculator`/`ServiceDetail` `text-green-600/red-600` thresholds. The `design-tokens.ts` single-source-of-truth (batch: lib) is bypassed by most components.

## `src/styles/globals.css`: Full Understanding + Adjudication

It's a single Tailwind v4 file (`@import 'tailwindcss'`) with a large `:root` design-token block and three `@layer` sections (`base`, `components`, `utilities`). This is the source of every "phantom class" I flagged. Now I can say definitively which of my earlier concerns were real and which were false alarms.

#### What the file actually defines (the component-class contract)

- **Component classes that DO exist** (`@layer components`): `.card`, `.button` + `.button-primary/secondary/danger/ghost`, `.input` + `.input-error/.input-disabled`, `.form-label`, `.form-helper`, `.table` + `.table-header/.table-cell`, `.badge` + `.badge-active/completed/cancelled/billed`, `.nav-item` + `.nav-item-active`, `.amount` + `.amount-large`, `.skeleton`, `.service-number`, `.vat-number`, `.text-positive/negative/neutral-amount`, `.row-hover/selected/cancelled`, `.text-sm/text-xs` (overridden!), `.container`.
- **Utility classes that DO exist** (`@layer utilities`): `.layout-header/sidebar/sidebar-collapsed/tablet`, `.avatar`, `.logo`, `.icon-sm/icon-md`, `.surface-*`, `.text-secondary/disabled/primary`, `.sr-only`.
- **CSS variables**: full token set (`--primary`, `--status-*`, `--space-*`, `--sidebar-*`, `--icon-*`, `--header-height`, etc.).

#### Adjudication of my earlier phantom-class flags

**Real bugs confirmed (classes referenced but NOT defined here → render unstyled):**

1. **`feedback-*` matrix (Alert, batch 5): CONFIRMED MISSING.** `Alert` uses `bg-feedback-success-bg`, `border-feedback-error-border`, `text-feedback-warning-text`, etc. None exist in `globals.css` (the tokens are named `--success-bg`, `--error-text`, not `--feedback-*`, and no `feedback-*` utilities are emitted). **Every Alert renders with no background/border color** (only the hardcoded `text-green-700`/`text-red-700` content color partially shows). This is a real, repo-wide visual bug. `service-helpers`/`design-tokens` even have a `feedback` structure, but the CSS layer names them differently. Naming mismatch between three sources.
2. **`primary-*` scale (Select `bg-primary-50 text-primary`, cn.ts `ring-primary-500`, Tabs `border-primary`): PARTIAL.** `.text-primary` exists (utility). But `bg-primary-50`, `ring-primary-500`, `border-primary`, `ring-primary` do **not** — there's no Tailwind `primary` color scale registered (no `@theme` block mapping `--primary` into Tailwind's color system). So `border-primary`/`bg-primary`/`ring-primary` used across `Tabs`, `Select`, `Modal`, `StatsCard`, `Sidebar` (`bg-primary`), `Switch` are **inert** unless Tailwind treats `primary` as an arbitrary — it won't. Confirmed: `border-primary text-primary` in `Tabs` gives text color (`.text-primary` utility) but **no border color**. The active-tab underline is invisible.
3. **`Sidebar` malformed classes (batch 3): CONFIRMED.** `ps-9)]`, `icon-sm)]`, `mt-space-1)]` with stray `)]` are invalid — Tailwind emits nothing. `.icon-sm` exists but `icon-sm)]` does not. Sidebar icon sizing/indentation is broken. Also `bg-neutral` (no shade) and `badge badge-active` — `.badge-active` exists ✅ but `.badge` forces `text-transform:uppercase` on a numeric badge.
4. **`support-rowHover`/`support-rowSelected` (Table, batch 1): CONFIRMED MISSING.** `Table` row uses `hover:bg-support-rowHover` and `bg-support-rowSelected`; the CSS defines `.row-hover`/`.row-selected` and `.surface-hover/selected`, **not** `support-*`. So `DataTable` row hover/selection highlighting **doesn't work** (the `support-*` names don't exist anywhere). Row selection is invisible.
5. **`shadow-modal` (Modal): CONFIRMED MISSING as a utility.** `--shadow-modal` var exists, but `Modal` uses `shadow-modal` (a Tailwind class) with no `@theme`/utility mapping → no modal shadow. Cosmetic.
6. **`text-danger`, `border-danger`, `bg-danger`, `text-success`, `text-info`, `bg-info-50`, `border-info-200` (FormField, Checkbox, Select, UserForm, ServiceForm): CONFIRMED MISSING.** `--danger`/`--success`/`--info-*` vars exist but there are **no `text-danger`/`border-danger`/`bg-info-50` utilities**. So every form error message (`text-danger` in `FormField`/`Input`/`Checkbox`/`Select`) renders in **default text color, not red** — a real accessibility/usability bug: validation errors don't look like errors. `UserForm`'s `bg-info-50 border-info-200`, `text-success` are also inert.
7. **`bg-success-100 text-success-600` (PermissionMatrix, batch 3): CONFIRMED MISSING.** The permission matrix's green "has permission" cells have no background/color. Renders as plain check icons on white.
8. **`bg-primary/10 text-primary` (UserManagement avatar): PARTIAL** — `text-primary` works, `bg-primary/10` (opacity modifier on a non-registered color) does not.

**False alarms (classes that DO exist → I retract):**

- `.card`, `.button-*`, `.input`, `.input-error`, `.badge-*` (active/completed/cancelled/billed), `.nav-item`, `.amount`, `.amount-large`, `.table`, `.skeleton`, `.form-label`, `.layout-*`, `.icon-sm/md`, `.avatar`, `.logo`, `.sr-only`, `.text-positive/negative` — **all real**. So `Button`, `Card`, `Badge` (4 of 6 variants), `Input`, base `Table` element, `Amount` colors, and the layout width vars **do** render correctly. My batch-1–5 worry that these might be missing is resolved: the _core_ primitives are styled; the _feedback/error/primary-scale/support_ families are the broken ones.

#### New issues found inside `globals.css` itself

- **P1 — `.text-sm` and `.text-xs` are redefined in `@layer components` and override Tailwind's own `text-sm`/`text-xs`.** The file sets `.text-sm { font-size: 0.75rem; color: var(--neutral-500) }`. Tailwind's `text-sm` normally means `0.875rem` with no color. So **every `text-sm` in the entire app is smaller than expected AND forces gray text** — meaning any element with `text-sm` that intended a specific color gets `--neutral-500` unless overridden later. This is a subtle, pervasive typography/color bug: e.g., a `text-sm font-medium text-red-800` might work (later class wins) but `text-sm` alone silently greys text. Because it's in `@layer components`, specificity/order vs Tailwind utilities is fragile. This likely explains muted-looking text everywhere. **Do not redefine core Tailwind utility names.**
- **P1 — No `@theme` block.** Tailwind v4 registers custom colors via `@theme { --color-primary: ... }`. This file only sets plain `:root` variables, so **none of the tokens are available as Tailwind color utilities** (`bg-primary`, `text-danger`, `ring-primary-500`, `feedback-*`). That single omission is the root cause of findings #1, #2, #6, #7 above. Adding a proper `@theme` mapping (`--color-primary-500`, `--color-danger`, `--color-feedback-success-bg`, etc.) would fix most phantom-class breakage at once.
- **P1 — `.input:focus { box-shadow: 0 0 0 2px var(--primary) }`** with `border-color: var(--primary)` — but the invalid state uses the same 2px shadow with `--danger`. Fine, but `.input[aria-invalid='true']` relies on `Input`/`Select` setting `aria-invalid`, which they do only when `error` is truthy — OK. However since `text-danger` (the message color) is missing, the field border turns red (works) but the message text stays default (broken). Half-signalled errors.
- **P2 — `.button .gap-8 { margin-left: 0.5rem }`** overrides Tailwind's `gap-8` (2rem) to a margin — another core-utility override landmine.
- **P2 — `.nav-item` forces `border-radius` and a 4px left border**; combined with the broken `ps-9)]` indent, nested nav children won't indent.
- **P2 — xl breakpoint sets root `font-size:14px`** (density), meaning all `rem` sizing shrinks on desktop. Intentional per the comment, but interacts with the `.text-sm` override to make desktop text quite small; worth a design check.
- **P2 — `prefers-reduced-motion` block references `.modal-overlay`** which no component uses (Modal uses inline `bg-black/50`). Dead rule; reduced-motion users still get the modal's `animate-in` classes (Tailwind animations) which the `*` reset does dampen — OK.

#### Net conclusion on styling

The design system is **half-wired**: a solid token block and a good set of component classes, but **the tokens are never registered with Tailwind (`@theme` missing)**, so every `*-primary-*`, `*-danger`, `*-success`, `feedback-*`, `support-*` utility used across the components is inert. Combined with **overriding core utilities** (`.text-sm`, `.text-xs`, `.gap-8`) and **malformed classes** (`)]` in Sidebar) and **name mismatches** (`support-*` vs `.row-*`, `feedback-*` vs `--success-*`), the visible result is: buttons/cards/badges/inputs look right; **error text isn't red, form-validation is under-signalled, Alerts have no color, table row hover/selection is invisible, active-tab underline is missing, permission matrix cells are colorless, and body text skews small/grey.** These are real, shippable-looking-but-degraded UI bugs, not crashes. One `@theme` block + renaming three class families + removing the `.text-sm/.text-xs/.gap-8` overrides fixes the bulk.

---

## Primitives (batch 6): DatePicker, TimeInput, Pagination

### P0 (functional) — `DatePicker.tsx`: the calendar cannot pick most dates

`generateCalendarDays()` doesn't render a real month calendar — it renders **"today + next 29 days"** in a 7-column grid, then `.slice(0, 28)`. Consequences:

- **You cannot select any past date, and only ~28 days into the future.** For a transport ERP where service `date` is frequently _today or recent past_ (recording completed trips), the calendar can't pick yesterday. Users must type the date manually.
- **The grid ignores weekday alignment** — day cells are laid into columns by index, so "the 15th" won't sit under the correct weekday; the `Su Mo Tu…` header is decorative and wrong.
- **`isToday: i === 0`** marks the first cell today (correct-ish) but there's no month navigation, no year, no "previous month."
- **Selecting sets a `Date` at local midnight**; combined with `serviceSchema`'s `z.coerce.date()` and server `new Date(filters.dateFrom)`, timezone offsets can shift the stored date by a day for users behind UTC. Date handling is unsound end-to-end (ties to the `Backup` local-time and dashboard bucketing findings).

This is used in `ServiceForm` for the required service `date` — so the primary date-entry control is effectively "type it yourself," and the calendar is misleading. Replace with a real calendar (the project already depends on `react-day-picker` per package.json — it's imported nowhere I've seen; the `DatePicker` reinvents a broken one instead of using it).

Other `DatePicker` issues:

- **P1 — Controlled/uncontrolled desync (same family as `Input`):** `selectedDate` is seeded from `value` via `useState(value ?? null)` but there's **no effect syncing when `value` changes**. In `ServiceForm` edit mode, prefilling the date via `reset()` won't update the picker's display. The sync effect only runs `selectedDate → inputValue`, not `value → selectedDate`. Edit forms show a blank date field.
- **P1 — `??` misused for boolean constraint logic:** `const isDisabled = (minDate && isBefore(...)) ?? (maxDate && isAfter(...)) ?? disabledDates?.(date)`. `??` only falls through on `null/undefined`; `minDate && isBefore(...)` yields `false` (not nullish) when there's a minDate but the date is after it → the whole expression short-circuits to `false` and **`maxDate`/`disabledDates` are never evaluated**. Should be `||`. Date constraints silently don't apply.
- **P2 — `bg-primary text-white hover:bg-primary-hover`** on the selected day: `bg-primary`/`bg-primary-hover` are not registered Tailwind utilities (styles finding #2) → the selected day has **no highlight**. `text-danger` error text also inert.
- **P2 — `text-sm` inside the calendar** now means 0.75rem grey (the globals override) — day numbers render smaller/greyer than intended.

### P1 — `TimeInput.tsx`: controlled/uncontrolled + no validation + RHF break

- **`useState(props.value || '')` then spreads `{...props}` after setting `value={inputValue}`.** Since `{...props}` includes `value` (from RHF `field` in `Backup`), it **overrides** the controlled `value={inputValue}` — React will warn and the two fight. Also `onChange` is both destructured-into-`handleChange` and present in `...props`, so `props.onChange` is called inside `handleChange` _and_ the spread re-attaches it — double-wired.
- **P1 — No time validation.** It strips non-digits and auto-inserts `:`, but accepts `99:99`. `Backup`'s `getNextBackupTime` does `Number(hours)`/`Number(minutes)` with a `NaN` guard but not a range check → a user can set backup time `99:99` and the "next backup" calc produces a rolled-over `Date`. For 12h format it shows `HH:MM AM/PM` placeholder but the regex `[^\d:]` **strips "AM/PM"**, so 12-hour mode is unusable (you can never enter AM/PM).
- **P2 — `text-danger` error inert** (styles).

### `Pagination.tsx` — good, two small issues

- **Good:** proper `nav`/`aria-label`/`aria-current`, keyboard arrows, ellipsis logic, uses `useId`. Best-behaved of the batch.
- **P1 — Duplicate React keys for ellipsis.** Both ellipses use `key={\`${baseId}-ellipsis\`}` — **identical key** when two ellipses render (large page counts) → React key collision warning and potential render glitch. Should include position/index.
- **P2 — `disabled={currentPage === totalPages}`** breaks when `totalPages === 0` (empty result): Next stays enabled at page 1 of 0. And `DataTable` computes `totalPages={Math.ceil(total/pageSize)}` which is `0` for empty data → "Page 1" with `aria-current` never set. Minor edge cases.
- **P2 — `{totalItems && ...}`** renders `0` literally when `totalItems === 0` (the `0 && x` returns `0`, which React renders as "0"). Falsy-render bug: shows a stray "0". Use `totalItems != null`.

---

## Primitives (batch 7): DateRangePicker, Tooltip, Textarea, EmptyState

- **`DateRangePicker.tsx` (P2, good overall):** Uses native `<input type="date">` for custom range (accessible, no broken calendar — the correct pattern the `DatePicker` should have used). Properly syncs local state from props via effect, swaps reversed ranges on apply, has presets. **Issues:** (1) heavy reliance on **unregistered `primary-*` utilities** (`text-primary-600`, `bg-primary-50`, `bg-primary-100`, `border-primary-600`, `text-primary-900`) → per the styles finding, the active-preset highlight, the tab underline, and the "has value" button state are **all inert/colorless**; (2) `new Date(localFrom) > new Date(localTo)` parses `yyyy-MM-dd` as UTC midnight — comparison is fine, but the day-count `Math.ceil((toMs-fromMs)/86400000)+1` can be off by one across DST boundaries; (3) `hasValue = from ?? to` returns the string, used as boolean — works but sloppy. Net: functionally sound, visually degraded by the missing theme.

- **`Tooltip.tsx` (P2, decent):** Portal-based, `useId`, `role="tooltip"`, `aria-describedby`, escape-to-hide, cleanup on unmount — solid. **Issues:** (1) wraps every trigger in a `<button type="button">` — so `Tooltip`-wrapping a `Button` (as `ServicesTable`/`StatsCard`/`ServicesFilters` do constantly) produces a **`<button>` inside a `<button>`**, which is invalid HTML and causes hydration warnings + nested-interactive a11y violations; this is pervasive since almost every icon button is tooltip-wrapped; (2) `position` uses `fixed` coords from `getBoundingClientRect` but **doesn't recompute on scroll/resize** while visible, so a tooltip shown then scrolled floats away (minor since it hides on mouic leave); (3) `cursor-default` on the wrapper overrides the child button's `cursor-pointer`. The nested-button issue (1) is the real one — it's a structural a11y/HTML-validity bug repeated hundreds of times across the app.

- **`Textarea.tsx` (P1, one real bug):** Properly forwards ref, merges internal ref, auto-resize. **Issue:** it's **fully controlled** (`value={value}`) unlike `Input`/`TimeInput`/`Checkbox` — so it's actually _correct_ and doesn't have the sync bug. But it's used in `ServiceForm` via `{...field}` from RHF `Controller` with `value={field.value || ''}` — fine. The one real bug: **`autoResize` effect reads `getComputedStyle(...).lineHeight` which can be `"normal"` → `parseInt("normal")` is `NaN` → `maxHeight = NaN`, `Math.min(scrollHeight, NaN)` is `NaN`, height set to `"NaNpx"`** (ignored, so it just grows unbounded ignoring `maxRows`). Guard the lineHeight parse. `text-danger` error text inert (styles). Overall the best-behaved input primitive.

- **`EmptyState.tsx` (clean):** Well-designed variant presets, proper optional actions, `RelatedDocuments`/`DataTable`/`RevenueChart` usage all match the API (`variant="custom"` handled, `icon`/`action`/`secondaryAction` optional). No real issues. `text-sm` on the description now renders 0.75rem grey per the globals override (minor). Good component.

Net for primitives: the date/time entry is the weak spot (`DatePicker` broken calendar + constraint `??` bug, `TimeInput` controlled/validation), `Tooltip` creates nested buttons everywhere, and everything is visually degraded by the missing `@theme`/`primary-*`/`danger`/`feedback-*` registration.

---

## Service components (batch 8): ServiceTimeline, ServicesMobileView, SupplierSelector

- **`ServiceTimeline.tsx` (P1):** (1) **Double-fetch on mount pagination race** — one effect runs `loadActivities()` on `[serviceId]`, a second runs `loadMoreActivities()` on `[page]`. When "Load More" sets `page`, `loadMoreActivities` fetches `page` and _appends_ — but it re-fetches the same offset logic as the server (`getServiceActivity` uses `(page-1)*limit`), so appending page 2 is correct; however the **initial** `loadActivities` always fetches page 1 while `page` state may already be >1 from a previous mount (state persists if serviceId changes but component doesn't unmount) → possible duplicate items. (2) **`key={i}` with `i: string` typed but it's the array index number** — the `changes.map((change, i: string)` annotation is wrong (index is a number); harmless but a type lie. (3) Renders `change.oldValue`/`newValue` **raw** — these come from audit-log JSON which can be objects/dates; rendering an object throws "Objects are not valid as a React child." Since `service-actions.getServiceActivity` only diffs scalar fields (`costAmount`, `status`, etc.) it's currently safe, but fragile. (4) The activity feed reflects the audit-log PII concern (v1): cost/sale changes shown in a UI timeline to anyone with service view. (5) Border-color classes (`border-green-200` etc.) are standard Tailwind and DO resolve — this component actually styles correctly, unlike the theme-dependent ones.

- **`ServicesMobileView.tsx` (P1, confirms parity gaps):** (1) `formatPercentage(marginPercent)` — CORRECTED: renders correctly; the ×100 claim is retracted (same as desktop `ServicesTable`). (2) **`formatCurrency` whole-euro rounding** on mobile too. (3) The `MoreVertical` actions button has an **empty onClick** (`// Handle actions menu`) — the mobile per-card action menu **does nothing**; mobile users can't view/edit/delete/duplicate from the card (must tap into detail). Desktop has full row actions; mobile is a dead affordance. (4) Its selection state is a `Set<string>` (local), separate from `ServicesTable`'s `string[]` — two selection models for the same feature; switching viewport loses selection. (5) `Checkbox onCheckedChange` without a controlled `onChange`/`id` → the batch-2 checkbox issues (invisible indeterminate not used here, but click-target-is-only-the-box problem applies). (6) Pagination has no page-size control (desktop does) — inconsistent. Net: the mobile view is a **partial reimplementation** of `ServicesTable` that drifts (dead actions, different selection type, missing page-size) — the "reduce duplication / share formatting" recommendation from your original list is validated here concretely.

- **`SupplierSelector.tsx` (P1, mirror of ClientSelector):** Byte-for-byte the same pattern as `ClientSelector` (batch 2) — confirms the **unbounded-list scale cliff**: loads _all_ suppliers into an in-memory `Select`, filters client-side. For a transport brokerage with thousands of suppliers this won't scale and there's no async search. Also inherits `Select`'s stub keyboard nav and the fake synthetic-event `onChange`. The `'__create_new__'` sentinel value routes to `/suppliers/new` — works, but if a real supplier ever had that id it'd collide (theoretical). These two selectors should be one generic `<EntitySelector>` with server-side search. The `className={cn(error && 'border-red-500...')}` passes a Tailwind `border-red-500` (standard, resolves) but `Select` also applies `input-error` internally → redundant/possibly conflicting borders.

Critical discovery: **`OldServiceTable.tsx` is a stale duplicate of `ServicesTable`** (same header comment `// ServicesTable.tsx`, imports `./ServiceRow`, 484 lines), and it's **not exported** in `index.ts` — confirmed dead code. Also `ServicesTable` has **two implementations**: the one I read in batch 1 (uses `DataTable`, 484-ish) vs. `OldServiceTable` (uses `ServiceRow` + manual `Pagination`). And `ServiceSidebar` passes `service.attachments` (a `string[]` of file paths) as `documents` to `RelatedDocuments` (which expects `Document[]` objects) — a type/shape mismatch bug. Findings:

## Service components (batch 9): OldServiceTable, ServiceFormSection, ServiceSidebar

- **`OldServiceTable.tsx` — P1 dead code / confusion.** Header says `// ServicesTable.tsx`, it's 484 lines, imports `ServiceRow`, and is **not in `index.ts`** (so unused). It's a prior implementation of the services table (manual rows + `Pagination`) superseded by the `DataTable`-based `ServicesTable`. Meanwhile **`ServiceRow` IS exported and imported by `OldServiceTable`** but the live `ServicesTable` (batch 1) uses `DataTable` columns, not `ServiceRow` — so `ServiceRow` may also be orphaned. Dead code carrying its own copies of the `formatPercentage`/`formatCurrency` bugs, drift risk, and bundle weight. **Delete `OldServiceTable` and audit whether `ServiceRow` is still used.** This validates your original "reduce duplication" concern with a concrete orphan.

- **`ServiceSidebar.tsx` — P1 real bug + several link issues.** (1) **Shape mismatch:** `<RelatedDocuments serviceId={service.id} documents={service.attachments || []} />`. `Service.attachments` is `String[]` (file-path strings, per schema), but `RelatedDocuments` expects `Document[]` objects (`{ id, documentType, fileName, filePath, ... }`). So it iterates strings as if objects → `doc.documentType`/`doc.fileName` are `undefined`, `getDocumentIcon(undefined)` falls to default, and `key={doc.id}` is `undefined` (React key collision). The documents panel is broken whenever attachments exist. The real service documents live in `service.documents` (the relation), not `attachments`. Wrong field wired. (2) **`/invoices/${service.invoice.id}` link** — invoices route doesn't exist (dead link, matches the missing-module theme). (3) `canViewInternal = hasPermission(userRole, 'services', 'view')` gates the "Audit Trail" card — but _everyone_ who can see the page has `services:view`, so this "internal" gate is meaningless; the audit trail (created-by, edit count) shows to all viewers including the `VIEWER` role. (4) `service.updatedAt !== service.createdAt` compares Date objects by reference — **always true** (two different Date instances even if equal timestamps), so "Last Modified" always renders even for never-edited services. (5) `service.assignedTo.name` labeled as "by" for last-modified — but `assignedTo` is the assignee, not the last editor; misleading attribution. (6) Uses a **properly typed `Prisma.ServiceGetPayload`** — good, one of the few non-`any` service components. Note the payload type doesn't include `invoice`/`createdBy`/`assignedTo`/`editCount`/`attachments`/`documents`, yet the code reads all of them → TypeScript would error, meaning the actual data passed is a looser shape than the annotation (the annotation is aspirational, not accurate).

- **`ServiceFormSection.tsx` — clean.** Trivial `Card`+`CardBody` wrapper with title/description. No issues. `text-muted-foreground` is used heavily across all these components — note it's **not defined in `globals.css`** (no `.text-muted-foreground`, no `--muted-foreground`), so like `feedback-*` it's likely inert unless Tailwind maps it. This is a **pervasive phantom class** I should add to the styles findings: `text-muted-foreground` and `bg-muted`/`text-foreground` (shadcn-convention classes) appear in nearly every feature component but `globals.css` uses `text-neutral-*` conventions — **`text-muted-foreground` almost certainly renders as default/inherited color**, meaning the ubiquitous "muted" secondary text is not actually muted. Big, subtle, app-wide.

**New cross-cutting: `text-muted-foreground`/`text-foreground` are undefined.** These appear in ServiceDetail, ServicesTable, ServiceSidebar, ServiceTimeline, ServicesMobileView, PricingCalculator, StatsCard, RevenueChart, RelatedDocuments, EmptyState, ServicesFilters — essentially everywhere. `globals.css` defines no such classes or `--foreground`/`--muted-foreground` vars. So all "muted" helper text renders in the default body color (near-black), not grey. This is arguably the single most widespread visual degradation in the app, alongside the `feedback-*` Alert colors.

Notable: `services/Header.tsx` is actually **`DashboardClientComponents`** (misnamed file), `ServiceHeader.tsx` reads `service.urgent` and `service.client.name`/`service.supplier.name` off a bare `Service` type that has none of those (type mismatch), and `ServiceRow` confirms the third copy of the margin/currency bugs. Findings:

## Service components (batch 10): ServiceRow, ServiceHeader, Header (misnamed)

- **`ServiceRow.tsx` (P1):** The manual-table row used by `OldServiceTable` (the dead component). Confirms: (1) **third copy** of the margin-% computation `marginPercent = (margin/sale)*100` → `formatPercentage(marginPercent)` — CORRECTED: renders correctly (no ×100 inflation); the duplication itself is the issue — now in `ServicesTable`(DataTable), `ServiceRow`, `ServicesMobileView`, `ServiceDetail`, `StatsCard`, `RevenueChart`(correct), `PricingCalculator`, `ServiceForm`. (2) `formatCurrency(costAmount)` whole-euro rounding. (3) **`Checkbox onCheckedChange={() => {}}` + `onClick={onSelect}`** — selection handled via `onClick` not the checkbox's change; combined with `Checkbox`'s broken click-target (batch 2), selection is fragile. (4) `bg-primary/5`, `bg-muted/50`, `text-muted-foreground` — all **unregistered/undefined** classes (styles + `muted-foreground` findings) → row selection/hover tints and muted text don't render. (5) `menuItems as any` cast; `items` includes `false` entries filtered with `.filter(Boolean)` (safe). (6) Links to `/invoices/new`, `/loading-orders/new` — dead routes. Since `ServiceRow` is only used by the dead `OldServiceTable`, all of this is **orphaned code carrying live-looking bugs** — deleting the pair removes ~700 lines of drift.

- **`ServiceHeader.tsx` (P1, type + behavior bugs):** (1) **Type mismatch:** props typed `service: Service` (bare Prisma model), but the code reads `service.urgent`, `service.client.name`, `service.supplier.name`, `service.invoice` — **none exist on `Service`** (`urgent` isn't in the schema at all; `client`/`supplier`/`invoice` are relations not included in the base type). This won't type-check against the annotation, meaning the real passed object is looser (`any`-ish) — the `urgent` badge will never show (field doesn't exist), and if the relations aren't loaded it throws reading `.name`. (2) **`ServiceActions` with `trigger={<span className="hidden" />}`** — recall `ServiceActions` skips cloning when `trigger.type === 'span'` (batch 4), so this "hidden modal trigger" **relies on `autoOpen` via `showServiceAction`** — but `ServiceActions` doesn't receive `autoOpen`, only `onSuccess`. So the delete/archive/send-email modals opened via the dropdown **never actually open** (the span trigger isn't cloned and `autoOpen` isn't passed). The header's More-menu destructive actions are dead. (3) `canGenerateDocs = hasPermission('documents','export')` gates both "Loading Order" and "Send by Email" — but loading-order generation should be `documents:create`, not `export`; wrong permission. (4) `handleShare` fallback copies URL but the comment `// Show toast` shows no feedback. (5) `service.invoice` guard for delete is client-side only (server doesn't enforce, v1). Uses `getStatusVariant`/`getStatusLabel` from `service-helpers` correctly.

- **`services/Header.tsx` (P1, misnamed + wrong project name):** The file is `// DashboardClientComponents.tsx` exporting `ServicesHeader`, `DashboardRefreshButton`, `DashboardErrorAlert`, `NewUserWelcome`, `PerformanceTip` — a grab-bag of dashboard client components living under `services/` and exported via the services barrel as `Header`. (1) **`NewUserWelcome` title "Welcome to Enterprise Dashboard!"** — the old project name leaking to end users (schema comment, email `enterprise-dashboard.com`, welcome email, now this). (2) `NewUserWelcome`/`PerformanceTip` route to **`/import`** and imply an import feature that doesn't exist (dead route). (3) `PerformanceTip` uses `formatPercentage(averageMargin)` — CORRECTED: renders correctly (`18.5%`); the ×100 claim is retracted. (4) `DashboardErrorAlert` passes `icon={<Info/>}` to `Alert` whose `feedback-error-*` background is inert (styles) → error alert has no red background. Misfiled component (belongs in `dashboard/`), wrong name, dead route, wrong brand, and the margin bug.

**New confirmations:** `service.urgent` referenced but not in schema (dead field, like `client.email` earlier); `ServiceHeader`'s hidden-span `ServiceActions` pattern is **non-functional** (destructive header actions don't open); "Enterprise Dashboard" brand name still surfaces to users; `/import` is another dead route.

## Dashboard components (batch 11): RecentServices, ServiceChart, DashboardDateRange, ChartTooltip

- **`RecentServices.tsx` — P0 crash: wrong router import.** `import { useRouter } from 'next/router'` — that's the **Pages Router** hook. In the App Router (this app uses `next/navigation` everywhere else), `next/router`'s `useRouter()` returns `null`/throws "NextRouter was not mounted." So `router.push(...)` in row actions/view-all **crashes or no-ops** on the dashboard's Recent Services. Must be `next/navigation`. This is a definite runtime bug on the main dashboard.
- **P1 — reassigns a prop:** `services = advanced ? filteredServices : services;` mutates the function parameter, then `stats`/`servicesTabsCounts` `useMemo`s depend on `[services]` — but the reassignment happens _during render after_ the memos are defined, so the memos capture the **original** prop, not the filtered value → stats and the table can disagree (table shows `services` post-reassign, stats computed pre-reassign in some render orders). Fragile. (2) **Client-side date/status filtering on a 10-row payload** — `getDashboardData` returns only 10 recent services; the "week/month/quarter/year" and tab filters operate on those 10, so "This year" shows ≤10. The advanced filters are misleading. (3) `bulkActions` Export just `console.log`s (dead). (4) `formatCurrency` rounding on all the stat pills. (5) Uses `bg-background`, `text-foreground`, `text-muted-foreground` — undefined (styles). (6) `handleRefresh` default = full `location.reload()`. Overall this is a heavy, half-wired component with a hard router crash.

- **`ServiceChart.tsx` — P0 build/runtime: dynamic Tailwind classes.** `HeaderAction` builds classes by string interpolation: `` `bg-${trendColor}-50` ``, `` `text-${trendColor}-600` ``, `` `dark:bg-${trendColor}-900/20` ``. **Tailwind's JIT cannot see these** → the trend badge has **no background/text color** in production (purged), exactly the `cn.ts utils.grid()` bug from the lib pass, now in a shipped dashboard chart. (Same as batch-1 warning, now a concrete instance.) Otherwise the chart is well-built: uses `formatNumber` (not the buggy `formatPercentage`), correct completion-rate math (`.toFixed(1)` on a fraction×100 done inline — correct), its own CSV export (third/fourth inline export impl), theme-aware colors via inline styles (bypasses tokens but works). `bg-background`/`text-muted-foreground` in the tooltip are undefined (styles).

- **`DashboardDateRange.tsx` — P1.** (1) Offers a **"Custom range"** option that sets `?range=custom` but `calculateDateRange` (lib) has no `custom` preset → falls to the default 30 days; there's no custom date picker wired. Dead option. (2) `clearable` on the `Select` lets the user clear to empty → `?range=` (empty) → default; harmless but odd. (3) Pushes to `/dashboard?range=...` which re-runs `getDashboardData` — but recall that action is wrapped in `unstable_cache` keyed by the static string (v3 P0), so **changing the range may return the same cached data** regardless. The UI control is partially defeated by the caching bug. `text-muted-foreground` undefined.

- **`ChartTooltip.tsx` — clean, one note.** Correct margin-% math inline (`(margin/revenue)*100).toFixed(1)` — right, not the buggy helper), uses `formatCurrency` (rounds, but consistent). Uses `bg-background` (undefined → tooltip background may be transparent/white-by-default over the `shadow-md` border, likely OK since parent is white). Minor.

**New P0s this batch:** (1) `RecentServices` imports `useRouter` from `next/router` (Pages Router) in an App Router app → crash/no-op on the dashboard. (2) `ServiceChart` `HeaderAction` uses interpolated Tailwind color classes → purged in prod → colorless trend badge (build-time class-detection failure).

**Confirmed patterns:** four+ inline CSV export implementations now (client-actions server CSV, `export.ts`, `RevenueChart`, `ServiceChart`); `bg-background`/`text-foreground`/`text-muted-foreground` undefined across all dashboard components; `formatCurrency` rounding everywhere; charts compute percentages inline while cards/tables/detail use `formatPercentage` — CORRECTED: both output correctly; the inconsistency is stylistic, not a correctness bug.

## Auth components (batch 12): reset-password, oauth-buttons, forgot-password

- **`reset-password-form.tsx` — clean, minor.** Well-structured, proper `autoComplete="new-password"`, error handling. **Issues:** (1) the eye-toggle `Button` is absolutely positioned but the password field doesn't get right padding for it (unlike `Input`'s own `showPasswordToggle` which the form doesn't use — it hand-rolls a duplicate toggle), so the eye may overlap typed text; (2) it doesn't show password-strength feedback even though `checkPasswordStrength` exists in `auth-helpers` (unused); (3) `text-red-800`/`bg-red-50` are standard Tailwind (resolve) — so the error box here actually renders red, unlike the `feedback-*` Alerts. Solid overall.

- **`oauth-buttons.tsx` — P1 security/UX mismatch.** (1) **Microsoft button calls `signInWithProvider('microsoft-entra-id')`, but `auth.ts` only configures Google + Credentials providers** (no Entra ID provider registered, v2). So clicking Microsoft hits NextAuth with an unknown provider → error/redirect to `/auth-error`. The Microsoft button is **non-functional** — a dead auth path presented as working. (2) `signInWithProvider` is a server action that calls `signIn(provider, { redirectTo })` which **throws `NEXT_REDIRECT`** — the `try/catch` here will catch the redirect as an "error" and show `toast.error('Failed to sign in')` _even on success_ (same class as the `getAuthErrorMessage` NEXT_REDIRECT handling in auth-actions). So Google sign-in likely flashes a false error toast. (3) Ties to the v2 finding that OAuth auto-creates VIEWER users with no allowlist — the button is the entry point to that gap.

- **`forgot-password-form.tsx` — clean, good.** Proper success-state pattern (doesn't reveal whether the account exists — matches the server's neutral message; good security). `AuthFormFooter` composed. `bg-red-50/text-red-800` standard (renders). No real issues — one of the best components in the codebase. Minor: no rate-limit feedback if the server throttles.

**Auth-layer summary:** the forms themselves are the highest-quality, most consistent code in the repo (proper RHF + zod, neutral security messaging, standard Tailwind error styling that actually renders). The real issues are (a) the **Microsoft OAuth button is wired to an unconfigured provider** (dead), (b) OAuth server actions' `NEXT_REDIRECT` likely triggers false error toasts, and (c) the pre-existing server-side auth P0s from v1–v2 (`signInWithCredentials` undefined `result`, JWT never re-checks `isActive`, OAuth auto-VIEWER) that these forms depend on. The login form (batch 1) shares the false-error-toast risk via the broken action.

## Round 2 — Layout (finishing the batch)

**`TopBar.tsx`**

- **P1 — `isMobile` via `window.innerWidth` computed at render, not reactive.** `const isMobile = globalThis.window !== undefined && window.innerWidth <= 767` runs once per render with no resize listener and **`false` on SSR** → hydration mismatch (server renders desktop menu, client may switch). It gates whether the user dropdown includes Logout (`mobileItems` vs `desktopItems`) and whether a separate Logout button shows. On a resize from desktop→mobile the menu doesn't update until an unrelated re-render. `MainLayout` already computes `isMobile` via `useMediaQuery` — TopBar recomputes it differently → two sources of "is mobile" that can disagree. _Confirms pattern: SSR/hydration via non-reactive `window` (MainLayout batch 3)._
- **P1 — Dead routes in the user menu:** `/profile` and `/help` are not in the app tree (only `(dashboard)/{dashboard,clients,suppliers,services,documents,reports,settings}`). Two dead menu links. _Confirms pattern: dead routes (`/invoices`, `/loading-orders`, `/import` earlier)._
- **P2 — `signOut({ redirect: false })` then `router.replace('/login')`** — fine, but doesn't call the server `signOutUser` action (which writes the LOGOUT audit log via the `events.signOut` callback). Client `signOut` from `next-auth/react` _does_ trigger the event, so audit is preserved — OK, but two logout paths exist (`auth-actions.signOutUser` and this).
- **P2 — `bg-neutral`** (no shade) is not a valid utility (globals defines `--neutral-*` but no `.bg-neutral`) → header background likely transparent/inherits. _Confirms pattern: phantom/malformed classes (`bg-neutral` also in Sidebar/MobileMenu)._
- **P2 — `items as any` cast** to satisfy `DropdownMenu` (the `false`-free array is fine, but the cast hides the divider-union typing). `hover:bg-row-hover` is not defined (`.row-hover` is a `:hover` rule, not a `bg-row-hover` utility) — inert.

**`MobileMenu.tsx`**

- **P1 — `<dialog>` misuse (same as `Modal`, batch 3).** Renders `<dialog aria-modal>` but never `.showModal()`; visibility is via `translate-x`/`opacity`. A native `<dialog>` without the `open` attribute is `display:none` in most UAs — so **the entire mobile menu may not render at all** unless a global stylesheet forces `dialog { display: ... }` (globals.css has no such rule). This is a concrete "mobile nav might be invisible" risk. _Confirms pattern: `<dialog>` without `showModal()` (Modal)._
- **P1 — No focus trap / focus management** (unlike `Modal` which uses `useFocusTrap`). Opening the menu doesn't move focus into it; Tab escapes to the page behind the backdrop. A11y regression for the primary mobile nav.
- **P1 — Renders `navigation` unfiltered** — same RBAC gap as `Sidebar` (batch 3): mobile users see Settings/Reports links they can't access. `filterNavigationByPermissions` unused here too. _Confirms pattern: nav ignores RBAC (Sidebar)._
- **P1 — Renders `item.children` (Documents → Invoices/Loading Orders/Delivery Notes)** which route to `/documents/invoices` etc. — dead routes. _Confirms pattern: dead document routes._
- **P2 — `depth > 0 && 'ps-9'`** — here it's the _correct_ `ps-9` (not the malformed `ps-9)]` in `Sidebar`), so the Sidebar version is confirmed a typo unique to that file. Phantom classes present: `nav-item`, `nav-item-active`, `icon-sm`, `badge badge-active`, `bg-neutral`, `logo rounded-radius-md` (`rounded-radius-md` is malformed — should be `rounded-md`; `--radius-md` exists as a var but `rounded-radius-md` is not a utility), `bg-row-hover`, `avatar`. `nav-item`/`icon-sm`/`avatar`/`logo` DO resolve (globals); `bg-neutral`/`bg-row-hover`/`rounded-radius-md` do not. _Confirms pattern: mixed real+phantom classes._
- **P2 — `if (typeof document === 'undefined') return null`** after hooks — fine (hooks run first), but the portal renders even when `!isOpen` (just off-screen). Minor perf; the `dialog` display issue dominates.

**`breadcrumbs-utils.ts`**

- **P1 — Duplicate, conflicting breadcrumb implementations.** This file exports `getBreadcrumbs(pathname)` (segment-based, with `ROUTE_LABELS`, dynamic-id detection). **`navigation-config.ts` ALSO exports `getBreadcrumbs(pathname)`** (nav-tree-based, starts with "Home"). Both are exported; `layout/index.ts` re-exports _this_ one and `navigation-config`'s via `export *` → **name collision in the barrel** (`export *` from two modules exporting the same `getBreadcrumbs`). In Theory this is a build error or one silently shadows the other. At minimum, two different breadcrumb behaviors depending on import path. _Confirms pattern: duplicated-but-divergent logic (email ×2, hasPermission ×2, cn ×2, ServicesTable ×2)._
- **P2 — `ROUTE_LABELS` includes `invoices`, `audit`** — routes that don't exist — and maps `dynamic segment → "Details"` generically, so a client detail breadcrumb reads "Clients › Details" instead of the client name. Acceptable, but the dead-route labels reinforce the missing-module theme.
- **P2 — CUID regex `^c[a-z0-9]{20,}$`** — Prisma `cuid()` v1 starts with `c`; fine. But `cuid2` (if ever adopted) isn't `c`-prefixed → would render raw id in breadcrumb. Minor future risk.

**`layout/index.ts` (P1):** the `export *` from both `./navigation-config` and `./breadcrumbs-utils` (both defining `getBreadcrumbs`) is the concrete collision. Also `export *` from `./MobileMenu`/`./Sidebar`/`./TopBar` which import `useLayout` from `./MainLayout` — and `MainLayout` imports `{ Sidebar, MobileMenu, TopBar } from '@/components/layout'` (the barrel) → **circular import through the barrel** (same risk flagged for `ui/index.ts`). Could yield `undefined` components at init. _Confirms pattern: barrel circular imports (ui/index.ts)._

## Round 2 — UI primitives (unread set, part 1)

**`Breadcrumbs.tsx` (P1)**

- **Imports `getBreadcrumbs` from `@/components/layout/breadcrumbs-utils`** — a **UI primitive depending on the layout feature module** (inverted dependency; primitives should not import from feature/layout). Combined with the `layout/index.ts` barrel collision, if `Breadcrumbs` ever imported from `@/components/layout` it'd get the wrong `getBreadcrumbs`. Here it imports the file directly, so it gets the segment-based one — but the app's `Sidebar`/`navigation-config` uses its _own_ `getBreadcrumbs`, so **two breadcrumb sources render different trails** depending on which component draws them. _Confirms pattern: duplicated-but-divergent logic._
- **P2 — `showHome` always renders a Home chevron then the breadcrumbs, and `breadcrumbs` already dropped `dashboard`** — but the segment logic pushes a crumb for the first non-dashboard segment with `index > 0` guard for the separator, so a single-segment path (e.g. `/services`) renders "🏠 › Services" correctly. Fine. Uses standard `text-neutral-*` (resolve). Clean otherwise. Is `Breadcrumbs` even used? It's not imported by `MainLayout`/`TopBar`/pages I've seen (ServiceHeader has it commented out) → **likely orphaned** like `OldServiceTable`. _Confirms pattern: dead/unused code._

**`Radio.tsx` (P1)**

- **All radios share `ref={ref}`** — the same forwarded `ref` is attached to _every_ `<input>` in the `options.map`, so only the last wins; RHF `register` ref-based focus/validation targets the wrong element. Radio groups with `register` won't focus-on-error correctly.
- **P2 — `{...props}` spread onto every option input** means `id`, `aria-*`, etc. get duplicated across all radios (duplicate `id`s → invalid DOM). And `aria-describedby={\`${name}-error\`}`on the group, but the error`id`uses`name`which may be undefined.`border-danger`, `text-danger`, `text-primary`—`text-primary`resolves,`border-danger`/`text-danger`**inert** (styles). Error text not red. *Confirms pattern: undefined`danger`theme classes.* Is`Radio` used anywhere? I haven't seen a consumer — possibly orphaned.

**`Label.tsx` (P1 — theme classes)**

- Uses `cva` (class-variance-authority) — the only component using it. **Every variant color is an undefined theme class:** `text-error-600`, `text-error-400`, `text-success-600`, `text-success-400`, `text-error-500`. globals.css defines `--error-text`/`--success-text` vars but **no `text-error-600`/`text-success-600` utilities** (no `@theme` registration). So the error/success label variants and the required-asterisk (`text-error-500`) **render in default/inherited color, not red/green**. The whole point of the variant component is defeated. _Confirms pattern: missing `@theme` → `error-_`/`success-_`utilities inert (Alert`feedback-_`, PermissionMatrix `success-_`, UserForm `info-_`).\* Logic itself (variant precedence, helper color) is fine.

**`Logo.tsx` (P1 — branding + theme)**

- **Renders the literal text "Enterprise"** and `aria-label="Enterprise Dashboard Home"` — the old project name shipped to users again. _Confirms pattern: "Enterprise Dashboard" branding leak (schema, email, welcome, NewUserWelcome, now Logo)._ The actual app uses `companyName` from settings elsewhere (Sidebar/TopBar), so `Logo` is inconsistent with the dynamic branding — and where is `Logo` used? Not in Sidebar/TopBar/MobileMenu (they render a plain `div.logo`), so `Logo` may be **orphaned** too.
- **P2 — `colors.default = 'text-primary-600 dark:text-primary-500'`** — `text-primary-600`/`text-primary-500` are unregistered → the default logo has no color (currentColor inherits body). `text-primary` (the working utility) isn't used here. `LogoContentProps.colors/sizes: any`. `default href="/"` — `/` isn't a real route in the dashboard group (redirects to login/dashboard). Minor.

## Round 2 — UI primitives (unread set, part 2)

**`Spinner.tsx` (clean, P2):** Good — `<output>` element with `aria-label` + `sr-only` (proper a11y). `text-primary` resolves; `text-white`/`text-current` fine. `LoadingOverlay` is a bonus. Only note: `color="primary"` → `.text-primary` (works). No real issues. One of the genuinely-clean primitives.

**`Skeleton.tsx` (P2):**

- **`animation="wave"` → class `skeleton-wave`** which is **not defined** in globals.css (globals defines `.skeleton` with a `::after` shimmer, but no `.skeleton-wave`). So `variant`/`animation="wave"` renders a static block. `.skeleton` itself resolves (globals) and already has its own shimmer `::after`, which will **double up** with `animate-pulse` when `animation="pulse"` (default) — the base `.skeleton::after` shimmer + Tailwind `animate-pulse` both run. Minor visual. _Confirms pattern: phantom classes (`skeleton-wave`)._
- **P2 — `SkeletonGroup` uses `key={\`${baseId}-item\`}`** — **identical key for all N items** (no index) → React duplicate-key warning + reconciliation issues, exactly like `Pagination`'s ellipsis key bug. _Confirms pattern: duplicate React keys (Pagination)._
- `<output>` for a skeleton is semantically odd (output implies a calc result) but harmless.

**`ErrorState.tsx` (P1):**

- **`variant="inline"` renders `<Alert variant="error">`** — which per the styles finding has **inert `feedback-error-*` background** → the inline error has no red background, just default text. `variant="card"`/`"full"` use `text-red-500` (standard, resolves) so those work. So `ErrorState` looks fine in card/full but broken in inline. `RevenueChart` uses `variant="full"` ✅, `RecentServices` uses `variant="card"` ✅, `ServiceChart` `variant="full"` ✅ — so consumers avoid the broken `inline` variant by luck. _Confirms pattern: `feedback-_` Alert classes inert.\*
- **Note:** `DataTable` (batch 1) defines its **own local `ErrorState`** shadowing this one, and reloads the page on retry — so there are two `ErrorState`s. _Confirms pattern: duplicated components._

**`PageHeader.tsx` (clean):** Simple, correct, standard `text-neutral-*` classes (resolve). `SystemSettings`/`ServicesHeader` use it correctly. No issues. Note it accepts `children` for actions but `ServicesHeader` (dashboard/Header) wraps it and puts the button _outside_ PageHeader instead of as children — minor inconsistency, not a bug.

**Primitives round-2 net:** The genuinely-clean primitives are `Spinner`, `PageHeader`, `Tabs`, `Pagination` (minus key bug), `EmptyState`. The theme-dependent ones (`Label`, `Radio`, `Alert`, `ErrorState` inline) are visually degraded by missing `@theme`. Several primitives appear **orphaned** (`Radio`, `Logo`, `Breadcrumbs`) — no consumers found.

## Round 2 — Users feature pair + CompanyForm

**`users/users-list.tsx` (P1 — duplicate + non-functional + theme):**

- **This is a THIRD user-listing implementation**, parallel to `settings/UserManagement.tsx` (DataTable-based) and its `UserForm`. `UsersList` is a hand-rolled `<table>` with its own selection state, its own checkbox handling, its own role badge rendering. It duplicates `UserManagement` with _different_ behavior. _Confirms pattern: duplicated-but-divergent components (ServicesTable/OldServiceTable, ErrorState ×2, getBreadcrumbs ×2)._
- **P1 — The Actions button (`MoreVertical`) has no `onClick`** — completely dead; no menu, no handler. Selection state (`selectedUsers`) is tracked but **never used** (no bulk actions rendered). So this entire component is a read-only table with dead affordances. Likely orphaned (the settings page uses `UserManagement`).
- **P1 — Theme classes inert:** `bg-primary-100 text-primary-600 dark:bg-primary-900` (avatar), `text-success-600` (email verified / 2FA) — none registered → avatar has no bg tint, "Email Verified"/"2FA Enabled" text not green. `getRoleBadgeColor` returns `bg-purple-100 text-purple-800` etc. (standard Tailwind, resolves). _Confirms pattern: `primary-_`/`success-_` undefined._
- **P2 — select-all `checked={selectedUsers.length === users.length}`** is `true` when `users` is empty (0 === 0) → checkbox checked with no users. Same empty-edge bug family.

**`users/create-user-dialog.tsx` (P1 — completely non-functional):**

- **The dialog does nothing.** It renders an "Add User" button that sets `_open` state (note the `_` prefix — deliberately marked unused), but **there is no dialog/modal rendered at all**. Clicking it toggles a state variable that's never read. This is a stub shipped as a feature. Combined with `UsersList`'s dead actions, the entire `features/users/` directory appears to be an **abandoned earlier attempt** superseded by `features/settings/UserManagement` + `UserForm`. _Confirms pattern: dead/stub code presented as feature._ Recommend deleting `features/users/` after confirming no page imports it.

**`settings/CompanyForm.tsx` (P1 — the one solid settings form, with real issues):**

- **Best-structured settings form** — proper file validation (size + MIME allowlist), FileReader→base64, preview, remove, `disabled={!canEdit}` throughout, `isDirty` gating. Good.
- **P1 — Client-side MIME check only.** `handleLogoChange` checks `file.type` (client-reported, spoofable) and size, then base64-encodes and sends to `updateCompanySettings` → `uploadLogoToB2` (settings-actions), which does its own regex parse but **no magic-byte validation** (the storage `validateFile` with `file-type` isn't used on this path — it uploads via a separate inline S3 client). So logo upload bypasses the content-sniffing that `storage/service.ts` provides. _Confirms pattern: MIME validation by extension/type only (storage/service.ts)._
- **P1 — Base64 image round-trips through the form and server action.** A 2MB logo becomes ~2.7MB base64 in the RHF state, the server action payload, and (on re-edit) is re-hydrated as the `logo` default. Large server-action payloads; and `updateCompanySettings` stores the _uploaded URL_ but the form re-loads `initialData.logo` (URL) so re-edit is fine — but the initial dirty check may fire oddly. `text-danger` on the remove-X is inert (styles). `icon-sm` resolves.
- **P2 — `CompanySettings` maps to the `Company` model** where `updateCompanySettings` (settings-actions, v3) hardcodes `city: 'Default City', postalCode: '00000'` on create and only stores `addressLine1` from the multi-line `address` textarea — so **city/postal/country from the address are lost** (the schema has structured address columns but the form uses one freeform textarea). Domain data-model mismatch: structured `Company` columns vs freeform UI. _Confirms pattern: Json/freeform vs normalized columns (schema review)._

## Round 2 — General & PDF settings

**`General.tsx` (P1):**

- **P1 — Feature toggles are configured but not enforced anywhere.** `enableTwoFactor` ("Require 2FA for all users"), `enableNotifications`, `enableAutoBackup`, `requireClientVat` are saved to `SettingKey.GENERAL`, but: 2FA is never enforced (auth.ts has `twoFactorEnabled` on the user but no 2FA challenge flow exists); `requireClientVat` isn't checked by `clientSchema` (VAT is `.optional()`); `enableAutoBackup` duplicates the `backup.enabled` toggle (two switches for the same non-existent scheduler). All four are **dead toggles**. _Confirms pattern: configurable features not wired (number sequences, multi-provider email, backup scheduler)._
- **P1 — `defaultVatRate`/`defaultIrpfRate`/`itemsPerPage`/`autoArchiveMonths` are collected but ignored by the code that would use them.** `createService` hardcodes `costVatRate ?? 21` (doesn't read the setting); pagination hardcodes 50 (service-actions) / 20 (db-helpers); there's no auto-archive job. So the regional/tax defaults don't propagate. _Confirms pattern: settings→runtime gap._
- **P1 — `Controller` without a `key`, `FormField` has the `key`.** The `.map` puts `key={toggle.name}` on `FormField` (inside the Controller's render), not on the `Controller` itself → React key warning (key belongs on the mapped element, which is `Controller`). _Confirms pattern: key-placement bugs (Pagination, Skeleton)._
- **P1 — `Switch {...field}` double-binding** (batch 5) in every toggle: spreads RHF `field` (value/onChange/ref) onto `Switch` which ignores them, then relies on `checked`/`onCheckedChange` + `setValue`. RHF `ref`/validation dead. `Input {...field} type="number"` for VAT/IRPF passes string values (no `valueAsNumber`), so the rates save as strings → the zod schema must coerce or they're wrong types. _Confirms pattern: Switch double-binding + number-input-as-string._
- **P2 — `Select {...field}` for currency/date/time/items** — the custom `Select` ignores `field.value` unless `value` is passed; here `{...field}` passes `value` via spread (works) but `ref`/`onBlur` dropped. `itemsPerPage`/`timeFormat` values are strings (`'10'`, `'24'`) that consumers must parse.

**`PDF.tsx` (P1):**

- **P1 — Entire PDF configuration is dead.** `paperSize`, `includeLogo`, `logoPosition`, `footerText` are saved to `SettingKey.PDF`, but **there is no PDF generation implementation** — `generateLoadingOrder` (service-actions) is a stub that writes a fake path (v1), and no code reads `SettingKey.PDF`. Puppeteer is a dependency (package.json) but unused. So the elaborate paper-size preview, logo-position preview, and footer preview configure a feature that produces nothing. _Confirms pattern: dead feature theater (backups, number sequences, email providers)._ This is a lot of UI (previews, dimension calcs) for zero backend.
- **P1 — `Switch {...field}` double-binding** ×2 (includeLogo, and the pattern). `Label htmlFor` duplicated (two `<Label>` for logoPosition — one in `FormField label`, one inline).
- **P2 — `paperDimensions[paperSize]`** indexed by a watched value that could be `undefined` on first render → falls to `|| paperDimensions.A4` (guarded, OK). `footerText?.length || 0` — `0` falsy-render safe here (it's in a template). `Image` imported from lucide-react shadows the Next.js `Image` concept — cosmetic naming.
- **Positive:** the live preview UX is genuinely nice; it's just wired to a non-existent PDF pipeline.

**Settings round-2 net:** `CompanyForm` is real and mostly works (logo→B2, saves to Company). `EmailConfig` writes DB but runtime ignores it. `Backup`, `Sequence`, `PDF`, and `General`'s toggles/defaults are **all dead** — the Settings area is ~70% configuration UI for capabilities that don't exist (backups scheduler, PDF generation, number-format application, 2FA, tax-default propagation, multi-provider email). This is the single largest concentration of "dead feature theater" in the app and the biggest gap between what an operator believes they've configured and reality.

Now the dashboard files I hadn't opened (`dashboard/Header`, `dashboard/QuickActions`, `dashboard/index`), then re-reads of already-covered begin.

## Round 2 — Dashboard Header & QuickActions

**`dashboard/Header.tsx` (P1 — confirms two divergent copies):**

- **This is a SECOND copy of `DashboardClientComponents`** — the same file header comment, exporting overlapping components (`DashboardRefreshButton`, `DashboardErrorAlert`, `NewUserWelcome`, `PerformanceTip`) as **both** `dashboard/Header.tsx` AND `services/Header.tsx` (batch 10). They differ: this one's `DashboardRefreshButton` calls `refreshDashboardData()` (the server action) while the `services/` copy calls `router.refresh()`; this one adds `DashboardHeader`. Both are exported via their respective barrels. **Two files, same components, divergent behavior, both live.** _Confirms pattern: duplicated-but-divergent (now the most-duplicated file in the repo)._
- **P1 — `DashboardRefreshButton` calls `refreshDashboardData()`** which does `revalidateTag('dashboard', 'default')` — the invalid 2-arg call (v3) that no-ops → refresh button does nothing. And even if fixed, `getDashboardData`'s `unstable_cache` static key means stale data (v3). _Confirms pattern: broken revalidation + per-user cache key._
- **CORRECTED — `PerformanceTip` `formatPercentage(averageMargin)` renders correctly.** The ×100 claim is retracted (helper divides by 100; `Intl` percent re-multiplies).
- **P1 — `NewUserWelcome`: "Welcome to Enterprise Dashboard!" + `/import` dead route.** _Confirms patterns: branding leak + dead route._
- **P2 — `DashboardErrorAlert`** uses `<Alert variant="error">` → inert `feedback-error-*` bg. _Confirms pattern._

**`dashboard/QuickActions.tsx` (P1):**

- **P1 — `console.log('User Role in QuickActions:', userRole)`** on every render — leaks role to console in production. _Confirms pattern: leftover console.log (UserManagement)._
- **P1 — Dense cluster of dead routes:** `/loading-orders/new`, `/invoices/new` (primary actions), `/import` (shortcut, and it just `console.log`s after a fake 1s delay), `/help/getting-started`, `/help/video-tutorials`, `/help/contact` (help resources — none exist), and Export/Send-Notifications shortcuts that only `console.log`. So the entire QuickActions panel is a grid of **buttons that 404 or console.log**. The only working links: `/clients`, `/suppliers`, `/reports`, `/services/new`, `/settings`. _Confirms pattern: dead routes + stub actions (most concentrated instance)._
- **P1 — RBAC gating is correct here** (uses `permissions.can(...)` and `.filter(a => a.show)`), _properly_ unlike `Sidebar`/`MobileMenu`/`UserManagement`. So the component knows how to gate — the nav components just don't. Interesting inconsistency: the same `usePermissions` used correctly here, misused (hook-in-callback) in `UserManagement`.
- **P1 — `mailto:support@example.com`** placeholder support email shipped. `bg-white/10`/`bg-white/20` on primary buttons assume a colored button bg (works for primary via `.button-primary`, but secondary buttons get white-on-white icon boxes). `shortcut.color` + `bg-opacity-10` — `bg-opacity-*` is deprecated in Tailwind v4 (replaced by `/opacity` syntax) → likely inert, so the colored shortcut tiles have full-opacity backgrounds or none. _Confirms pattern: Tailwind class issues._
- **P2 — `hotkey` (Alt+N/L/I) advertised in tooltips but never wired** (no keydown handler) — dead affordance, like `ServiceForm`'s Esc. _Confirms pattern: advertised-but-unimplemented shortcuts._
- **P2 — `QuickActionsWidget` takes `userRole: _userRole` (unused)** then calls `usePermissions()` — the prop is dead; and it links to dead `/invoices/new`.

**`dashboard/index.ts`:** exports `./Header` (the dashboard copy). So the app has _both_ `dashboard/Header` and `services/Header` exporting same-named components via different barrels — import-path-dependent behavior. _Confirms pattern._

**Dashboard round-2 net:** `QuickActions` is a large panel that's ~70% dead links/stubs; `Header` is duplicated with the `services/` copy and carries the formatPercentage/branding/dead-route/broken-refresh cluster; `RecentServices` has the `next/router` crash; `ServiceChart` has dynamic-class purging. The dashboard is heavily built but riddled with dead affordances and the recurring formatting/cache bugs.

The route map confirms which "dead routes" are truly absent. Present routes: `/dashboard`, `/clients` (+[id],[id]/edit,new), `/suppliers` (list only — **no [id]/new**), `/services` (+[id],[id]/edit,new), `/documents` (single page — **no children**), `/reports` (+margins,revenue), `/settings` (+company,system,users). **Confirmed absent:** `/invoices/*`, `/loading-orders/*`, `/documents/invoices`, `/documents/loading-orders`, `/documents/delivery-notes`, `/import`, `/profile`, `/help/*`, `/suppliers/new`, `/suppliers/[id]`, `/clients/[id]` exists but `SupplierSelector` routes to `/suppliers/new` (absent). Also no root `/logout`, `/welcome`, `/auth-error` (referenced in auth.ts `pages` config). Let me read the key pages: root, both layouts, dashboard page, services page/detail, and the api route.

## Round 2 — Root pages & layouts

**`app/page.tsx` (P0 — the root route is the Next.js starter template):**

- The `/` landing page is **the unmodified `create-next-app` boilerplate** — Next.js logo, "To get started, edit the page.tsx file," "Deploy Now"/Documentation links to Vercel. CORRECTED: this is dead code, not an exposure — `next.config.ts` `redirects()` sends `/` → `/dashboard`, and `src/proxy.ts` (the running Next 16 middleware) redirects unauthenticated users to `/login`. Delete the scaffold page content as cleanup, not as a security fix. Uses `bg-foreground`/`text-background` (undefined theme classes) too.

**`app/layout.tsx` (P1 — metadata + branding):**

- **`metadata: { title: 'Create Next App', description: 'Generated by create next app' }`** — the **browser tab title and SEO description are the scaffold defaults** across the entire app. _Confirms pattern: unfinished scaffolding / branding leak (alongside "Enterprise Dashboard")._ So the app is branded three ways: tab = "Create Next App", layout companyName = "Transport ERP", Logo/emails = "Enterprise Dashboard". Three brand identities.
- **P1 — Fonts declared as `Geist`/`Geist_Mono` with CSS vars `--font-geist-sans`/`--font-geist-mono`, but `globals.css` sets `--font-sans` to a system stack and `--font-mono` to SF Mono** — the loaded Geist fonts are **never referenced by the CSS** (globals uses `var(--font-sans)` = system fonts). So the Google-font download happens but the app renders in system fonts. Wasted font load + design intent lost. _Confirms pattern: config not wired to styles._
- **P2 — `SessionProvider` wraps everything** (needed for `useSession` in `usePermissions`/`TopBar`) — correct. But no `ThemeProvider` from `next-themes` despite `RevenueChart`/`ServiceChart` using `useTheme()` and pervasive `dark:` classes → `useTheme()` returns undefined theme, dark mode never activates, and the charts' `isDark` is always false. _Confirms pattern: dark: classes everywhere but no theme provider._
- `<html lang="en">` hardcoded despite i18n intent (`Client.language`, date-fns locales) — minor.

**`(dashboard)/layout.tsx` (P1, mostly good):**

- **`requireAuth()` server-side** — good defense-in-depth behind the running `src/proxy.ts` middleware (which redirects unauthenticated users first). Note `requireAuth` throws `'Unauthorized'`, which would render the Next error page only if the middleware were bypassed (e.g. a matcher gap) — prefer `redirect('/login')` as the layout fallback. _(Earlier "middleware not running" premise retracted.)_
- **`companyName = 'Transport ERP'` hardcoded** — ignores the `Company` settings the `CompanyForm` saves. So the sidebar/topbar company name is static, not the configured one. _Confirms pattern: settings→runtime gap (company branding not read back)._
- **`avatar` commented out**, `role as string` cast. Passes a plain object to `MainLayout` (client component) — fine.

**`app/api/auth/[...nextauth]/route.ts` (clean):** Correct NextAuth v5 handler export. No issues. This is the one API route that exists — confirming `/api/services/export` (used by `ServicesFilters`, batch 3) is **absent** → export fetch 404s. _Confirms pattern: dead endpoint._

## Round 2 — Dashboard, Services, Documents pages

**`dashboard/page.tsx` (P1):**

- **P1 — `metadata.title = 'Dashboard | Enterprise Dashboard'`** — the fourth branding surface, and again "Enterprise Dashboard." _Confirms pattern: branding leak (now in page metadata too)._
- **P1 — `getDashboardData({ userId, dateRange })` is `unstable_cache`d with a static key** (v3 P0): passing `userId` and `dateRange` here has **no effect on the cache key** → all users share one cached dashboard, and the `?range=` param doesn't bust it. So this page's per-user, per-range data is cross-contaminated. The page correctly passes the args; the action's cache config is the bug. _Confirms pattern: unstable_cache wrong key._
- **P1 — `<ServicesChart error={dataError}>` etc. pass `error` but `loading={false}`** while wrapped in `<Suspense>` — but `getDashboardData` already awaited at the top (not a streamed promise), so Suspense never suspends; the skeletons never show. The Suspense/ErrorBoundary scaffolding is decorative here since data is fetched eagerly before render. _Confirms pattern: Suspense misuse._
- **P1 — `isNewUser = totalServices === 0`** — but `totalServices` comes from `currentServices.reduce(...)` in the period, and the `_count._all` cast bug (v3) makes counts read `undefined→0`, so **`totalServices` is likely always 0** → **every user is treated as "new"** → the dashboard shows the `NewUserWelcome` (Enterprise Dashboard + /import) instead of the real dashboard. This is a compounding bug: the groupBy `_count` cast makes the whole dashboard think there's no data. _Confirms pattern: `_count._all` cast → zeros → wrong "new user" branch._
- **P2 — `PerformanceTip` only if `totalServices > 10`** (never, per above). `QuickActionsWidget userRole={session.user.role}` — the `_userRole` unused prop.
- **Good:** granular `ErrorBoundary`+`Suspense` per widget is the right _shape_; auth `redirect('/login')` here works (unlike the layout's throw).

**`services/page.tsx` (P1):**

- **P1 — `metadata`: "Services | Enterprise Dashboard"** — branding again.
- **P1 — Passes `s_filters` (with `status` mapped through `STATUS_URL_MAP`) to `getServices`, which expects `ServiceFiltersAPI`** — but `getServices` (v1) never runs `serviceFilterSchema.parse`, so **`pageSize` is uncapped**: `Number(params.pageSize) || 50` lets `?pageSize=1000000` through to `prisma.take` → OOM/DoS. The schema cap (max 100) exists but is bypassed on this exact path. _Confirms pattern: pagination cap bypassed (v1)._
- **P1 — `ServicesFilters` gets `currentFilters={filters}` where `filters.status` is the raw URL value** (`'confirmed'`), while `getServices` got the mapped enum — consistent here. But `activeFiltersCount` counts `value !== 1 && value !== 50` (magic numbers for default page/pageSize) — brittle; if defaults change, the count breaks. And `sortOrder` default cast `('desc' as const)` but `sortBy`/others are plain — the object's `status: ''` counts as inactive correctly.
- **P1 — Both `ServicesTable` (desktop) and `ServicesMobileView` (mobile) render the same data** with the CSS `hidden lg:block` / `lg:hidden` toggle — so both mount, both compute stats, both carry the `formatPercentage` ×100 bug. Confirms the two-table duplication renders simultaneously (just visually toggled). _Confirms pattern: duplicated table components both live._
- **`ServicesFilters` doesn't receive `selectedServices`/`onSelectionChange`** (optional props) — so its bulk-action UI and select-all are inert on this page (selection lives in `ServicesTable`). The filters' bulk actions are dead here. _Confirms pattern: dead affordance._

**`documents/page.tsx` (P0-ish for the feature):**

- **The entire Documents page is `<div>Documents Page</div>`** — a placeholder. So the "Documents" nav item (and its Invoices/Loading Orders/Delivery Notes children in `navigation-config`) leads to a stub, and the child routes don't exist at all. The whole documents/invoicing domain is unbuilt at the route layer, matching the v2 finding that invoice/payment actions don't exist. _Confirms pattern: dead/stub feature (documents module is a placeholder div)._

The picture is now complete and consistent across schema → actions → lib → styles → components → pages. Let me read the remaining representative pages (services detail/new, an auth page, settings page) to confirm data-flow and close the route layer.

## Round 2 — Services detail/new, Settings, Login pages

**`services/[id]/page.tsx` (P1):**

- **P1 — IDOR confirmed at the page layer.** Checks `hasPermission(role, 'services', 'view')` (role-level) but **no ownership check** — any user who can view services sees _any_ service by id. `checkResourceOwnership` (rbac.ts, written but unused, v1) isn't invoked. And `getServiceWithDetails` (v1) has **no auth gate of its own**, so it's the page's `auth()` that protects it — but `generateMetadata` calls `getServiceWithDetails(id)` **without any auth check at all**, so an unauthenticated request can trigger a DB fetch of any service's data via metadata generation (data exposure through the `<title>` at minimum). _Confirms pattern: IDOR + ungated read (getServiceWithDetails)._
- **P1 — `getServiceWithDetails(id)` is called TWICE** (once in `generateMetadata`, once in the page) — double DB round-trip per detail view, no dedup/`cache()`. _Confirms pattern: no request memoization._
- **P1 — Passes `service` (the `getServiceWithDetails` shape) to `ServiceDetail`/`ServiceHeader`/`ServiceSidebar`** whose prop types don't match (ServiceHeader wants `Service` but reads `.client`/`.urgent`; ServiceSidebar's `Prisma.ServiceGetPayload` annotation doesn't include `invoice`/`attachments`/`editCount`). So the real runtime object is looser than any annotation — type safety is illusory across the detail page. _Confirms pattern: `any`/mismatched service shapes._
- **P2 — `if (!session)` not `!session?.user`** (minor; `auth()` returns session or null).

**`services/new/page.tsx` (P1):**

- **P1 — Uses `getService(params.duplicate)` for duplication**, but `ServiceForm` expects `sourceService` to spread into defaults; `getService` returns a formatted subset (no `costVatRate` etc.) → the duplicate loses fields. And `duplicateFrom={params.duplicate ?? ''}` passes an empty string when not duplicating, but `mode` is `'create'` then — the `AutoSaveManager` enables autosave only when `mode==='create' && !duplicateFrom`, and `''` is falsy so autosave works; OK. `metadata` "Enterprise Dashboard" branding again.
- **P2 — No permission check** — relies on `ServiceForm`/`createService` server-side (`services:create`), so a VIEWER can load the new-service form and only fails on submit. _Confirms pattern: page-level gating absent, relies on action._

**`settings/page.tsx` (P0-ish):** `<div>Settings Page</div>` — **the `/settings` index is a placeholder**. The real settings live at `/settings/company`, `/settings/system`, `/settings/users` (sub-pages). But the Sidebar/TopBar/QuickActions all link to `/settings` (the stub), not the sub-pages, so clicking "Settings" lands on "Settings Page" text with no navigation to the actual forms. _Confirms pattern: stub page + nav points to it._

**`login/page.tsx` (P1):**

- **P1 — `metadata`: "Sign In | Enterprise Dashboard"** — branding.
- **P1 — Renders `<Logo>`** which shows "Enterprise" text and uses inert `text-primary-600` (batch: Logo). So the login page — the app's front door — shows the wrong brand in the logo.
- **P1 — `bg-linear-to-br`** — Tailwind v4 renamed `bg-gradient-to-br` → `bg-linear-to-br` (this is actually _correct_ for v4). But `from-neutral-50`/`to-neutral-100` are standard (resolve). `text-primary-600 hover:text-primary-500` on the forgot-password link — inert (undefined) → link renders in default color, not primary. _Confirms pattern: `primary-_` scale undefined.\*
- **P2 — `redirect('/dashboard')` if session** — good. Links to `/forgot-password` (exists ✅). Terms/Privacy footer commented out (links to `/terms`,`/privacy` which don't exist — correctly disabled).

**Route-layer net (closing the app):**

- **Two stub pages** (`/documents`, `/settings`) that nav links point to → clicking Documents or Settings shows placeholder text.
- **Root `/` = Next.js starter template** (unprotected, since middleware isn't wired).
- **Branding is inconsistent across ~6 surfaces**: tab title "Create Next App" (root layout), page metadata "Enterprise Dashboard" (every page), layout companyName "Transport ERP", `Logo` text "Enterprise", emails "enterprise-dashboard.com". No single brand.
- **`generateMetadata` fetches service data without auth** → data exposure + double-fetch.
- **Pages rely on server actions for authZ** but pass mismatched/`any` service shapes; **IDOR** unaddressed at page and action layers.
- **`getServices` pagination cap bypassed** at the page (DoS vector).
- The `_count._all` cast bug makes the **dashboard treat everyone as a new user**, hiding the real dashboard behind the "Welcome to Enterprise Dashboard" empty state.

---

### Round-2 consolidated register (patterns confirmed, with new instances)

- **`formatPercentage` (CORRECTED):** percent-point call sites (StatsCard averageMargin/trends, ServicesTable, ServiceRow, ServicesMobileView, ServiceDetail VAT+margin, PricingCalculator, PerformanceTip ×2, ServiceForm) render CORRECTLY — do not change them. Only two genuine defects: StatsCard's fraction input (`completed/total` → `0.6%`) and ClientDetail's stray literal `%` (`18.5%%`). Optional: split into fraction/points helpers to remove the ambiguity.
- **`formatCurrency` whole-euro rounding:** every money display app-wide.
- **Undefined theme classes** (`@theme` missing): `text-muted-foreground`/`text-foreground`/`bg-background` (nearly every component), `feedback-*` (Alert/ErrorState-inline), `primary-*` scale (Tabs, Select, DateRangePicker, Logo, login link, Label), `error-*`/`success-*` (Label, Radio, UsersList, PermissionMatrix, UserForm), `bg-neutral`/`bg-row-hover`/`support-*`/`rounded-radius-md`/`skeleton-wave`/`bg-opacity-*` (malformed/inert). → add `@theme`, rename, remove core-utility overrides (`.text-sm/.text-xs/.gap-8`).
- **Dead routes/endpoints:** `/invoices/*`, `/loading-orders/*`, `/documents/{invoices,loading-orders,delivery-notes}`, `/import`, `/profile`, `/help/*`, `/suppliers/new`, `/api/services/export`, `/settings` (stub), `/documents` (stub). Referenced by Sidebar, MobileMenu, TopBar, QuickActions, ServicesTable, ServiceRow, ServiceSidebar, ServiceActions, RelatedDocuments.
- **Duplicated-but-divergent:** email service ×2, `hasPermission` ×2, `cn.ts` ×2, `getBreadcrumbs` ×2, `DashboardClientComponents` ×2 (`services/Header`+`dashboard/Header`), services table ×2 (`ServicesTable`+`OldServiceTable`+`ServiceRow`), user list ×2 (`UserManagement`+`UsersList`), `ErrorState` ×2, three+ inline CSV exporters, B2 config ×3, revenue-status definition ×3.
- **Dead feature theater:** backups scheduler, backup restore, PDF generation, number-sequence formats, multi-provider email (runtime), 2FA, tax-default propagation, auto-archive, `features/users/` (create-user-dialog no-op, UsersList dead actions), documents module.
- **Branding:** "Create Next App" (tab), "Enterprise Dashboard" (metadata/emails/Logo/welcome), "Transport ERP" (layout) — pick one.
- **Controlled/uncontrolled:** Input, TimeInput, Checkbox (indeterminate), DatePicker, Switch (`{...field}` double-bind in every settings form).
- **Client-only guards presented as protection:** ServiceActions invoice-delete, UserManagement/ServiceSidebar dependency & audit gates, page-level permission relies on actions.
- **Crash/build bugs:** `RecentServices` `next/router` import (App Router crash), `UserManagement` `usePermissions()` in `useCallback` (Rules of Hooks), `ServiceChart` dynamic `bg-${trendColor}` (purged), `prisma.ts` missing import + `signInWithCredentials` undefined `result` (v1), `getUser` `findUnique` non-unique where (v2), `revalidateTag('dashboard','default')` no-op, `_count._all` cast → dashboard always "new user", stray empty `auth.config.ts` (delete it; `src/proxy.ts` is the correct, running Next 16 middleware — earlier "missing middleware.ts" claim retracted).
- **Scaffolding unfinished:** root page, root metadata, Geist fonts loaded-but-unused, no ThemeProvider (dark: classes + useTheme inert).
- **Data/security:** `generateMetadata` ungated fetch, IDOR (no ownership checks), `getServices` uncapped pageSize, audit logs expose pricing/PII, secrets (email apiKey/password, generated passwords) to client, `Math.random` passwords.

## Round 2 — Auth components + verify-email page

**`resend-verification-form.tsx` (clean, one connection):**

- Well-structured, neutral success message ("If an account exists…and hasn't been verified"). Good security posture. `bg-red-50/text-red-800` standard (renders). **Connection (P1):** its server action `resendVerificationEmail` (auth-actions, v2) sends the verification email **inline** with no rate limit on that path — so this public form is an unauthenticated email-send trigger (an attacker can spam verification emails to any address). _Confirms pattern: unbounded email-send on public form (auth authorize + this)._ The form itself is fine; the server action is the exposure.

**`auth-forms-footer.tsx` (P1):**

- **P1 — `<Button asChild>` wrapping `<Link>`** — but `Button.asChild` is a **declared-but-unimplemented prop** (batch 5): `Button` never renders its child as the element; it always renders a `<button>`. So `<Button asChild><Link>…</Link></Button>` produces `<button><a>…</a></button>` — **an anchor nested inside a button** (invalid HTML, broken navigation: clicking may not navigate, or double-activates). This pattern repeats in `verify-email` (`<Button asChild><Link>`), and anywhere `asChild` is used. _Confirms pattern: `Button.asChild` dead prop → nested interactive elements._ This is the concrete consumer that makes the `asChild` gap a real bug, not theoretical.
- **P1 — `supportHref="/support"`** default and `backHref` fine (`/login` exists), but **`/support` doesn't exist** → "Contact support" 404s. _Confirms pattern: dead route (`/support`, joining `/help`)._
- **P2 — `text-primary-600 hover:text-primary-500`** inert (undefined scale). Support link renders in default color.

**`auth/index.ts`:** clean barrel. Missing semicolons (cosmetic). Exports match consumers.

**`verify-email/page.tsx` (P1):**

- **P0 — `metadata: Metadata` but `Metadata` type is never imported.** Unlike other pages (`import type { Metadata } from 'next'`), this file references `Metadata` with no import → **TypeScript compile error**. This page won't build. _Confirms pattern: build-breaking (prisma.ts, signInWithCredentials) — add verify-email to the list._
- **P1 — Defines its OWN local `ErrorState` and `SuccessState`** — shadowing the shared `@/components/ui/ErrorState` (which is even imported indirectly). So now there are **three `ErrorState`s** (ui/ErrorState, DataTable's local, this page's local). _Confirms pattern: duplicated ErrorState/components._
- **P1 — `verifyEmailToken(token)` runs on GET render** — email verification via a server-rendered GET is standard, but it means **link prefetch/scanners (email security bots, antivirus, Slack/Outlook link preview) will consume the single-use token** before the user clicks, marking the account verified or burning the token → user clicks and sees "invalid link." This is a real-world "why did verification fail" pain. Verification-by-GET should require a POST confirmation or be idempotent. _Confirms pattern: token single-use consumed by GET (also the reset-password flow via `verifyEmailToken`/`resetPasswordWithToken`)._
- **P1 — `<Button asChild><Link>`** nested-interactive bug (SuccessState "Sign in", ErrorState "Resend"). _Confirms pattern._
- **P1 — `Logo` "Enterprise" + metadata "Enterprise Dashboard"** branding, `bg-linear-to-br` (v4-correct), `text-red-*`/`text-green-*` standard (render). _Confirms pattern: branding._

## Round 2 — Auth pages (register/reset/check-email/layout)

**`register/page.tsx` (P0 — mislabeled + missing form):**

- **The file is a duplicate of `login/page.tsx`** — header comment `// Login Page`, renders `<LoginForm>` and `<OAuthButtons>`, title "Sign In | Enterprise Dashboard", heading "Welcome back". **The `/register` route shows the LOGIN form, not a registration form.** There is a `RegisterForm`? No — I never saw one; the auth barrel exports `LoginForm/OAuthButtons/ForgotPasswordForm/ResetPasswordForm/ResendVerificationForm/AuthFormFooter` but **no `RegisterForm`**. So registration is **completely unreachable via UI** — the `/register` route and the login page's "Sign up → /register" link both land on the login form. `registerUser` (auth-actions) exists but has no form. _Confirms pattern: dead/duplicated page + missing feature (no RegisterForm)._ This is a P0 for any self-service signup flow.
- Only difference from `login/page.tsx`: adds the "Don't have an account? Sign up → /register" link (which loops back to itself). Circular dead link.

**`reset-password/page.tsx` (P1):**

- **P0 — `metadata: Metadata` with no `import type { Metadata }`** — same compile error as `verify-email`. This page won't build either. _Confirms pattern: build-breaking missing Metadata import (verify-email, now reset-password)._
- **P1 — `AuthFormFooter hideSupportLink`** → renders the back link via `<Button asChild><Link>` → nested `<button><a>` invalid HTML. _Confirms pattern: asChild nested interactive._
- **P1 — `Logo` "Enterprise" branding, `text-primary-600` inert links.** Token-present/absent handling is correct (good UX). `bg-linear-to-br` v4-correct.

**`check-email/page.tsx` (P1):**

- **P1 — `bg-primary-100 dark:bg-primary-900/30` + `text-primary-600`** — undefined `primary-*` scale → the email icon circle has **no background tint** and default icon color. Same across all these auth pages. _Confirms pattern: primary-_ undefined.\*
- **P1 — Correctly imports `Metadata`** (unlike verify-email/reset-password) — so the missing-import bug is inconsistent across sibling pages (some import, some don't), confirming it's a real per-file defect not a global config. `Logo` "Enterprise" branding.
- `AuthFormFooter` → nested-button issue. `/resend-verification` link (exists ✅).

**`(auth)/layout.tsx` (P1):**

- **P1 — Double gradient background.** The layout wraps children in `bg-linear-to-br from-neutral-50 to-neutral-100`, and **every auth page** (`login`, `reset`, `check-email`, `verify-email`) _also_ renders its own full-screen `bg-linear-to-br` div. So the gradient is applied twice (layout + page), and the pages' `min-h-screen` inside the layout's `min-h-screen` double the height context. Redundant; the pages ignore the layout's styling. Indicates the layout was added later and pages weren't refactored. _Confirms pattern: layered/duplicated styling._
- **P2 — No `<Logo>`/branding/`ThemeProvider` in the auth layout**; each page repeats the Logo+card scaffold (heavy duplication across 6 auth pages — the card wrapper, gradient, max-w-md are copy-pasted). The "reduce duplication" theme applies strongly to the auth pages. Also the layout doesn't redirect authed users (each page does it individually) — could be centralized.

**Auth pages net:** The auth _forms_ are clean, but the auth _pages_ have: a **non-existent registration flow** (register page = login page, no RegisterForm) — P0; **two pages that don't compile** (missing `Metadata` import) — P0; pervasive `Button asChild` nested-anchor invalid HTML; `primary-*`/branding degradation; and heavy scaffold duplication + double-gradient layout. The single most important functional gap: **users cannot register through the UI** despite a working `registerUser` action.

The `settings/layout.tsx` is a major find. Findings:

## Round 2 — ServiceSkeleton, Settings layout, Users page, Clients page

**`ServiceSkeleton.tsx` (clean, one note):** Object with `.Stats/.Chart/.Table` JSX factories. `dashboard/page.tsx` uses `ServiceSkeleton.Stats/.Chart/.Table` ✅. Uses `Card`/`Skeleton` (resolve). **P2:** `.skeleton h-[350px]` — `.skeleton` resolves and already has a shimmer `::after` + the `Skeleton` component adds `animate-pulse` → double animation. Minor. Not a JSX component itself (object of render fns), so `<ServiceSkeleton.Stats />` works but can't take props/refs. Fine.

**`settings/layout.tsx` (P1 — the settings nav is almost entirely dead + broken RBAC source):**

- **P1 — 6 of 8 settings nav links are dead routes.** `navItems` lists: `/settings/profile`, `/settings/security`, `/settings/company` ✅, `/settings/users` ✅, `/settings/system` ✅, `/settings/backup`, `/settings/audit`, `/settings/permissions`. Only **company/users/system exist** as routes (per the app tree). `/settings/profile`, `/settings/security`, `/settings/backup`, `/settings/audit`, `/settings/permissions` **don't exist** → 5 dead settings links. And `/settings` index itself is the `<div>Settings Page</div>` stub. So the settings section's own sidebar is mostly 404s. _Confirms pattern: dead routes (settings sub-pages)._ Also `UsersPage`'s non-view redirect goes to `/settings/profile` (dead) → redirect loop into a 404.
- **CORRECTED — `pathname` from `headers().get('x-pathname')` should work.** The header is set by `src/proxy.ts`, which IS the running Next 16 middleware (proxy convention, Node runtime). The earlier "header always empty / nav never active" claim rested on the retracted middleware-not-running finding. Verify active-state behavior at boot before changing anything here.
- **P1 — RBAC roles here disagree with `permissions.ts`.** This layout hardcodes its own `roles` per nav item (e.g., Company Info allows ACCOUNTANT; `permissions.ts` `SETTINGS:VIEW` is SUPER*ADMIN/ADMIN/MANAGER — no ACCOUNTANT). A **fourth** permission definition (after `permissions.ts`, `auth-helpers.hasPermission`, and the per-component `hasPermission` calls). \_Confirms pattern: divergent permission definitions (now ×4).*
- **P1 — `canAccessRoute(userRole, '/settings')`** gates the whole section — but `ROUTE_PERMISSIONS['/settings']` = SUPER_ADMIN/ADMIN/MANAGER, so a MANAGER passes and sees "Company Information" (their `roles` include MANAGER) but `updateCompanySettings` requires `settings:edit` = SUPER_ADMIN/ADMIN only → MANAGER sees the company form read-... actually `CompanyForm` gets `canEdit` from the page. Layering of three different gates (route, layout nav roles, action permission) that don't align.
- **P2 — `-mt-12` / `-mt-2` negative margins** to visually pull content under the PageHeader — brittle layout hack; `PageHeader` + `-mt-12` will overlap on some breakpoints.

**`settings/users/page.tsx` (P1):**

- **P1 — `metadata`: "User Management | Transport Management System"** — a **FIFTH** brand name ("Transport Management System"), distinct from "Transport ERP"/"Enterprise Dashboard"/"Create Next App"/"Dashboard". _Confirms pattern: branding chaos (now 5 distinct names across the app)._
- **P1 — Non-view redirect → `/settings/profile`** (dead route). Should be `/dashboard` or `/settings`. _Confirms pattern: dead route redirect._
- **P1 — Fetches users with `_count: { services, auditLogs }`** but `UserManagement`'s `User` interface expects `_count: { services }` only — extra field is harmless, but note **`UserManagement` renders `DataTable` and has the `usePermissions()`-in-`useCallback` Rules-of-Hooks crash (batch 3)** → this page will crash on render for admins. So the entire User Management page is broken by that hook violation. _Confirms pattern: UserManagement hook crash reached via this page._
- **P2 — No cap on `findMany`** (all users) — fine for small teams, unbounded for large orgs. Duplicate data-fetch: `getUsers` action exists (user-actions) but this page queries Prisma directly, bypassing the action's auth wrapper (`withPermission`). _Confirms pattern: page bypasses action layer._

**`clients/page.tsx` (P1 — the best-architected page, confirming client module quality):**

- **Cleanest page in the app.** Proper `Suspense` with real streaming (`ClientsContent` is an async child, so Suspense actually suspends — unlike dashboard/services which await before render), permission flags computed and passed to `ClientsTable`, `getClients`/`getClientCountries` in parallel, error handling via `ActionResult`. Uses `<Breadcrumbs>` (the orphaned component — so it IS used here, retract "orphaned"). _Confirms pattern: client module is the reference-quality vertical (client-actions was also the best action)._
- **P1 — `limit: 50` hardcoded**, ignores `general.itemsPerPage` setting (dead setting). `sortBy`/`sortOrder` passed as raw strings — but `clientFilterSchema` (client-schema) validates `sortBy` against an enum, so injection-safe. _Confirms pattern: settings→runtime gap (itemsPerPage)._
- **P2 — `metadata`: "Clients | Dashboard"** — yet another brand variant ("Dashboard"). `Breadcrumbs` uses the segment-based `getBreadcrumbs`. Good page overall.

**Net:** The **client vertical (page + actions + schema)** is consistently the highest quality — it's the template the rest should follow. The **settings section** is the worst: mostly-dead nav (5 of 8 links 404), broken active-state (empty `x-pathname`), a 4th divergent RBAC table, a 5th brand name, and its main Users page crashes via the hook violation.

Confirmed: **Suppliers, Reports, and Margins pages are all placeholder `<div>` stubs.** Findings:

## Round 2 — Suppliers / Reports / Margins stubs + Client detail

**`suppliers/page.tsx` — P0 (feature-level):** `<div>Suppliers Page</div>`. The **entire Suppliers module is unbuilt** at the route layer — no list, no detail, no new/edit. Yet: the nav links to `/suppliers`, `ServiceForm`'s `SupplierSelector` routes "Create New Supplier" → `/suppliers/new` (also absent), services reference suppliers heavily, and `getClientsAndSuppliers` fetches them. So suppliers can be _selected_ on a service but there's **no way to view, create, or manage them through the UI**. This is a core domain gap (a transport brokerage's cost side is suppliers). _Confirms pattern: stub page + nav/selectors point to non-existent routes._

**`reports/page.tsx` — P0 (feature-level):** `<div>Reports Page</div>`. The **Reports index is a stub**, yet `StatsCard` links to `/reports/revenue` and `/reports/margins`, `PerformanceTip`/`dashboard Header` link to `/reports/margins`, nav links to `/reports`.

**`reports/margins/page.tsx` — P0:** `<div>Margins Page</div>` — stub. So the margin report (linked from StatsCard, PerformanceTip, ServiceChart tooltips) shows placeholder text. The `revenue` page I'd expect is likely the same. So the **entire Reports/analytics section is stubs**, despite the dashboard heavily promoting "View Margin Report" / "View Reports" CTAs. _Confirms pattern: dead feature theater — reports promoted everywhere, unbuilt._

Combined with `documents`/`settings` stubs: **5 route stubs** (`/suppliers`, `/reports`, `/reports/margins`, `/documents`, `/settings`) that primary navigation and dashboard CTAs point to. A user clicking Suppliers, Reports, or Documents from the sidebar lands on placeholder text.

**`clients/[id]/page.tsx` — P1 (reference quality, one shared bug):**

- **Best detail-page pattern in the app:** async `ClientDetailContent` inside `Suspense` (real streaming), auth + `canView` redirect, `notFound()` on missing, `ActionResult` error handling, permission flags to `ClientDetail`. This is how `services/[id]` _should_ be structured (services detail double-fetches and has no ownership check).
- **P1 — `generateMetadata` calls `getClientById(id)` with no auth** (same as services detail) → data exposure via `<title>` + **double fetch** (metadata + content both call `getClientById`). `getClientById` (client-actions) _does_ have `requirePermission('clients','view')`, so unlike `getServiceWithDetails` it's gated — but `generateMetadata` runs it, so an unauthenticated metadata request triggers a `requirePermission` throw inside metadata generation (renders error, not clean). Still double-fetches. _Confirms pattern: generateMetadata ungated/double-fetch (services detail)._
- **P1 — No ownership check** — role-level `clients:view` only; any viewer sees any client. But clients aren't user-owned in the schema (no `createdById` on Client), so this is arguably acceptable for clients (unlike services which have `createdById`/`assignedToId` and _should_ be ownership-scoped). Domain nuance: IDOR matters for services, less for clients. _Confirms pattern: IDOR (services), N/A for clients by design._
- **P2 — `metadata`: "…| Clients" / "…| Dashboard"** — brand variants again.

**Reports/suppliers net:** Three more stub routes confirmed. The app's built verticals are **Clients (complete, high quality)**, **Services (complete, buggy)**, **Settings (partial: company/system/users pages exist but system sub-forms are dead, nav mostly 404)**, **Dashboard (complete, buggy)**, **Auth (forms complete, register missing, 2 pages don't compile)**. **Unbuilt: Suppliers, Reports, Documents/Invoices/Loading-Orders** — the entire cost-side and analytics/billing half of a transport ERP.

Confirmed `reports/revenue` is also a stub. And a compile-breaking prop mismatch in the system settings page. Final findings for this batch:

## Round 2 — Services edit, System/Company settings, Revenue stub

**`services/[id]/edit/page.tsx` (P1):**

- **P1 — Uses `getService(id)` (the light formatted subset) then passes to `ServiceForm mode="edit"`.** But `getService` returns only `{id, serviceNumber, date(ISO string), client/supplier subset, costAmount/saleAmount/margin/marginPercentage as numbers, status}` — it **drops** `costVatRate`, `saleVatRate`, `costCurrency`, `reference`, `driverName`, `vehicleType`, `vehiclePlate`, `origin`, `destination`, `description`, `notes`, `internalNotes`, `distance`. `ServiceForm`'s edit mode spreads `...service` into defaults — so **editing a service loses every field not in `getService`'s projection** (they render empty and, on save, overwrite the DB with blanks). This is a **data-loss bug on every service edit.** The detail page uses `getServiceWithDetails` (full), but edit uses `getService` (partial). Wrong fetch for the edit form. _Confirms pattern: wrong/partial fetch for edit form (also CompanyForm address loss, ServiceSidebar attachments)._
- **P1 — `date` comes back as an ISO string** from `getService`, but `serviceSchema` uses `z.coerce.date()` and `DatePicker` expects `Date | null` → the edit form's date handling coerces a string; combined with `DatePicker`'s no-sync-on-value bug (batch 6), the date field likely shows blank on edit. _Confirms pattern: DatePicker value-sync + date coercion._
- **P1 — `edit_completed` gate is duplicated** here (page) and in `updateService` (action, v1) and in `ServiceForm`/`ServiceHeader` — four places checking completed-edit permission, all hardcoded. _Confirms pattern: divergent/duplicated permission checks._
- **Good:** the completed-service warning/block UX is thoughtful. `notFound()` handling correct. Auth + permission redirect present.

**`settings/system/page.tsx` (P0 — prop mismatch won't render):**

- **P0 — `<SystemSettingsContent initialSettings={settings} />`** — but `SystemSettingsContent` (batch 4) **takes NO props**; it fetches its own settings via `useEffect(loadSettings)` calling `getSystemSettings()` client-side. So `initialSettings` is ignored → **the server-fetched `settings` are discarded**, and the component re-fetches on mount (double fetch: server `getSystemSettings` here + client `getSystemSettings` in the component). More critically, if `SystemSettingsContent`'s prop type is `{}`, passing `initialSettings` is a **TypeScript error** → won't compile. Either way: server fetch wasted, client refetch, and likely a build error. _Confirms pattern: prop-contract mismatch (Card/Switch/etc.) + double-fetch._
- **P1 — Admin gate hardcoded** (`role !== SUPER_ADMIN && !== ADMIN`) — a 5th inline permission check, bypassing `hasPermission('settings','edit')`. _Confirms pattern: divergent permission checks._
- **P2 — `metadata`: "System Settings"** (no brand) — yet another metadata style.

**`settings/company/page.tsx` (P1 — good, with the dead-redirect bug):**

- **Well-structured:** `canAccessRoute` + `canView`/`canEdit` flags, view-only alert, `ActionResult` handling. Good.
- **P1 — Redirects non-access → `/settings/profile`** (dead route, doesn't exist). Both the `canAccessRoute` fail and `!canView` fail redirect to a 404. _Confirms pattern: dead-route redirect (settings/profile referenced 3× now: users page, company page, settings layout)._
- **P1 — `canAccessRoute(userRole, '/settings/company')`** — but `ROUTE_PERMISSIONS` has `/settings/company` = SUPER*ADMIN/ADMIN, while `COMPANIES:VIEW` (checked next) = SUPER_ADMIN/ADMIN/MANAGER. So a MANAGER passes `canView` but **fails `canAccessRoute` → redirected to dead /settings/profile.** The route table and permission matrix disagree, producing a broken redirect for managers. \_Confirms pattern: divergent RBAC (route vs matrix) with functional impact.*
- **P1 — `metadata`: "Transport Management System"** (5th brand).

**`reports/revenue/page.tsx` — P0 (feature):** `<div>Revenue Page</div>` — stub. Confirms **all reports pages are stubs** (`/reports`, `/reports/margins`, `/reports/revenue`), despite `StatsCard`/`PerformanceTip`/`ServiceChart` linking to them.

---

### Sweep-complete consolidated register (final additions from Round 2)

**New P0s found this round:**

1. `register/page.tsx` renders the **login form** — **no registration UI exists** (no `RegisterForm`); signup is unreachable.
2. `verify-email/page.tsx` and `reset-password/page.tsx` reference `Metadata` **without importing it** → **compile errors**.
3. `settings/system/page.tsx` passes `initialSettings` to a **propless component** → wasted server fetch + likely compile error + double fetch.
4. `services/[id]/edit` fetches via **`getService` (partial projection)** → **service edit silently blanks/overwrites all unfetched fields** (data loss).
5. Root `/` = **Next.js starter template** — CORRECTED: dead code only (next.config redirects `/` → `/dashboard`; the running proxy.ts protects it). Delete the scaffold.
6. **5 route stubs**: `/suppliers`, `/reports`, `/reports/margins`, `/reports/revenue`, `/documents`, `/settings` — core Suppliers, Reports, and Documents/Invoicing verticals are unbuilt but heavily linked.

**New/confirmed patterns:**

- **Branding chaos — 5 distinct names:** "Create Next App" (tab), "Enterprise Dashboard" (most metadata/emails/Logo), "Transport ERP" (dashboard layout), "Transport Management System" (users/company metadata), "Dashboard"/"Clients" (other metadata).
- **`Button asChild` nested `<button><a>`** invalid HTML: AuthFormFooter, verify-email, all auth pages using it.
- **Dead-route redirects to `/settings/profile`** (settings layout, users page, company page) — a 404 target used as the "no access" destination.
- **RBAC divergence now ×5**: `permissions.ts` matrix, `auth-helpers.hasPermission`, per-component `hasPermission` calls, `settings/layout` `navItems.roles`, and per-page inline role checks (`system/page`, `company/page` via mismatched `canAccessRoute` vs `hasPermission`) — managers get broken redirects from the mismatch.
- **`generateMetadata` ungated + double-fetch**: services detail (ungated, `getServiceWithDetails` has no auth) and clients detail (gated but double-fetches).
- **Wrong/partial fetch for edit forms**: services edit (`getService` partial), CompanyForm (address→single column), ServiceSidebar (`attachments` vs `documents`).
- **CORRECTED: `x-pathname` is set by the running `src/proxy.ts`** → settings nav active-state should work; verify at boot.
- **Suspense decorative** where data is awaited before render (dashboard, services); **real streaming** only in clients pages.
- **Client vertical = reference quality** (page/action/schema/detail all clean); Services complete-but-buggy; Settings partial+broken nav; Suppliers/Reports/Documents unbuilt.

## Round 2 — ClientsTable & ClientForm (reference vertical)

**`ClientsTable.tsx` (P1, high quality with shared bugs):**

- **Strong:** its own well-structured skeleton, URL-driven filter/sort/pagination (server-side, correct), `useTransition` for pending, real delete/bulk-delete modals, export via `exportClients` (server CSV → blob download). This is the reference table.
- **P1 — Search uses `defaultValue` + `onChange={handleSearch}` which pushes URL on EVERY keystroke.** No debounce (unlike `ServicesFilters` which uses `useDebounce`). So each character triggers a `router.push` + server round-trip → janky, hammers the server. Inconsistent with the services search. _Confirms pattern: inconsistent debouncing across tables._
- **P1 — `Button asChild` ×3** ("New Client", "Add First Client", empty-state) wrapping `<Link>` → nested `<button><a>` invalid HTML (asChild unimplemented, batch 5). _Confirms pattern: asChild nested interactive._
- **P1 — Uses the base `Table` with raw `<input type="checkbox">`** — the select-all `checked={selectedIds.size === data.data.length && data.data.length > 0}` is fine; but selection state is `Set<string>` (yet another selection model — ServicesTable uses `string[]`, ServicesMobileView uses `Set`, UsersList uses `string[]`). Four selection implementations. _Confirms pattern: duplicated/divergent selection state._
- **P1 — `Table.HeaderCell sorted` relies on `.row-*`/sort classes** — `Table` uses `hover:bg-support-rowHover` (undefined, batch 1) so row hover is dead; sortable header arrows render (Table.HeaderCell has inline `↕`). Country column reads `client.country` which `getClients` derives from `billingAddress` JSON (works). `?tab=services` link on services count — but `ClientDetail` would need to read `?tab` (unverified).
- **P2 — `data.pagination.totalPages > 1` gate** hides pagination for single page (fine) but also hides the page-size selector when ≤1 page even if the user wants a bigger page. Minor.

**`ClientForm.tsx` (P1 — the most complete form, confirms Switch/asChild patterns):**

- **Strong:** tabbed (Basic/Addresses/Financial/Settings), `FormProvider`, structured `billingAddress`/`shippingAddress` objects matching `clientSchema`, `beforeunload` unsaved-changes guard, cancel-confirm modal, per-field `Controller` + error display, conditional shipping address via `useWatch`. This is the best form in the app and correctly persists structured addresses (unlike `CompanyForm` which flattens to one column).
- **P1 — `Switch checked={field.value} onCheckedChange={field.onChange}`** — here it's done **correctly** (not `{...field}` spread), so `isActive`/`useShippingAddress`/`sendReminders`/`autoInvoice` switches work and bind to RHF properly. This is the _right_ pattern that `EmailConfig`/`Backup`/`General`/`PDF` got wrong (`{...field}` double-bind). Confirms the settings forms' Switch usage is the buggy variant. _Confirms pattern: Switch correct here, broken in settings._
- **P1 — `Input {...field}` for number fields** (`paymentTerms`, `creditLimit`, `discount`) passes string values without `valueAsNumber` → `clientSchema` uses `z.coerce.number()` so it coerces on submit (safe). But the base `Input`'s controlled/uncontrolled bug (batch 2) means edit-mode prefill via `defaultValues` works (RHF sets initial), yet `Input`'s internal-state-never-syncs means if any code calls `setValue` later, the field won't update. In this form nothing calls `setValue` post-mount, so it's OK here — the bug is latent. _Confirms pattern: Input controlled/uncontrolled latent._
- **P1 — `Select {...field}` for country/currency/language** — spreads `field` (incl. `ref`/`onBlur` dropped by custom Select), works via `value`/`onChange`. Country `<Select>` with 10 options, `renderCustom` defaults true → custom dropdown with stubbed keyboard nav (batch 2). `text-primary`/error styling degraded.
- **P1 — Notes uses a raw `<textarea className="input resize-none">`** instead of the `Textarea` component (which the imports include but this doesn't use) — inconsistent, and misses `Textarea`'s maxLength/char-count. `.input` resolves. Minor.
- **P2 — `Alert variant={feedback.type}`** where `feedback.type` is `'success'|'error'` — `Alert`'s `feedback-*` bg inert (batch 5), so success/error alerts have no colored background. `client!.id` non-null assertion on update. `ClientFormSkeleton` is elaborate and good.

**Client vertical verdict:** genuinely the best-built part of the app — structured addresses, tabs, proper Switch binding, real streaming, URL-driven state. Its remaining defects are **all inherited platform issues** (asChild nested-anchor, undefined theme classes, Input latent sync bug, non-debounced search, 4th selection model), not local logic errors. It validates that the team _can_ build well; the platform primitives/styles/duplication drag it down.

## Round 2 — Hooks (part 1)

**`use-auto-save.tsx` (P1):**

- **P1 — `useEffect` depends on `[debouncedData, key, enabled, onSave]` and writes localStorage + calls `onSave` on the FIRST render** (mount), because `useDebounce` seeds `debouncedValue = value` immediately (see below). So on mount it **immediately overwrites the localStorage draft with the initial form values and fires `onSave`** → in `ServiceForm`, the draft-restore effect and autosave race: the draft may be clobbered by an initial empty-form save before restore, or `lastSavedAt` shows "saved just now" on load. _Confirms pattern: autosave clobbers draft on mount._
- **P1 — `onSave` in the dep array** — if the parent passes an inline `onSave` (ServiceForm passes `() => setLastSavedAt(new Date())`), it's a new function each render → the effect re-runs every render → **writes localStorage on every render**, not just on debounced change. `ServiceForm` passes it inline via `AutoSaveManager`, so this fires constantly. _Confirms pattern: unstable callback in deps → effect thrash._
- **P1 — Stores full form (incl. internal notes, prices) in localStorage** as plaintext under a single global `key` (`'service-form-draft'`) — cross-service collision + sensitive data at rest on shared machines (batch 3). _Confirms pattern: sensitive draft in localStorage._
- **P2 — `data: any`**, no size guard (a large form serialized every render).

**`use-media-query.ts` (P1 — the SSR/hydration root cause):**

- **`useState(false)` initial + `useEffect` sets real value after mount.** This is THE source of the `MainLayout` hydration/layout-shift issue (batch 3): SSR renders with `matches=false` for all three queries → **no sidebar/wrong layout on first paint**, then hydrates and pops. Every `useMediaQuery` consumer (MainLayout desktop/tablet/mobile, TopBar) starts `false`. For structural layout this causes visible CLS and a flash of the mobile/no-sidebar state on desktop. _Confirms pattern: SSR-false media query → hydration shift._ The hook is "correct" but the pattern is wrong for layout decisions (should be CSS breakpoints).

**`use-focus-trap.ts` (P1):**

- **P1 — Focusable elements captured ONCE on activation** (`querySelectorAll` in the effect body, no re-query). If the modal's content changes (async load, conditional fields, the delete-confirm input appearing), `firstElement`/`lastElement` are stale → focus trap targets removed/wrong nodes. `Modal`/`MobileMenu` with dynamic content (BulkActions delete input, UserForm) will trap to stale elements.
- **P1 — Doesn't move focus INTO the trap on activation** — only handles Tab wrapping. `Modal` separately does the initial focus (via its own effect), but `MobileMenu` uses `<dialog>` without this hook at all (batch: MobileMenu has no focus trap). So focus-into-modal depends on Modal's separate `setTimeout(100)` hack. _Confirms pattern: incomplete focus management._
- **P2 — `[tabindex]:not([tabindex="-1"])` selector misses `[contenteditable]`, `audio/video[controls]`, and doesn't filter `disabled`/hidden elements** → can trap to a disabled/invisible button.

**`use-table-sort.ts` (P2 — the DataTable dual-state root):**

- Clean in isolation. But it's the **internal** sort state that duplicates the URL-driven sort in `ServicesTable`/`ClientsTable` (batch 1) → `DataTable` tracks `sortKey`/`sortDirection` locally while the page tracks it in the URL, so the visual arrow (from this hook) can desync from the actual server sort. _Confirms pattern: DataTable dual sort-state source._ Not a bug alone; a bug in composition.

**`use-debounce.ts` (P1 — root of the autosave-on-mount):**

- **`useState<T>(value)` seeds `debouncedValue = value` immediately**, and the effect sets a timeout. So the **first returned value is the current value with no delay** — correct for search (initial render shows current), but it means `useAutoSave` fires on mount (as above). Also **standard "stale value if `delay` changes mid-flight"** and no leading/trailing option. For `useAutoSave`'s 30s delay, a rapid unmount within 30s loses the pending save (timeout cleared). _Confirms pattern: debounce seeds immediate value → autosave mount write._ Fine for search debounce; problematic composed into autosave.

## Round 2 — Hooks (part 2)

**`use-table-selection.ts` (P1 — the controlled-prop desync):**

- **P1 — `useState<Set>(new Set(selectedRows))` seeds from `selectedRows` ONCE; no sync effect.** So when the parent (`DataTable` consumer) changes `selectedRows` prop, the hook's internal `selectedIds` **doesn't update**. `DataTable` passes `selectedRows={selectedIds}` from `ServicesTable`/`RecentServices` AND uses this hook internally → **two selection states** (parent `string[]` + hook `Set`), seeded once, then diverging. Clearing selection in the parent (e.g., after bulk action) won't clear the hook's set → checkboxes stay visually checked. _Confirms pattern: controlled prop seeded once, never synced (Input/DatePicker/TimeInput/Checkbox family) — now in selection._
- **P1 — `isIndeterminate` feeds `Checkbox indeterminate`** which is visually broken (batch 2: indeterminate never set on the DOM input) → the tri-state select-all in `DataTable` is wrong. _Confirms pattern: broken indeterminate rendering reached via DataTable._
- `selectRange` exists but no consumer uses shift-click range selection (dead feature). Otherwise clean logic.

**`use-unsaved-changes.tsx` (P1):**

- **P1 — `handleBeforeUnload` returns `''` instead of setting `e.returnValue`.** Modern browsers require `e.preventDefault()` AND `e.returnValue = ''` (or returning a string in older). Just `return ''` from the handler after `preventDefault()` is unreliable across browsers → the unsaved-changes browser prompt may not fire. `ServiceForm` relies on this. `ClientForm` sets `e.returnValue = ''` correctly (inline, batch: ClientForm) — so the two implementations differ, and the hook's is the less-reliable one. _Confirms pattern: divergent implementations (ClientForm inline vs this hook)._
- **P1 — `handlePopState` re-pushes state on cancel** but doesn't actually block Next.js App Router client navigation (`router.push`) — `popstate` only fires on browser back/forward, not on in-app `<Link>`/`router.push`. So navigating away via a sidebar link with unsaved changes **shows no warning** (App Router has no built-in navigation guard; this hook only catches browser back). A real gap for the service/client edit forms. _Confirms pattern: unsaved-changes guard incomplete for App Router._

**`use-escape-key.ts` (P2):** Clean, but `[handler]` dep — if the consumer passes an inline handler (common), the listener re-attaches every render. `Modal`/`DropdownMenu` pass inline arrows → churn. Minor. Also **global `document` listener** means multiple open Escape-consumers (nested Modal + DropdownMenu) all fire on one Escape → could close everything at once. _Confirms pattern: unstable-callback dep + global listener stacking._

**`use-scroll-lock.ts` (P2):** Mostly clean. **Captures `originalStyle` via `getComputedStyle` (computed, e.g. `"visible"`)** and restores that computed value rather than the inline style — if multiple scroll-lockers stack (Modal opens over a locked body), the second restores `"hidden"` incorrectly on cleanup, or the first's cleanup unlocks while the second is still open. No ref-count. Nested modals (BulkActions modal over a page, or Modal + MobileMenu) will mis-restore scroll. `MobileMenu` sets `document.body.style.overflow` directly (not via this hook) → two scroll-lock mechanisms. _Confirms pattern: divergent scroll-lock + no ref-count._

**`hooks/index.ts`:** clean barrel; note it re-exports `use-permissions` (which `PermissionGuard`/`UserManagement`/`QuickActions` import from `@/hooks/use-permissions` directly and via `@/hooks`) — mixed import paths, low risk.

**Hooks net:** The hooks are individually small and mostly reasonable, but three carry **the root causes** of bugs seen downstream: `use-media-query` (SSR/hydration layout shift), `use-table-selection` + `use-debounce`/`use-auto-save` (controlled-prop-seeded-once + mount-write), and `use-unsaved-changes`/`use-focus-trap`/`use-scroll-lock` (incomplete for App Router / dynamic content / nesting). The recurring meta-pattern — **"seed from prop once via `useState`, never sync"** — appears in `Input`, `Checkbox`, `DatePicker`, `TimeInput`, `use-table-selection`, and `use-auto-save` interplay. One disciplined fix (derive from props or add sync effects) resolves a whole class.

## Round 2 — ClientDetail & ClientServices (last client components)

**`ClientDetail.tsx` (P1):**

- **P1 — `formatPercentage(client.stats.averageMarginPercentage)}%`** — CORRECTED — single bug: the stray literal `%`. The helper output is correct (`18.5%`); the JSX appends **another literal `%`** → renders `18.5%%`. Remove the literal `%` only. (The ×100 claim is retracted — the helper divides by 100 and `Intl` percent re-multiplies.) This is one of only two genuinely wrong `formatPercentage`-related call sites in the repo (the other is `StatsCard`'s fraction input).
- **P1 — New theme classes referenced that don't exist:** `text-status-completed-text`, `text-status-active-text`, `text-status-cancelled-text`, `text-financial-positive`, `bg-primary/10`, `text-primary`, `text-danger`, `hover:bg-danger/5`. globals.css defines the CSS **vars** `--status-completed-text`, `--positive-amount` etc., but **not** the utilities `text-status-completed-text`/`text-financial-positive` (no `@theme`). So all the colored stat numbers (active/completed/cancelled/revenue) and the delete button render in **default/inherited color**. `text-primary` works; the rest don't. _Confirms pattern: undefined theme utilities (status-_, financial-_)._ Note `Amount` component uses `text-positive` (which globals DOES define) — so `ClientDetail` invents `text-financial-positive` (undefined) while `Amount` uses `text-positive` (defined) — inconsistent naming for the same concept.
- **P1 — `Button asChild` ×5** (Edit ×2, New Service, Edit Client, View Invoices) → nested `<button><a>` invalid HTML. _Confirms pattern: asChild._
- **P1 — "View Invoices" → `/invoices?clientId=`** dead route. "New Service" → `/services/new?clientId=` — but `ServiceForm`/`services/new` **don't read `?clientId`** (new page only reads `?duplicate`), so the client isn't pre-selected. Dead deep-link param. _Confirms patterns: dead route + unhandled query param._
- **P1 — `handleCopy` uses `navigator.clipboard`** with no fallback/error handling (throws on insecure contexts/permissions). `handleDelete` → `deleteClient` then `router.push('/clients')` with no error handling (if delete fails, silently navigates).
- **Good:** structured address rendering, `<address>` semantic element, copy-to-clipboard UX, comprehensive skeleton. High-effort component; degraded by theme + asChild + dead links.

**`ClientServices.tsx` (P1):**

- **CORRECTED — `service.marginPercentage.toFixed(1)` is correct here, and `ClientDetail`'s helper output is also numerically correct** (its only defect is the stray literal `%` → `18.5%%`). Apart from that stray `%`, the two renderings on the client detail page agree. Mixed raw-`.toFixed` vs helper conventions remain a maintainability smell, not a correctness bug.
- **P1 — Links to `/suppliers/${service.supplier.id}`** — supplier detail route doesn't exist (suppliers page is a stub, no `[id]`). Dead link. _Confirms pattern: dead supplier routes._
- **P1 — `formatCurrency` rounding** on cost/sale/margin. `text-financial-positive`/`negative` undefined (inert). `Button asChild` ×2. `Select {...field}` custom-dropdown.
- **P1 — Client-side data fetch in `useEffect`** (not server-rendered): `getClientServices` called on mount + on filter/page change via `startTransition`. Reasonable for a filtered sub-table, but it means the client detail page's services list is a **waterfall** (page renders, then this fetches) rather than streamed. `getClientServices` (client-actions) has `requirePermission('clients','view')` — gated ✅. `Card.Header action` puts a `<Select>` and `asChild` button in the header.
- **P2 — Two `useEffect`s both keyed on `[selectedStatus, pageSize]`** — one fetches, one resets page to 1. Order: on status change, page resets to 1 AND fetch fires with old `page` then again with page=1 → **double fetch** on every filter change. Should reset page in the same handler. _Confirms pattern: double-fetch on filter change._

**Client components verdict (final):** The client vertical is the best-built (structured addresses, rich skeletons, real filtering, gated actions) but is dragged down by the **exact same platform-level defects** as everywhere else: `formatPercentage` misuse (worst instance here with `%%`), undefined theme utilities (`status-*`/`financial-*` colors inert), `Button asChild` nested anchors, dead routes (`/invoices`, `/suppliers/[id]`), unhandled query params (`?clientId` ignored by new-service), and double-fetch-on-filter. None are local logic errors — all are the recurring platform issues.

---

## Round 2 — seed.ts + remaining client/auth pages

**`prisma/seed.ts` (P1 — the invoice/loading-order domain EXISTS in seed but not in the app):**

- **P0 (domain revelation) — The seed fully implements invoices, payments, loading orders, and status→INVOICED transitions** (`createSingleInvoice`, `createInvoices`, `createLoadingOrders`) that **have no server actions or UI**. So the DB gets populated with invoices/payments/loading orders that the application **cannot read, create, or manage** — the models and seed exist, the app layer doesn't (v2 gap confirmed from the other direction). The seed even sets services to `INVOICED`, but no app code creates that transition. _Confirms pattern: invoice/payment/loading-order domain modeled+seeded but unbuilt in app._
- **P1 — Seed credentials are weak and documented:** all users get `password123`, `admin@example.com`, and the script prints them. Fine for dev, but: (a) there's **no SUPER_ADMIN** seeded (only ADMIN/MANAGER/ACCOUNTANT/OPERATOR) — yet many actions/pages require SUPER*ADMIN (user delete, system settings 2nd gate, backup nav) → **no seeded user can exercise SUPER_ADMIN paths**; (b) if `prisma:seed:prod` is ever run (it's in package.json), it creates `admin@example.com / password123` in production — a critical backdoor. \_Confirms pattern: weak/predictable seed creds + prod seed script exists.*
- **P1 — Seed computes margin/VAT correctly** (`marginPercentage` stored as the percent, `saleVatAmount = sale*0.21`) — this is the **canonical** calculation the app's `formatPercentage` misuse then double-scales on display. So the data is right; the display is wrong. Confirms the bug is purely presentational, data is sound.
- **P1 — `createSingleInvoice` is the ONLY place `paidAmount`/`paymentStatus` are set consistently with a `Payment` row** — exactly the transactional pattern the (missing) invoice actions should follow. It's a good reference for building the invoice module. Note it wraps each invoice in `$transaction` (good) but `createInvoices` loops `await` sequentially (slow for large seeds).
- **P1 — Seeds `SystemSetting` keys `company.info`, `invoice.settings`, `email.templates`, `features.enabled`** — but the app reads _different_ keys (`SettingKey.EMAIL/PDF/BACKUP/NUMBER_SEQUENCES/GENERAL`, `company.info` via `Company` model not this setting). So the seeded settings **don't match the keys the app queries** → settings screens show defaults, ignoring seeded values. _Confirms pattern: settings key mismatch (seed vs runtime)._ And "Enterprise Dashboard Corp"/"enterprise-dashboard.com" branding in seed.
- **P1 — `createServices` builds `serviceCreateInputs` then creates in a transaction, and populates `serviceStatusHistory`** — so seeded services HAVE status history, but the app's `updateService`/`markServiceComplete` **never write history** (v1) → history exists only for seeded data, then goes stale. Confirms the `ServiceStatusHistory` table is populated by seed but abandoned by the app.
- **P2 — `randomDecimal` uses `crypto.randomInt`** (good, not Math.random — unlike `UserForm`'s password gen). Notifications link to `/invoices/...`, `/services/SRV-...` (by serviceNumber, not id — dead links). "Welcome to Enterprise Dashboard" notification text.

**`clients/new/page.tsx` (clean):** Reference quality — auth, `canCreate` redirect, `Breadcrumbs`, `ClientForm mode="create"`. "New Client | Dashboard" brand variant. No issues.

**`clients/[id]/edit/page.tsx` (clean, one shared):** Best edit-page pattern — `Suspense` + `ClientFormSkeleton` (real streaming), `canEdit` redirect, `notFound`, `ActionResult`. **P1 — `generateMetadata` double-fetches `getClientById`** (also in content) — same double-fetch as detail. `ClientForm` gets the full `ClientWithRelations` (correct fetch, unlike services-edit which uses partial `getService`). This is how services-edit _should_ work. _Confirms pattern: generateMetadata double-fetch; but correct full-fetch for edit (contrast to services)._

**`forgot-password/page.tsx` + `resend-verification/page.tsx` (P1 — branding/theme only):** Both clean, correctly import `Metadata`, redirect-if-authed, neutral. `Logo` "Enterprise" + "Enterprise Dashboard" metadata; `bg-linear-to-br` (v4-correct); double-gradient with `(auth)/layout`. `resend-verification` uses 4-space indentation (the rest use 2) — cosmetic style drift. No functional bugs. _Confirms patterns: branding + double-gradient layout._

Now the final non-component files: types, config, Docker/entrypoint, migration.

## Round 2 — types, next.config, Docker/entrypoints

**`next.config.ts` (P0 — won't compile + contradicts the middleware finding):**

- **P0 — `import type { NextConfig } from 'next'` appears TWICE** (lines 1 and 3, with `createBundleAnalyzer` between). Duplicate import → **TypeScript/build error**. Add to the compile-breakers list (prisma.ts, verify-email, reset-password, next.config). _Confirms pattern: build-breaking duplicate/missing imports._
- **P1 (resolves a prior open question) — `redirects()` sends `/` → `/dashboard`.** So the root Next.js starter template (`app/page.tsx`) is **never reached** — the redirect masks it. Good news: the scaffold page isn't user-visible. But the redirect is **`permanent: false`** and happens before auth, so `/` → `/dashboard` → (dashboard layout `requireAuth` throws or middleware would redirect to login). Net: root is handled by the config redirect AND by `src/proxy.ts` (which does run on Next 16 — see the corrected v1 item 5). Retract the "root shows starter template" P0 severity — it's redirected. The starter `page.tsx` is dead code though.
- **P1 — Security headers only applied in production AND no CSP.** `headers()` returns `[]` in non-prod, and the prod set omits **`Content-Security-Policy`** and **`Strict-Transport-Security`** — the two most important. `X-XSS-Protection` is deprecated/harmful. For a finance app handling auth + uploads, missing CSP/HSTS is a real gap. _Confirms pattern: security hardening incomplete._
- **P1 — `serverActions.bodySizeLimit: '2mb'`** — but `CompanyForm`/`updateCompanySettings` send **base64 logos** (a 2MB image → ~2.7MB base64) → uploads near the limit will be **rejected by the server-action body limit**. The logo-as-base64 approach (batch: CompanyForm) collides with this 2mb cap. _Confirms pattern: base64 upload vs body limit._
- **P1 — `webpack` config with `@svgr/webpack`** but `@svgr/webpack` **isn't in package.json dependencies** → build fails when a `.svg` is imported as a component (or the loader is missing). And `crypto-browserify`/`stream-browserify` fallbacks + `node:` replacement plugin indicate node-builtin code leaking to the client bundle (the storage/email/pdf libs) — a sign server-only code isn't properly isolated. Also **`package.json` uses `next dev/build --webpack`** but Next 16 defaults to Turbopack; forcing webpack + this custom config is fragile. _Confirms pattern: bundler/dep config drift._
- **P1 — `images.remotePatterns` allows `**.amazonaws.com`/`**.cloudinary.com`** but the app uploads to **Backblaze B2** (`*.backblazeb2.com`) → `next/image` (used in `CompanyForm` for the logo) will **reject B2 URLs** → logo preview/display broken via `<Image>`. Wrong remote host allowlist. _Confirms pattern: config doesn't match actual infra (B2)._
- **P2 — `env: { NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_APP_NAME }`** re-exposes already-public vars (redundant). `output: "standalone"` correct for Docker.

**Docker + entrypoints (P1):**

- **P1 — TWO entrypoint scripts, both run `prisma migrate deploy` at container start.** `docker-entrypoint.sh` (`exec node server.js`) and `entrypoint.sh` (`exec npm start`). The Dockerfile uses `docker-entrypoint.sh`; `entrypoint.sh` is dead. **Running `migrate deploy` on every container start** means in a multi-replica deploy, N replicas race to migrate simultaneously → migration lock contention / partial failures. Migrations should run as a separate one-shot job/init container, not per-replica on boot. _Confirms pattern: migrate-on-every-boot (multi-replica hazard) + duplicate scripts._
- **P1 — Dockerfile installs `chromium` for Puppeteer** (PDF generation) — but **PDF generation is unimplemented** (batch: PDF settings + generateLoadingOrder stub). So the image ships a full Chromium (~300MB+) for a feature that doesn't exist. Bloated image for dead capability. _Confirms pattern: infra for unbuilt feature._
- **P1 — `deps` stage runs `npx prisma generate`** with `binaryTargets = ["native"]` (schema) on `node:20-alpine` — the generated engine is for Alpine (musl), fine for the runner, but the schema's `output = "../src/app/generated/prisma"` means the client is generated _into source_, copied via `COPY . .` in builder — and the runner copies `.prisma`/`@prisma` from `deps`. Fragile multi-stage Prisma copying; the `output` path inside `src/app/generated` also risks being served or bundled. _Confirms pattern: Prisma client generated into app source._
- **P2 — Node 20-alpine** but `package.json engines` says `node: 22.x` — **version mismatch** (Docker runs 20, engines require 22). And `npm ci` needs `package-lock.json` (present). `set -e` good.

## Round 2 — Types (final files)

**`next-auth.d.ts` (P1 — confirms the deactivation-doesn't-work root):**

- **The `Session.user` type does NOT include `isActive`.** The `User` interface has `isActive: boolean` (line), but `Session.user` (what the app reads everywhere via `session.user`) has `id/email/name/role/emailVerified/twoFactorEnabled/department/avatar` — **no `isActive`**. And the `jwt`/`session` callbacks (auth.ts) never propagate `isActive` into the token/session. So **no component or action can check `session.user.isActive`** — combined with JWT-never-rechecks-DB (v2 P0), a deactivated user's session remains fully valid _and_ the app has no way to see they're inactive from the session. This type confirms the deactivation gap is structural. _Confirms pattern: session lacks isActive → deactivation ineffective._
- **P2 — `AdapterUser` augmentation makes `role?` optional** while `Session.user.role` is required `UserRole` — the session callback defaults `role ?? VIEWER`, so a missing role silently becomes VIEWER (fail-open to lowest privilege, which is the safe direction, but masks bugs).

**`service.ts` (P1 — the `ServiceData` vs actual-shape gap):**

- **`ServiceData`** (used by `ServicesTable`/`ServiceRow`/`ServicesMobileView`) is a flat DTO with `date: string`, numeric money, `marginPercentage: number`. It matches `getServices`'s `formattedServices` output. **But** `ServiceDetail`/`ServiceHeader`/`ServiceSidebar` receive `service: any` / `Service` / `Prisma.ServiceGetPayload` — none use `ServiceData`. So the list has a proper DTO; the detail/edit path is untyped (`any`). The type file confirms the **list vertical is typed, the detail/edit vertical is not**. _Confirms pattern: `any` service shapes in detail/form (vs typed list)._
- **P1 — `ServicesFiltersProps.onBulkAction: (action: 'update'|'delete'|'loadingOrder', ...)`** but `ServicesFilters` calls `handleBulkAction('updateStatus', ...)` (batch 3) — `'updateStatus'` isn't in the union → type mismatch (the component casts `as any`). Dead/mismatched callback contract. `onSaveFilter`/`savedFilters` typed but the feature is unwired. _Confirms pattern: typed-but-unwired props._
- **P2 — `ServiceFiltersAPI.status?: ServiceStatus | undefined`** and `pageSize?: number` with no max — the type permits the uncapped pageSize the page exploits (v1 DoS). Types don't enforce the cap.

**`env.d.ts` (P1 — incomplete env typing):**

- Declares `RESEND_API_KEY`, `EMAIL_*`, `NEXT_PUBLIC_*`, `EMAIL_ALLOWED_DOMAINS`, etc. — but **omits every var the app actually depends on elsewhere**: `DATABASE_URL`, `B2_APPLICATION_KEY_ID`/`B2_APPLICATION_KEY`/`B2_BUCKET_NAME`/`B2_ENDPOINT`/etc. (storage/settings), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (auth), `NEXTAUTH_SECRET`/`AUTH_SECRET` (NextAuth — **critically absent**, and I never saw it set), `SENDGRID_API_KEY`/`AWS_*` (email.ts), `ALLOWED_ORIGINS` (next.config), `NEXT_PHASE`. So `getEnv('B2_*')` (which throws on missing, v3) operates on untyped env, and the **NextAuth secret** isn't typed or documented → if unset, JWT signing uses an insecure/default in dev and **fails in prod**. _Confirms pattern: env typing incomplete + `AUTH_SECRET` never surfaced (security)._
- Also `NEXT_PUBLIC_APP_NAME` (used in next.config `env`) isn't declared here — the "app name" env the branding _could_ use exists but nothing reads it consistently.

**`client.ts` (clean — the reference types):**

- Well-structured: `Address`, `ClientWithRelations extends Client`, `ClientWithStats`, `ClientListItem`, `PaginatedClients`, `ActionResult<T>` generic. This is the typing discipline the service/settings verticals lack. `ClientService.marginPercentage: number` (raw percent — rendered correctly with `.toFixed(1)` in ClientServices, vs the `formatPercentage` misuse elsewhere). **P2 — `ClientFormData` duplicates `clientSchema`'s inferred type** (client-schema exports `ClientInput`/`ClientOutput`) — two sources for the same shape; `ClientForm` uses `ClientInput` (from schema), so `ClientFormData` here is **unused/orphaned**. _Confirms pattern: duplicated type definitions._ `ActionResult` defined here AND in `types/settings.ts` (settings-actions imports from there) — two `ActionResult`s. _Confirms pattern: duplicated types across files._

**Types net:** `client.ts` is the reference (clean, generic `ActionResult`, proper DTOs). `service.ts` confirms the list-is-typed/detail-is-`any` split and has a mismatched bulk-action union. `next-auth.d.ts` structurally confirms deactivation can't work (no `isActive` in session). `env.d.ts` omits the security-critical `AUTH_SECRET`/`DATABASE_URL`/`B2_*`/OAuth vars — env is under-typed and the auth secret is never surfaced anywhere I've read.

The sweep is now essentially complete — every `.ts`/`.tsx` file across `prisma/`, `src/lib`, `src/actions`, `src/hooks`, `src/types`, `src/styles`, `src/components`, `src/app`, plus config/Docker has been read. Remaining trivially-untouched: the small type files (`dashboard.ts`, `mail.ts`, `nav.ts`, `settings.ts`, `storage.ts`, `styles.ts`, `ui.ts`), `prisma/migration.sql`, `prisma.config.ts` (×2), `scripts/setup-env.ts`, `eslint.config.mjs`, `.env.example` files, and READMEs. Let me close the last type files, the migration SQL (to verify schema constraints match the schema.prisma review), and the env examples (security).

## Round 2 — Migration SQL, .env.example, settings types, setup-env

**`migration.sql` (P1 — confirms the schema-review gaps at the DB level):**

- **P1 — The migration `AuditAction` enum is MISSING values the app uses.** SQL enum: `('CREATE','UPDATE','DELETE','RESTORE','LOGIN','LOGOUT','EXPORT','IMPORT')`. But `schema.prisma` (v1) defines additionally `COMPLETE, CANCEL, SEND_EMAIL, GENERATE_DOCUMENT, ARCHIVE`, and the app **writes those values** (`service-actions` logs `action: 'COMPLETE'`, `'ARCHIVE'`, `'GENERATE_DOCUMENT'`, `'SEND_EMAIL'`). So the **committed migration and the schema.prisma have drifted** — if the DB was migrated from this SQL, those audit writes **throw at runtime** (invalid enum value). Either the schema was edited after the migration without a new migration (schema drift), or a later migration exists that I don't see (only one migration dir in the tree). This is a real **DB-vs-code enum mismatch** that breaks completing/archiving/document/email audit logging. _Confirms pattern: schema.prisma ↔ migration drift; enum missing values app writes._ Also `ServiceStatus` SQL enum is missing `ARCHIVED` (schema has it, app sets it via `archiveService`) → archiving throws.
- **P1 — Zero `CHECK` constraints** in the DDL (confirmed at SQL level, not just schema): no `costAmount >= 0`, no `paidAmount <= totalAmount`, no positive-total guards. The v1 money-invariant finding is confirmed absent in the actual migration. _Confirms pattern: no DB-level money invariants._
- **P2 — `-- sonar.ignore` / `--NOSONAR` comments** in the migration — someone suppressed linter warnings about duplicate enum literals rather than addressing structure. Cosmetic but telling.

**`.env.example` (P1 — the env contract is for a DIFFERENT app):**

- **P1 — `.env.example` documents a totally different stack than the code uses.** It lists `EMAIL_SERVER_HOST/PORT/USER/PASSWORD` (SMTP), `AWS_S3_BUCKET`/`CLOUDINARY_*` (S3/Cloudinary), `STRIPE_*`, `OPENAI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `ENCRYPTION_KEY`, `JWT_SECRET`, `GITHUB_CLIENT_ID` — **none of which the code reads**. Meanwhile the code's **actual** required vars are **absent**: no `B2_APPLICATION_KEY_ID`/`B2_*` (storage/backup depend on these, and `getEnv` throws without them → boot crash, v3), no `RESEND_API_KEY` (the real email path). So a developer copying `.env.example` gets an app that **crashes on boot** (missing B2) and can't send email (no Resend key), while being told to set Stripe/OpenAI/Cloudinary that do nothing. _Confirms pattern: env contract mismatches actual infra (B2/Resend) + documents unused services._
- **P1 — `NEXTAUTH_SECRET=your-secret-key-here...` placeholder** — and it's `NEXTAUTH_SECRET`, but NextAuth v5 (beta) reads **`AUTH_SECRET`**. So even a developer who sets `NEXTAUTH_SECRET` may find auth using an undefined secret (v5 expects `AUTH_SECRET`). The example also lists `JWT_SECRET`/`ENCRYPTION_KEY` that nothing uses. Auth secret is both mis-named and unenforced. _Confirms pattern: AUTH_SECRET missing/mis-named (from env.d.ts finding)._
- **P1 — `ENABLE_USER_REGISTRATION=true`** feature flag documented — but registration UI doesn't exist (register page = login). Flag for a missing feature. Branding: `NEXT_PUBLIC_APP_NAME="Enterprise Dashboard"`. `DATABASE_URL` DB name `enterprise_dashboard`. _Confirms patterns: branding + flag for unbuilt feature._
- **P2 — `DATABASE_URL_NON_POOLING`** documented (good — the `directUrl` for migrations the schema commented out) but the schema's `directUrl` is commented out (v3), so it's declared in env but unused.

**`settings.ts` (P1 — confirms settings key mismatch):**

- **`SettingKey` enum values** = `'email_config'`, `'pdf_settings'`, `'backup_settings'`, `'number_sequences'`, `'general_settings'`, `'last_backup_timestamp'`. But **`seed.ts` creates settings with keys `'company.info'`, `'invoice.settings'`, `'email.templates'`, `'features.enabled'`** — **completely different keys**. So seeded settings and the keys the app reads (`SettingKey.*`) **never intersect** → the app always shows `DEFAULT_SYSTEM_SETTINGS`, ignoring all seeded config. Confirmed from both sides now. _Confirms pattern: seed↔runtime settings-key mismatch._
- **P2 — THIRD `ActionResult` definition** (here, `types/client.ts`, and used across actions) — `settings.ts`'s `ActionResult` has no `errors` field while `client.ts`'s does. Divergent duplicate types. _Confirms pattern: duplicated `ActionResult` (×3)._ `EmailProvider` here = `'resend'|'smtp'|'sendgrid'|'ses'` matches `EmailConfig.tsx`, but `email.ts` (the dead SMTP service) uses `'aws-ses'` not `'ses'` — provider-name drift between the two email systems.

**`setup-env.ts` (P2):**

- Named `.ts` but written in CommonJS (`require`, `//scripts/setup-env.js` comment) — and `package.json` calls `node scripts/setup-env.js` (`.js`, not `.ts`) → **the script the package.json invokes doesn't exist** (`.ts` is present, `.js` isn't) → `npm run setup:env` fails. _Confirms pattern: script path mismatch._ Logic is fine (copies `.env.local`/`.env.production` → `.env`), checks `DATABASE_URL` presence. Minor: copies secrets into a committed-adjacent `.env` (ensure gitignored).

---

The sweep is now complete: every source file (`prisma/` incl. migration + seed, all `src/**` — lib, actions, hooks, types, styles, components, app pages/layouts/route), plus `next.config.ts`, `Dockerfile`, both entrypoints, `.env.example`, and `setup-env` — has been read line by line. Remaining files are pure docs/config with no logic: the various `README.md`, `.prettierrc`/`.prettierignore`, `eslint.config.mjs`, `.gitignore`/`.dockerignore`, `postcss.config.mjs`, `tsconfig` (not present in tree), the duplicate `prisma.config.ts`/`prisma/prisma.config.ts`, `.env.docker.example`, and `.vscode/*`. These won't change the findings.

### Final additions to the consolidated register (Round 2 closeout)

**New P0/P1 confirmed:**

1. **`next.config.ts` duplicate `import { NextConfig }`** → build error (joins prisma.ts, verify-email, reset-password compile-breakers).
2. **Migration↔schema enum drift**: SQL `AuditAction`/`ServiceStatus` enums lack `COMPLETE/CANCEL/SEND_EMAIL/GENERATE_DOCUMENT/ARCHIVE`/`ARCHIVED` that the app writes → runtime enum errors on complete/archive/doc/email audit + archiving.
3. **`.env.example` describes a different app** (SMTP/S3/Cloudinary/Stripe/OpenAI) while omitting the real required `B2_*`/`RESEND_API_KEY` → fresh clone **crashes on boot** (getEnv throws) and can't email; `NEXTAUTH_SECRET` mis-named vs v5's `AUTH_SECRET`.
4. **Invoice/payment/loading-order domain fully seeded but has no app actions/UI/routes** — confirmed from seed side; the models+seed+DB rows exist, the application half doesn't.
5. **No SUPER_ADMIN seeded** → SUPER_ADMIN-gated features (user delete, system-settings 2nd gate) unreachable with seed data; and `prisma:seed:prod` would plant `admin@example.com/password123` in prod.
6. **`next-auth.d.ts` session lacks `isActive`** → structurally confirms deactivation can't take effect.
7. **Seed↔runtime settings-key mismatch** (`company.info` vs `email_config` etc.) → seeded settings ignored.
8. **Docker: migrate-on-every-replica-boot**, two entrypoint scripts, Chromium shipped for unbuilt PDF, Node 20 vs engines-22, `@svgr/webpack` used-but-not-installed, `next/image` allowlist is AWS/Cloudinary not B2.
9. **Three `ActionResult` types**, `env.d.ts` omits `DATABASE_URL`/`B2_*`/`AUTH_SECRET`/OAuth.
