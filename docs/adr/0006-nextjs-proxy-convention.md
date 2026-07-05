# ADR 0006: src/proxy.ts IS the middleware (Next 16 convention)

Status: Accepted (retro-documented 2026-07-05; verified Phase 0, #7)

## Decision

Next 16 renamed the middleware convention to `proxy.ts`, running on the
NODE.JS runtime. Therefore:

- `src/proxy.ts` is the running middleware. Do NOT rename it to
  middleware.ts and do NOT add an edge-safe auth.config.ts split -
  importing the full auth stack there is legitimate on the Node runtime.
  (The empty auth.config.ts was a dead file, deleted in !14.)
- proxy.ts owns per-request cross-cutting concerns: x-request-id minting
  (#21), route protection (auth + canAccessRoute), the
  x-user-*/x-pathname headers, and the per-request CSP nonce (#63).
- API routes with their own auth are enumerated in API_ROUTES
  (/api/auth, /api/health, /api/jobs).

## Consequences

This is KNOWN CORRECTION #2 from the review (see CONTRIBUTING): a
well-meaning "fix" back to middleware.ts breaks the app. This ADR exists
so the convention survives contributor turnover.
