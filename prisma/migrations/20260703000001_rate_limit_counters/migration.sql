-- Cross-process rate limiting (issue #22).
--
-- One row per limiter key ("scope:email:ip", e.g.
-- 'login:user@example.com:203.0.113.7'). The application mutates a row only
-- inside a transaction that first takes its row lock:
--
--   INSERT ... ON CONFLICT ("key") DO NOTHING;   -- ensure the row exists
--   SELECT ... WHERE "key" = $1 FOR UPDATE;      -- serialise the attempt
--   UPDATE ... ;                                 -- persist the decision
--
-- so concurrent attempts on the same key - from ANY app instance - are
-- counted atomically. This replaces the in-memory module-scope Map, which
-- was per-process (each instance granted a full budget), never incremented
-- on check (off-by-one), and leaked its setInterval cleanup in serverless.
--
-- Rows are deleted on reset (successful login), which keeps the table trim.

CREATE TABLE IF NOT EXISTS "rate_limit_counters" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limit_counters_pkey" PRIMARY KEY ("key")
);

-- The opportunistic prune in consume() scans on updatedAt (review !22 item 1).
CREATE INDEX IF NOT EXISTS "rate_limit_counters_updatedAt_idx" ON "rate_limit_counters"("updatedAt");
