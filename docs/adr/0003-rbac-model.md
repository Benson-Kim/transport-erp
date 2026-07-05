# ADR 0003: Single-source RBAC model

Status: Accepted (retro-documented 2026-07-05; decision landed Phase 2, #17)

## Decision

`src/lib/permissions.ts` is the ONE permission matrix (resource x action per
role). Enforcement wrappers live in `src/lib/rbac.ts` (`requirePermission`,
`checkPermission`, `requireServiceAccess`, `checkResourceOwnership`,
typed `UnauthorizedError`/`ForbiddenError`); the client mirror is
`usePermissions()` - UI convenience ONLY, never authority.

Rules that bind every new vertical:
- Every server action starts with auth + `requirePermission`, plus
  ownership where the resource is user-scoped (services carry
  createdById/assignedToId; clients deliberately do not).
- OPERATOR is ownership-scoped; bulk operations are a FOLD of the
  single-op guards and re-assert them INSIDE the mutation's WHERE (TOCTOU).
- Never add a parallel permission check; extend the matrix.
- Route gating is defense-in-depth in `src/proxy.ts` (`canAccessRoute`);
  actions must not rely on it.

## Consequences

The matrix is unit-tested (tests/unit/permissions.test.ts,
rbac-service-access.test.ts). Divergent `hasPermission` copies were deleted
in #17 and must not return.
