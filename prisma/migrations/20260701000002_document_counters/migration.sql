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

-- Backfill counters from existing rows (review !15 item 2): on a pre-existing
-- database that already holds numbers created by the old count()+1 path, an
-- unseeded counter would restart at 1 and collide with the globally-unique
-- number indexes (P2002). Migrations must stand alone for existing databases;
-- the seed is only a dev convenience.
--
-- Idempotent and monotone: GREATEST() never lowers a counter on re-run.
INSERT INTO "document_counters" ("scope", "value")
SELECT split_part(n, '-', 1) || '-' || split_part(n, '-', 2) AS scope,
       MAX(split_part(n, '-', 3)::bigint)                    AS value
FROM (
  SELECT "serviceNumber" AS n FROM "services"
  UNION ALL SELECT "invoiceNumber" FROM "invoices"
  UNION ALL SELECT "paymentNumber" FROM "payments"
  UNION ALL SELECT "orderNumber"   FROM "loading_orders"
) numbers
WHERE n ~ '^[A-Z]+-[0-9]{4}-[0-9]+$'
GROUP BY 1
ON CONFLICT ("scope") DO UPDATE
  SET "value"     = GREATEST("document_counters"."value", EXCLUDED."value"),
      "updatedAt" = now();
