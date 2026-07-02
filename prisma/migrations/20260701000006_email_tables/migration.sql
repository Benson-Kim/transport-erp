-- Reconcile pre-existing drift surfaced by the binary drift-check gate:
-- the EmailQueue/EmailLog models were added to schema.prisma without a
-- migration (predates Phase 1). SQL taken verbatim from the
-- `prisma migrate diff` output of pipeline 2646630386, with IF NOT EXISTS
-- guards so the migrate-fresh raw re-apply loop keeps proving idempotency.

CREATE TABLE IF NOT EXISTS "email_queue" (
    "id" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "messageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_queue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "email_logs" (
    "id" TEXT NOT NULL,
    "messageId" TEXT,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "email_queue_status_scheduledAt_idx" ON "email_queue"("status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "email_queue_priority_createdAt_idx" ON "email_queue"("priority", "createdAt");
CREATE INDEX IF NOT EXISTS "email_logs_to_createdAt_idx" ON "email_logs"("to", "createdAt");
CREATE INDEX IF NOT EXISTS "email_logs_status_createdAt_idx" ON "email_logs"("status", "createdAt");
