/**
 * #21 - createAuditLog stores field-level diffs (not snapshots), records
 * sensitive changes without their content, and populates requestId.
 *
 * Uses a capturing fake AuditLogWriter - the same structural seam the
 * transaction client flows through - so the helper's storage contract is
 * pinned without a database.
 */
import { expect, it, jest } from '@jest/globals';

// Unit convention (rate-limiter.test.ts, db-helpers-tx.test.ts): no unit
// suite may construct the real Prisma singleton. Instantiating the
// $extends-ed client fires an async engine/connection probe against
// DATABASE_URL that rejects AFTER the run in the no-DB test-unit job and
// crashes it (unhandled P1001). Every write here uses the fake writer.
jest.mock('@/lib/prisma/prisma', () => ({ __esModule: true, default: {} }));

import { Prisma } from '@/app/generated/prisma';
import { createAuditLog } from '@/lib/prisma/db-helpers';

interface CapturedWrite {
  data: Record<string, unknown>;
}

function makeWriter() {
  const writes: CapturedWrite[] = [];
  return {
    writes,
    writer: {
      auditLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          writes.push(args);
          return args.data;
        },
      },
    },
  };
}

function captured(writes: CapturedWrite[], index: number): Record<string, unknown> {
  const write = writes[index];
  if (!write) throw new Error(`no audit write captured at index ${index}`);
  return write.data;
}

it('stores changed keys only - never whole-record snapshots (#21)', async () => {
  const { writes, writer } = makeWriter();

  await createAuditLog(
    {
      userId: 'user-1',
      action: 'UPDATE',
      tableName: 'services',
      recordId: 'svc-1',
      oldValues: {
        origin: 'Madrid',
        destination: 'Barcelona',
        driverName: 'Paco',
        internalNotes: 'secret note',
        costAmount: new Prisma.Decimal('100.00'),
        saleAmount: new Prisma.Decimal('150.00'),
      },
      newValues: {
        origin: 'Madrid',
        destination: 'Valencia',
        driverName: 'Paco',
        internalNotes: 'other note',
        costAmount: new Prisma.Decimal('100.00'),
        saleAmount: new Prisma.Decimal('160.00'),
      },
    },
    writer
  );

  const data = captured(writes, 0);
  expect(data['oldValues']).toEqual({ destination: 'Barcelona' });
  expect(data['newValues']).toEqual({ destination: 'Valencia' });

  const metadata = data['metadata'] as Record<string, unknown>;
  expect(metadata['changedFields']).toEqual(['destination', 'internalNotes', 'saleAmount']);

  const serialized = JSON.stringify(data);
  expect(serialized).not.toContain('secret note');
  expect(serialized).not.toContain('other note');
  expect(serialized).not.toContain('160');
});

it('an explicit requestId is stored verbatim (#21)', async () => {
  const { writes, writer } = makeWriter();

  await createAuditLog(
    { action: 'CREATE', tableName: 'clients', recordId: 'c1', requestId: 'req-abc-123' },
    writer
  );

  expect(captured(writes, 0)['requestId']).toBe('req-abc-123');
});

it('requestId falls back to null outside a request scope (#21)', async () => {
  const { writes, writer } = makeWriter();

  // Unit tests run outside a Next request scope: getRequestId() resolves
  // undefined and the column stores null. In the app, proxy.ts mints the
  // header for every request, so real writes carry an id.
  await createAuditLog({ action: 'CREATE', tableName: 'clients', recordId: 'c2' }, writer);

  expect(captured(writes, 0)['requestId']).toBeNull();
});
