# Part 1 — Domain Report: Transport / Freight-Brokerage ERP

#### What this system actually is

Reading the schema, not the marketing: this is a **freight-forwarding / transport-brokerage ERP for a Spanish (EU) operator**. The core business is *intermediation* — you take a client's transport need, subcontract it to a supplier (carrier/autónomo), and profit on the **margin** between the sale price (to client) and cost (from supplier). Every domain decision in the schema confirms this: `Service` carries both `costAmount` (supplier side) and `saleAmount` (client side) plus `margin`/`marginPercentage`; `Supplier` has `irpfRate` (Spanish income-tax retention for self-employed carriers) and `vatRate` default 21%; currency defaults EUR, timezone Europe/Madrid, VAT numbers, IBAN. The operational spine is: **Client + Supplier → Service → Loading Order → Invoice → Payment → Audit**.

This domain has non-negotiable realities that generic CRUD apps ignore. Below are the gaps between what a *reliable* transport ERP must do and what this codebase does, with how to close each.

#### Gap 1 — Financial correctness is the product; today it's presentational-only and unenforced

In brokerage, the margin *is* the business. Three failures compound here:
- **Money math in JS floats + display bugs.** `formatCurrency` rounds to whole euros (invoices/margins shown wrong), `formatPercentage` multiplies by 100 (margins/VAT shown as "1,850%"/"2,100%"), and margin is recomputed in four places (form, calculator, table, server) that disagree. In a business where a 2% margin error per load compounds across thousands of loads, this is existential.
- **No database invariants.** The DDL has zero CHECK constraints — nothing stops negative costs, `paidAmount > totalAmount`, or totals that don't equal `subtotal + tax − IRPF`. A single bad write corrupts the books.
- **VAT/IRPF are Spain-legal obligations, not features.** Suppliers who are autónomos must have IRPF withheld; invoices must reconcile VAT in/out for the *modelo 303/347* filings. The seed computes this correctly; the app never surfaces or enforces it.

**How the solution should address it:** one canonical `Money`/Decimal module used everywhere (server + display), a single `pricing.ts` (margin, markup, VAT, IRPF, totals) consumed by form/table/detail/actions, DB CHECK constraints for every money invariant, and invoice totals derived (never client-set) inside a `Serializable` transaction. Percentages get two typed helpers (`formatPercent(fraction)` vs `formatPercentPoints(number)`) so the ×100 class of bug is impossible.

#### Gap 2 — The billing half of the business does not exist

A transport ERP without invoicing is an address book. The schema models `Invoice`/`InvoiceItem`/`Payment`/`LoadingOrder`; the seed populates them; but there are **no server actions, no pages, no routes** — `/invoices`, `/loading-orders`, `/documents/*` are 404s or `<div>Placeholder</div>`, and `/suppliers` and `/reports` are stubs too. The entire cost-side (suppliers), the billing lifecycle (invoice → send → pay → reconcile), and analytics are unbuilt. Also a domain modeling gap: `Invoice.supplierId` only — but a brokerage bills **clients** (sales invoices) and receives **supplier** invoices (purchase). You need both directions, or a `type` discriminator.

**How the solution should address it:** build the missing verticals to the quality bar of the (excellent) Clients vertical — Suppliers (list/detail/CRUD), Invoices (purchase + sales), Loading Orders (grouping + PDF), Payments (with `paidAmount` reconciliation), and Reports (margin/revenue). Clarify the billing direction in the model before writing money code.

#### Gap 3 — Documents are the legal artifact; PDF generation is theater

In freight, the **loading order (orden de carga)** is the instruction to the carrier, and the **invoice PDF** is the legal/fiscal document (Spain moving toward mandatory e-invoicing / *Verifactu*). Today PDF generation is a stub that writes fake paths, the settings screen configures paper size/logo/footer for a pipeline that doesn't run, and `RelatedDocuments` opens raw B2 keys (broken + IDOR-shaped). Puppeteer/Chromium are shipped in Docker for nothing.

**How the solution should address it:** implement server-side PDF generation (loading order, invoice) reading company branding + `SettingKey.PDF`, store to B2, serve via **short-lived presigned URLs scoped to the requesting user**, and record real `Document` rows with true size/mime. Design for future e-invoicing (structured invoice data → Facturae/UBL) even if the first version is PDF.

#### Gap 4 — Trust & compliance: audit, retention, and "who did what"

Transport brokers handle client PII, driver data, pricing, and financial records subject to tax retention (Spain: keep books ~4–6 years) and GDPR. The schema has excellent bones — `AuditLog`, soft-deletes, `ServiceStatusHistory` — but: audit stores full record snapshots (leaks pricing/PII, unbounded growth), `ServiceStatusHistory` is populated only by seed and abandoned by the app, the migration's `AuditAction` enum is missing values the app writes (COMPLETE/ARCHIVE/etc. → runtime errors), and there's no retention/partitioning.

**How the solution should address it:** field-level diffs (not whole records) with PII/pricing redaction, populate status history inside every transition transaction, fix the enum drift, add retention/partitioning for audit + email logs, and a documented data-retention & GDPR-erasure policy (soft-delete + scheduled purge + "right to be forgotten" for client contacts).

#### Gap 5 — Security posture for a multi-user financial system

Brokerage staff have real role separation: **operators** book loads, **accountants** handle invoices/payments, **managers** approve, **admins** configure. The RBAC matrix models this well, but enforcement is broken: JWT never re-checks `isActive`/role (deactivation/role-change ineffective for up to 30 days), no object-level ownership (any operator edits any load — IDOR), five divergent permission definitions, secrets (API keys, generated passwords) sent to the browser, `Math.random` passwords, unhashed reset tokens, and no `AUTH_SECRET`/CSP/HSTS. OAuth auto-creates VIEWERs with no allow-list.

**How the solution should address it:** single source of RBAC truth; re-validate session against DB (`isActive`, `tokenVersion`) on every request or use DB sessions; enforce ownership on services/invoices; hash tokens at rest; crypto-random credentials; write-only secret fields; CSP/HSTS; OAuth domain allow-list; and 2FA actually enforced (the toggle exists, the flow doesn't).

#### Gap 6 — Operability: it must survive an unattended midnight

A transport office runs 24/7; loads get booked at 2 AM. The app must degrade gracefully and recover. Today: the dashboard treats every user as "new" (a `_count` cast bug hides all data), the refresh button no-ops (bad `revalidateTag`), dashboard cache is shared across all users (static cache key), email is half-queued/half-inline with no worker, "automatic backups" have no scheduler (false data-safety confidence — the single scariest operability lie), backups can't be restored (restore commented out), migrations run on every replica boot (multi-replica race), and there's no health endpoint, structured logging, or error tracking despite the schema reserving `requestId`.

**How the solution should address it:** fix the cache/count bugs; a real job runner (cron/queue worker) for email, backups, reminders, auto-archive; scheduled + **restorable** backups run as a one-shot job (not per-replica); `/api/health` liveness+readiness; structured logging (pino) + Sentry threading `requestId` through actions and audit; move DB backup/`pg_dump` off the request path and use `execFile` (no shell injection).

#### Gap 7 — Scalability: the data grows load-by-load forever

A busy broker does hundreds of loads/day → hundreds of thousands of services and audit rows/year. Today: uncapped `pageSize` (DoS), leading-wildcard `ILIKE` search across joins (table scans), selectors load *all* clients/suppliers into memory, in-memory rate limiter (defeated by multiple instances), Decimal→float aggregations, and audit/email-log tables with no partitioning. It works at 50 rows, melts at 50,000.

**How the solution should address it:** enforce server-side pagination caps; `pg_trgm`/full-text search indexes; async/paged entity selectors; Redis-backed rate limiting; composite + partial (`WHERE deleted_at IS NULL`) indexes matching real query patterns; SQL-side aggregation for reports; table partitioning for audit/email logs.

#### Gap 8 — Usability & trust: dead affordances erode confidence

Operators trust the tool or they keep a spreadsheet. Today the UI is full of buttons that lie: dead nav links (Suppliers/Reports/Documents/Settings stubs), header actions that toast "success" while doing nothing (archive/send-email), "generate loading order" that opens a 404, keyboard shortcuts advertised but unwired, a registration page that shows the login form, and five different brand names ("Create Next App" in the tab, "Enterprise Dashboard", "Transport ERP", "Transport Management System", "Dashboard"). Plus the styling half-works (missing `@theme` → error text isn't red, alerts have no color, muted text isn't muted, active tabs have no underline).

**How the solution should address it:** remove or implement every dead affordance; one brand identity end-to-end (tab title, logo, emails, layout) sourced from company settings; complete the design system (`@theme` registration, fix `formatCurrency`/`formatPercentage`, controlled inputs); consistent loading/empty/error states; real registration flow; and honest success messaging tied to actual outcomes.

#### The through-line

Two truths: (1) the **domain modeling and the Clients vertical are genuinely good** — the team can build to standard; (2) everything downstream is dragged down by a small set of **root causes** repeated hundreds of times (float money math, one broken percent helper, missing theme registration, controlled-input pattern, duplicated logic, dead routes, unbuilt billing half, unenforced auth). Fixing ~15 root causes fixes hundreds of symptoms. The strategy is: **make the money correct and enforced, build the missing billing/supplier/reporting verticals to the Clients bar, make security/operability real, and delete the theater** — in that order, because a transport ERP that shows the wrong margin or loses a backup at midnight is worse than no ERP.

---

# Part 2 — Trackable Work Items (ordered, complete, nothing skipped)

I'll structure this as one **Epic → Milestones (phases) → Issues**, ordered by fix sequence. Every finding from every round is mapped to an issue (I note the finding IDs inline so nothing is lost). I'll create the epic and issues in GitLab now. Given the volume (~70 issues), I'll create them phase by phase. Let me start by creating the tracking Epic and the Phase 0 (build-breakers) issues, then proceed through each phase.

Before I create ~70 issues in your project, one confirmation so I set this up correctly: **do you want me to create them as GitLab Issues in `hah8433123/transport-erp` now** (I'll create an Epic in the `hah8433123` group + issues in the project, labeled by phase/severity/domain), or would you prefer I first output the full backlog here as a reviewable document (so you can adjust scope/labels) and then create them on your go?

I recommend the latter for a set this large — review once, then I bulk-create. Here is the complete ordered backlog; on your word I'll create every item exactly as listed.

### EPIC: Transport ERP Hardening & Completion

**Phase 0 — Make it compile & boot (P0 blockers).** Nothing else can be verified until these are green.
1. Fix `src/lib/prisma/prisma.ts` — missing `PrismaClient` import (crashes all DB access).
2. Fix `signInWithCredentials` — references undefined `result` (login broken).
3. Rename `src/proxy.ts` → `middleware.ts` (+ edge-safe `auth.config.ts`); restores all route protection, `x-pathname`, settings active-state.
4. Fix `next.config.ts` — duplicate `NextConfig` import (build error).
5. Add missing `import type { Metadata }` in `verify-email/page.tsx` and `reset-password/page.tsx`.
6. Fix `settings/system/page.tsx` — passes `initialSettings` to a propless `SystemSettingsContent` (type error + double fetch).
7. Fix `getUser` `findUnique({deletedAt})` → `findFirst` (runtime throw).
8. Resolve Prisma client generation strategy (`--no-engine` vs prod) + `directUrl`; consistent across scripts/Docker.
9. Fix `scripts/setup-env` `.ts`/`.js` path mismatch.

**Phase 1 — Migration/schema integrity (P0 data).**
10. Fix `AuditAction`/`ServiceStatus` enum drift (add COMPLETE/CANCEL/SEND_EMAIL/GENERATE_DOCUMENT/ARCHIVE/ARCHIVED) via new migration; audit-writes currently throw.
11. Add DB CHECK constraints (non-negative cost/sale/paid; `paidAmount ≤ totalAmount`; total = subtotal+tax−IRPF; no negative margin unless allowed).
12. Partial-unique indexes for soft-deleted reusable codes; keep global unique for invoice/service numbers.
13. Composite + partial (`WHERE deleted_at IS NULL`) indexes for real query patterns.
14. Sequence-based number generation (services/invoices/etc.) replacing `count()+1` race; wire `SettingKey.NUMBER_SEQUENCES`.

**Phase 2 — Auth & security (P0).**
15. JWT session re-checks `isActive`/`role`/`tokenVersion` (deactivation/role-change effective); add `isActive` to session type.
16. Enforce object-level ownership (services/invoices) — kill IDOR; wire the unused `checkResourceOwnership`.
17. Single RBAC source of truth; delete `auth-helpers.hasPermission`, `settings/layout` roles, inline page checks → `permissions.ts`.
18. Hash reset/verification tokens at rest; fix corrupted `PASSWORD_RESET` prefix; POST-confirm verification (stop GET/prefetch token burn).
19. Crypto-random generated passwords (`UserForm`); never surface passwords in toasts/clipboard; write-only secret fields (`EmailConfig` apiKey/password).
20. OAuth domain/invite allow-list; remove or configure Microsoft provider (currently dead).
21. Redis/DB-backed rate limiter (replace in-memory); rate-limit verification/reset email sends.
22. `AUTH_SECRET` required + documented; CSP + HSTS headers; fix `.env.example` to match real infra (B2/Resend), remove phantom vars.
23. Bulk ops (`bulkUpdateServices`/`bulkDeleteServices`) enforce same invariants as single ops (`deletedAt`, completed/invoiced guards).
24. Audit log field-level diffs + PII/pricing redaction; retention/partitioning.

**Phase 3 — Financial correctness (P0/P1).**
25. `Money`/Decimal module; forbid `Number(decimal)` via lint.
26. Single `pricing.ts` (margin/markup/VAT/IRPF/totals); consumed by form, calculator, table, detail, server actions.
27. Fix `formatCurrency` (2 decimals, currency-aware) and split `formatPercentage` → `formatPercent`/`formatPercentPoints`; fix every call site (StatsCard, MiniStats, ServicesTable, ServiceRow, ServicesMobileView, ServiceDetail, PricingCalculator, ServiceForm, PerformanceTip×2, ClientDetail `%%`, VAT-rate displays).
28. Wrap all mutations in `withTransaction`; make `createAuditLog` tx-aware; populate `ServiceStatusHistory` on every transition; add status state-machine.
29. Fix destructive cancel (ServiceForm zeros prices irreversibly; server too).

**Phase 4 — Build the missing verticals (P1, to Clients-quality bar).**
30. Suppliers vertical: actions + list/detail/new/edit pages (currently stub); typed DTOs.
31. Invoice domain: clarify sales vs purchase direction; `invoice-actions` + pages; derived `paidAmount`/status in tx.
32. Payments: actions + UI; reconciliation.
33. Loading Orders: grouping + generation + pages.
34. Reports: revenue + margins pages (currently stubs) with SQL-side aggregation.
35. Documents module + PDF generation (loading order/invoice) reading company + `SettingKey.PDF`; presigned URLs; real Document rows; fix `RelatedDocuments` (wrong `attachments` field, raw-key open).
36. Registration flow: real `RegisterForm` + wire `/register` (currently shows login); gate behind `ENABLE_USER_REGISTRATION`.
37. Profile/Security/Audit/Permissions settings sub-pages (dead nav targets) or remove from nav.

**Phase 5 — Operability & reliability (P1/P2).**
38. Fix dashboard `_count._all` cast (everyone shows as "new user"); fix `getDashboardData` per-scope cache key; fix `revalidateTag` no-op refresh.
39. Job runner (cron/queue) for: email queue worker (+ fix double-serialize + claim-locking), scheduled backups, reminders, auto-archive.
40. Backups: real scheduler honoring settings/timezone; restore path; run as one-shot job not per-replica; `execFile` (no shell injection); use `backup.storageLocation`.
41. Unify email: delete `lib/email/email.ts` + `mail-schema`; runtime sender reads DB `SettingKey.EMAIL`; reconcile provider config.
42. `/api/health` liveness+readiness (wire `checkDatabaseHealth`); Docker entrypoint waits on readiness; single entrypoint (delete duplicate).
43. Structured logging (pino) + Sentry; thread `requestId` through actions + audit; remove `console.log`s (QuickActions role, UserManagement actions).
44. Fix `RecentServices` `next/router` → `next/navigation` (App Router crash).
45. Docker: Node 22 (match engines), drop Chromium if PDF deferred, add `@svgr/webpack` or remove SVGR, fix `next/image` remotePatterns for B2, move migrations to job.

**Phase 6 — Scalability (P1/P2).**
46. Enforce pagination caps server-side (`getServices` uncapped pageSize DoS).
47. `pg_trgm`/full-text search; remove leading-wildcard ILIKE joins.
48. Async/paged `ClientSelector`/`SupplierSelector` (currently load all).
49. Stream large file downloads (storage `getFile` buffers whole object); lazy B2 client/config (boot crash on missing env); re-enable readiness probe.
50. Replace `xlsx` (CVEs) with `exceljs`; single CSV/export utility (dedupe 4 implementations).

**Phase 7 — Design system & UI correctness (P1/P2).**
51. Complete `globals.css`: add Tailwind v4 `@theme` (register `primary-*`, `danger`, `success-*`, `feedback-*`, `status-*`, `financial-*`, `muted-foreground`, `foreground`, `background`); remove core-utility overrides (`.text-sm/.text-xs/.gap-8`); fix malformed classes (`ps-9)]`, `rounded-radius-md`, `support-*`, `skeleton-wave`, `bg-neutral`, `bg-opacity-*`, dynamic `bg-${trendColor}` in ServiceChart).
52. Fix base inputs' controlled/uncontrolled sync (Input, Checkbox indeterminate, DatePicker, TimeInput, Switch `{...field}`, `use-table-selection`, `use-debounce`/`use-auto-save`).
53. Implement or remove `Button.asChild` (nested `<button><a>` across auth footer, ClientsTable, ClientDetail, verify-email, EmptyState).
54. Replace broken `DatePicker` calendar (use `react-day-picker`); fix constraint `??`→`||`.
55. Fix `Tooltip` nested-button (wraps triggers in `<button>` → invalid HTML app-wide).
56. Fix duplicate React keys (Pagination ellipsis, SkeletonGroup); `General.tsx` key on Controller.
57. CSS-driven responsive layout (replace `useMediaQuery` structural decisions → hydration/CLS); add `ThemeProvider` (dark:/useTheme inert); load-or-drop Geist fonts.
58. Fix `Select` keyboard nav stub; `DropdownMenu` focus/activation + falsy-item crash guard; `Modal`/`MobileMenu` `<dialog>` without `showModal()`; focus-trap stale nodes; scroll-lock ref-count.
59. `id`/`useId` plumbing for label association + `aria-describedby` (FormField/Input/Checkbox/Select/Radio); Radio shared-ref bug.
60. `useUnsavedChanges` reliable `beforeunload` + App Router navigation guard.

**Phase 8 — Consistency, dedup, branding, cleanup (P2).**
61. One brand identity (root metadata "Create Next App", Logo "Enterprise", layout "Transport ERP", "Transport Management System", email domain) sourced from company settings.
62. Delete dead/duplicate code: `OldServiceTable`, `ServiceRow` (if orphaned), `features/users/*` (create-user-dialog no-op, UsersList dead), duplicate `Header` (`services/` vs `dashboard/`), duplicate `getBreadcrumbs`, duplicate `cn.ts`, three `ActionResult` types, `ClientFormData` orphan, `email.ts`.
63. Remove/implement dead routes & affordances: `/invoices`,`/loading-orders`,`/documents/*`,`/import`,`/profile`,`/help/*`,`/support`,`/suppliers/[id]`,`/settings/{profile,security,backup,audit,permissions}`, `?clientId` ignored by new-service, header archive/send-email no-op success toasts, unwired hotkeys/Esc, `/api/services/export` missing.
64. Fix redirect targets to dead `/settings/profile` (users/company pages, settings layout) and route-vs-matrix RBAC mismatch (managers broken).
65. Replace remaining `any` service shapes with typed DTOs (service-actions spreads, ServiceDetail/Header/Sidebar); `updateUser` `as any`; `service.urgent`/`client.email` phantom fields.
66. Fix settings key mismatch (seed `company.info` vs runtime `SettingKey.*`); wire dead settings (2FA, requireClientVat, tax defaults, itemsPerPage, autoArchive) or remove.
67. Normalize address JSON→columns where queried (CompanyForm loses city/postal); reconcile `Company` structured columns.
68. Seed: add SUPER_ADMIN; guard `prisma:seed:prod`; align seeded keys with runtime; fix serviceNumber-based dead links in notifications.

**Phase 9 — Testing & docs (P1, alongside all phases).**
69. Test infra (pick Jest OR Vitest); unit tests for `permissions`, `pricing`, token/password logic; RBAC + IDOR integration; money invariants; status transitions; Playwright E2E (login→client→supplier→service→invoice→payment).
70. Rewrite READMEs around workflows; ERD; sequence diagram; seed credentials; deploy/runbook; data-retention & GDPR policy; fix `prisma/README` false claims (auto-backups, connection pooling).

**Confirm** and I'll create the Epic + all 70 issues (with severity/phase/domain labels, dependencies via issue links, and each finding's file:line traces in the descriptions) in `hah8433123/transport-erp`. If you'd rather I create them phase-by-phase so you can review the first batch's format before I proceed, say "start with Phase 0" and I'll create those first.