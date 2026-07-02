-- Reconcile DB enums and columns with schema.prisma (issue #10).
--
-- The initial migration (20251104120216_initial_seed) predates schema changes
-- that added enum values and services.archivedAt. This migration brings the DB
-- back in sync. All statements are idempotent so it runs cleanly on a fresh DB
-- (created from the initial migration) and on an already-seeded DB.
--
-- Note: `ALTER TYPE ... ADD VALUE` must be committed before the value can be
-- used. Keeping these additions in a dedicated migration guarantees they land
-- before the CHECK/sequence/index migrations that follow.

-- ServiceStatus: add ARCHIVED
ALTER TYPE "ServiceStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

-- AuditAction: add COMPLETE, CANCEL, SEND_EMAIL, GENERATE_DOCUMENT, ARCHIVE,
-- and PERMISSION_CHECK (written by src/lib/rbac.ts:auditPermissionCheck)
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'COMPLETE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'CANCEL';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'SEND_EMAIL';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'GENERATE_DOCUMENT';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ARCHIVE';
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'PERMISSION_CHECK';

-- services.archivedAt: present in schema.prisma but missing from the DB
ALTER TABLE "services" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
