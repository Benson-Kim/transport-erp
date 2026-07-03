-- #21: monthly RANGE partitioning + retention for audit_logs; retention for
-- email_logs.
--
-- audit_logs grows unbounded at brokerage volume and must satisfy Spanish
-- fiscal retention (~6 years) + GDPR minimisation. Monthly partitions make
-- retention a metadata-only DROP TABLE per expired month.
--
-- Idempotency: the migrate-fresh CI job re-applies this file's raw SQL
-- against an already-migrated DB. The conversion is guarded on relkind
-- (re-apply is a no-op) and the functions use CREATE OR REPLACE.
--
-- SQL-managed objects Prisma cannot express (enumerated in the drift-check
-- allowlist): the partition children (audit_logs_default + the fixed
-- monthly set) and the three maintenance functions. The parent table itself
-- matches the Prisma model, including the composite PK (id, createdAt) -
-- a partitioned table's PK must include the partition key.

-- 1) Convert audit_logs (ordinary table, relkind 'r') to a partitioned
--    table. Everything happens inside the guard so a re-apply is a no-op.
DO $$
DECLARE
  m date;
  part text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'audit_logs'
      AND c.relkind = 'r'
      AND n.nspname = current_schema()
  ) THEN
    -- Free the table and index/constraint names for the new parent.
    ALTER TABLE "audit_logs" RENAME TO "audit_logs_unpartitioned";
    ALTER TABLE "audit_logs_unpartitioned"
      RENAME CONSTRAINT "audit_logs_pkey" TO "audit_logs_unpartitioned_pkey";
    ALTER INDEX "audit_logs_userId_idx" RENAME TO "audit_logs_unpartitioned_userId_idx";
    ALTER INDEX "audit_logs_tableName_recordId_idx" RENAME TO "audit_logs_unpartitioned_tableName_recordId_idx";
    ALTER INDEX "audit_logs_action_idx" RENAME TO "audit_logs_unpartitioned_action_idx";
    ALTER INDEX "audit_logs_createdAt_idx" RENAME TO "audit_logs_unpartitioned_createdAt_idx";

    CREATE TABLE "audit_logs" (
        "id" TEXT NOT NULL,
        "userId" TEXT,
        "action" "AuditAction" NOT NULL,
        "tableName" TEXT NOT NULL,
        "recordId" TEXT NOT NULL,
        "oldValues" JSONB,
        "newValues" JSONB,
        "ipAddress" TEXT,
        "userAgent" TEXT,
        "requestId" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id", "createdAt"),
        CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
    ) PARTITION BY RANGE ("createdAt");

    CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
    CREATE INDEX "audit_logs_tableName_recordId_idx" ON "audit_logs"("tableName", "recordId");
    CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
    CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

    -- DEFAULT partition: pre-2026-07 rows and any outliers. Excluded from
    -- retention drops by name.
    CREATE TABLE "audit_logs_default" PARTITION OF "audit_logs" DEFAULT;

    -- FIXED monthly set 2026-07 .. 2027-12. Deterministic names keep the
    -- drift-check exact-name allowlist stable; audit_logs_ensure_partitions
    -- (below, called by the job runner) extends the horizon before 2028.
    -- These MUST exist before the data copy: rows landing in DEFAULT would
    -- block later creation of overlapping monthly partitions.
    m := DATE '2026-07-01';
    WHILE m <= DATE '2027-12-01' LOOP
      part := format('audit_logs_y%sm%s', to_char(m, 'YYYY'), to_char(m, 'MM'));
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF "audit_logs" FOR VALUES FROM (%L) TO (%L)',
        part, m, (m + interval '1 month')
      );
      m := (m + interval '1 month')::date;
    END LOOP;

    INSERT INTO "audit_logs"
      ("id", "userId", "action", "tableName", "recordId", "oldValues", "newValues",
       "ipAddress", "userAgent", "requestId", "metadata", "createdAt")
    SELECT
      "id", "userId", "action", "tableName", "recordId", "oldValues", "newValues",
      "ipAddress", "userAgent", "requestId", "metadata", "createdAt"
    FROM "audit_logs_unpartitioned";

    DROP TABLE "audit_logs_unpartitioned";
  END IF;
END $$;

-- 2) Partition maintenance: create partitions for the current month and the
--    next months_ahead months. Returns how many were created (0 = up to
--    date). Scheduled invocation belongs to the job runner; safe to call
--    from anywhere - creation is guarded per partition.
CREATE OR REPLACE FUNCTION audit_logs_ensure_partitions(months_ahead integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  m date;
  part text;
  created integer := 0;
BEGIN
  FOR i IN 0..months_ahead LOOP
    m := (date_trunc('month', now()) + make_interval(months => i))::date;
    part := format('audit_logs_y%sm%s', to_char(m, 'YYYY'), to_char(m, 'MM'));
    IF to_regclass(part) IS NULL THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF "audit_logs" FOR VALUES FROM (%L) TO (%L)',
        part, m, (m + interval '1 month')
      );
      created := created + 1;
    END IF;
  END LOOP;
  RETURN created;
END
$fn$;

-- 3) Retention: drop monthly partitions lying WHOLLY before the horizon
--    (default 72 months = 6 years, Spain fiscal retention). The DEFAULT
--    partition and the current window are never touched: only partitions
--    matching the monthly naming pattern whose entire range is expired.
CREATE OR REPLACE FUNCTION audit_logs_drop_expired(retention_months integer DEFAULT 72)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  r record;
  part_month date;
  cutoff date := (date_trunc('month', now()) - make_interval(months => retention_months))::date;
  dropped integer := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'audit_logs'
      AND c.relname ~ '^audit_logs_y\d{4}m\d{2}$'
  LOOP
    -- 'audit_logs_y2026m07': year at chars 13-16, month at chars 18-19.
    part_month := make_date(
      substring(r.relname FROM 13 FOR 4)::integer,
      substring(r.relname FROM 18 FOR 2)::integer,
      1
    );
    IF (part_month + interval '1 month') <= cutoff THEN
      EXECUTE format('DROP TABLE %I', r.relname);
      dropped := dropped + 1;
    END IF;
  END LOOP;
  RETURN dropped;
END
$fn$;

-- 4) email_logs retention: batched DELETE (low volume - partitioning would
--    be over-engineering here). Default horizon 365 days.
CREATE OR REPLACE FUNCTION email_logs_purge_expired(retention_days integer DEFAULT 365)
RETURNS integer
LANGUAGE plpgsql
AS $fn$
DECLARE
  purged integer;
BEGIN
  DELETE FROM "email_logs" WHERE "createdAt" < now() - make_interval(days => retention_days);
  GET DIAGNOSTICS purged = ROW_COUNT;
  RETURN purged;
END
$fn$;
