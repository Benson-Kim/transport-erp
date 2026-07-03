/**
 * #21 - audit_logs monthly partitioning + retention against a real Postgres.
 *
 * Proves: the table is genuinely partitioned; fresh rows land in their
 * monthly partition with the users FK intact; partition maintenance is
 * idempotent; retention drops only wholly-expired monthly partitions; and
 * email_logs purging respects its horizon.
 */
import { afterAll, expect, it } from '@jest/globals';

import { prisma, uid, createUserFixture } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

it('audit_logs is a partitioned table with a default partition (#21)', async () => {
  const rows = await prisma.$queryRaw<{ relkind: string }[]>`
    SELECT c.relkind::text AS "relkind"
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'audit_logs' AND n.nspname = current_schema()
  `;
  expect(rows[0]?.relkind).toBe('p');

  const def = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT (to_regclass('audit_logs_default') IS NOT NULL) AS "exists"
  `;
  expect(def[0]?.exists).toBe(true);
});

it('audit_logs_ensure_partitions is idempotent (#21)', async () => {
  // First call may create partitions (e.g. beyond the fixed 2027-12 set);
  // the second call over the same horizon must create none.
  await prisma.$queryRaw`SELECT audit_logs_ensure_partitions(24)`;
  const second = await prisma.$queryRaw<{ created: number }[]>`
    SELECT audit_logs_ensure_partitions(24) AS "created"
  `;
  expect(second[0]?.created).toBe(0);
});

it('a fresh audit row lands in its monthly partition, users FK intact (#21)', async () => {
  // Guarantee the current month's partition regardless of the fixed set's
  // horizon (keeps this test green after 2027-12).
  await prisma.$queryRaw`SELECT audit_logs_ensure_partitions(1)`;

  const user = await createUserFixture();
  const recordId = `svc-${uid()}`;

  await prisma.auditLog.create({
    data: { userId: user.id, action: 'UPDATE', tableName: 'services', recordId },
  });

  const rows = await prisma.$queryRaw<{ partition: string }[]>`
    SELECT tableoid::regclass::text AS "partition"
    FROM "audit_logs"
    WHERE "recordId" = ${recordId}
  `;
  expect(rows).toHaveLength(1);
  expect(rows[0]?.partition).toMatch(/^audit_logs_y\d{4}m\d{2}$/);

  // FK enforcement survives partitioning: an unknown userId is rejected.
  await expect(
    prisma.auditLog.create({
      data: {
        userId: `missing-${uid()}`,
        action: 'UPDATE',
        tableName: 'services',
        recordId: `svc-${uid()}`,
      },
    })
  ).rejects.toThrow();
});

it('audit_logs_drop_expired drops only wholly-expired monthly partitions (#21)', async () => {
  // Plant an ancient partition (predates the fixed set).
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS "audit_logs_y2019m01" PARTITION OF "audit_logs"
    FOR VALUES FROM ('2019-01-01') TO ('2019-02-01')
  `;

  const dropped = await prisma.$queryRaw<{ dropped: number }[]>`
    SELECT audit_logs_drop_expired(72) AS "dropped"
  `;
  expect(dropped[0]?.dropped).toBeGreaterThanOrEqual(1);

  const gone = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT (to_regclass('audit_logs_y2019m01') IS NOT NULL) AS "exists"
  `;
  expect(gone[0]?.exists).toBe(false);

  // The DEFAULT partition and the current window are untouched.
  const kept = await prisma.$queryRaw<{ def: boolean }[]>`
    SELECT (to_regclass('audit_logs_default') IS NOT NULL) AS "def"
  `;
  expect(kept[0]?.def).toBe(true);
});

it('email_logs_purge_expired purges old rows, keeps fresh ones (#21)', async () => {
  const oldTo = `old-${uid()}@example.test`;
  const freshTo = `fresh-${uid()}@example.test`;

  await prisma.emailLog.create({
    data: {
      to: oldTo,
      subject: 'ancient',
      status: 'sent',
      createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.emailLog.create({
    data: { to: freshTo, subject: 'recent', status: 'sent' },
  });

  await prisma.$queryRaw`SELECT email_logs_purge_expired(365)`;

  expect(await prisma.emailLog.findFirst({ where: { to: oldTo } })).toBeNull();
  expect(await prisma.emailLog.findFirst({ where: { to: freshTo } })).not.toBeNull();
});
