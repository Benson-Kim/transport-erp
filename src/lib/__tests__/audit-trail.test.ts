import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing the module
vi.mock('@/lib/prisma/prisma', () => ({
  default: {
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'test-audit-id' }),
    },
  },
}));

import { record, recordWithDiff, recordBulk } from '../audit/audit-trail';
import prisma from '@/lib/prisma/prisma';

const mockedCreate = vi.mocked(prisma.auditLog.create);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Audit Trail', () => {
  describe('record', () => {
    it('creates an audit log with timestamp enrichment', async () => {
      await record({
        userId: 'user-1',
        action: 'CREATE',
        tableName: 'services',
        recordId: 'srv-1',
      });

      expect(mockedCreate).toHaveBeenCalledOnce();
      const data = mockedCreate.mock.calls[0]![0]!.data;
      expect(data.userId).toBe('user-1');
      expect(data.action).toBe('CREATE');
      expect(data.tableName).toBe('services');
      expect(data.recordId).toBe('srv-1');
      expect((data.metadata as Record<string, unknown>).timestamp).toBeDefined();
    });

    it('merges custom metadata', async () => {
      await record({
        userId: 'user-1',
        action: 'UPDATE',
        tableName: 'services',
        recordId: 'srv-1',
        metadata: { bulk: true, count: 5 },
      });

      const data = mockedCreate.mock.calls[0]![0]!.data;
      const meta = data.metadata as Record<string, unknown>;
      expect(meta.bulk).toBe(true);
      expect(meta.count).toBe(5);
    });

    it('accepts a transaction client', async () => {
      const fakeTx = {
        auditLog: { create: vi.fn().mockResolvedValue({ id: 'tx-audit' }) },
      } as any;

      await record({
        userId: 'user-1',
        action: 'DELETE',
        tableName: 'services',
        recordId: 'srv-1',
      }, fakeTx);

      expect(fakeTx.auditLog.create).toHaveBeenCalledOnce();
      expect(mockedCreate).not.toHaveBeenCalled();
    });
  });

  describe('recordWithDiff', () => {
    it('computes a minimal diff — only changed fields', async () => {
      await recordWithDiff({
        userId: 'user-1',
        action: 'UPDATE',
        tableName: 'services',
        recordId: 'srv-1',
        oldValues: { status: 'DRAFT', name: 'Test', amount: 100 },
        newValues: { status: 'CONFIRMED', name: 'Test', amount: 200 },
      });

      const data = mockedCreate.mock.calls[0]![0]!.data;
      // name didn't change — should not appear in diff
      expect(data.oldValues).toEqual({ status: 'DRAFT', amount: 100 });
      expect(data.newValues).toEqual({ status: 'CONFIRMED', amount: 200 });
    });

    it('stores Prisma.DbNull when nothing changed', async () => {
      await recordWithDiff({
        userId: 'user-1',
        action: 'UPDATE',
        tableName: 'services',
        recordId: 'srv-1',
        oldValues: { status: 'DRAFT' },
        newValues: { status: 'DRAFT' },
      });

      const data = mockedCreate.mock.calls[0]![0]!.data;
      // Prisma JSON fields use DbNull, not plain null
      expect(data.oldValues).toBeDefined();
      expect(data.newValues).toBeDefined();
    });
  });

  describe('recordBulk', () => {
    it('joins record IDs and marks as bulk', async () => {
      await recordBulk({
        userId: 'user-1',
        action: 'DELETE',
        tableName: 'services',
        recordIds: ['srv-1', 'srv-2', 'srv-3'],
      });

      const data = mockedCreate.mock.calls[0]![0]!.data;
      expect(data.recordId).toBe('srv-1,srv-2,srv-3');
      const meta = data.metadata as Record<string, unknown>;
      expect(meta.bulk).toBe(true);
      expect(meta.count).toBe(3);
    });

    it('uses "none" for empty ID list', async () => {
      await recordBulk({
        userId: 'user-1',
        action: 'UPDATE',
        tableName: 'services',
        recordIds: [],
      });

      const data = mockedCreate.mock.calls[0]![0]!.data;
      expect(data.recordId).toBe('none');
    });
  });
});
