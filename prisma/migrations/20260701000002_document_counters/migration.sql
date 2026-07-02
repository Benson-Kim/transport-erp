-- Race-free business-number allocation (issue #12).
--
-- One row per (prefix, year) scope, e.g. scope = 'SRV-2026'. Callers bump the
-- counter with a single atomic statement:
--
--   INSERT INTO document_counters (scope, value) VALUES ($1, 1)
--   ON CONFLICT (scope) DO UPDATE SET value = document_counters.value + 1,
--                                     "updatedAt" = now()
--   RETURNING value;
--
-- The ON CONFLICT UPDATE takes a row-level lock, so concurrent transactions
-- allocating the same scope are serialised and each gets a distinct value.
-- This replaces count()+1 / findFirst()+1, which could hand the same number to
-- two concurrent creates.

CREATE TABLE IF NOT EXISTS "document_counters" (
    "scope" TEXT NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("scope")
);
