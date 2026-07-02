/**
 * #27 - withTransaction: ReadCommitted default, Serializable opt-in, and
 * bounded retry on serialization failures (Postgres 40001 / Prisma P2034).
 * createAuditLog writes through the provided transaction client so the
 * audit row shares the mutation's commit/rollback.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { AuditAction } from '@/app/generated/prisma';
import { createAuditLog, withTransaction } from '@/lib/prisma/db-helpers';

const mockTransaction = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGlobalAuditCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@/lib/prisma/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    auditLog: {
      create: (...args: unknown[]) => mockGlobalAuditCreate(...args),
    },
  },
}));

function serializationFailure() {
  const error = new Error('could not serialize access due to concurrent update');
  (error as Error & { code: string }).code = 'P2034';
  return error;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGlobalAuditCreate.mockResolvedValue({});
});

describe('withTransaction retry (#27)', () => {
  it('retries serialization failures with backoff and succeeds', async () => {
    mockTransaction
      .mockRejectedValueOnce(serializationFailure())
      .mockRejectedValueOnce(serializationFailure())
      .mockResolvedValueOnce('committed');

    await expect(withTransaction(async () => 'unused')).resolves.toBe('committed');
    expect(mockTransaction).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry non-serialization errors', async () => {
    const unique = new Error('duplicate key');
    (unique as Error & { code: string }).code = 'P2002';
    mockTransaction.mockRejectedValue(unique);

    await expect(withTransaction(async () => 'unused')).rejects.toThrow('duplicate key');
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries and rethrows', async () => {
    mockTransaction.mockRejectedValue(serializationFailure());

    await expect(withTransaction(async () => 'unused', { maxRetries: 2 })).rejects.toThrow(
      /serialize/
    );
    // 1 initial attempt + 2 retries
    expect(mockTransaction).toHaveBeenCalledTimes(3);
  });

  it('defaults to ReadCommitted; money paths opt into Serializable', async () => {
    mockTransaction.mockResolvedValue('ok');

    await withTransaction(async () => 'unused');
    await withTransaction(async () => 'unused', { isolationLevel: 'Serializable' });

    expect(mockTransaction.mock.calls[0]?.[1]).toMatchObject({
      isolationLevel: 'ReadCommitted',
    });
    expect(mockTransaction.mock.calls[1]?.[1]).toMatchObject({
      isolationLevel: 'Serializable',
    });
  });
});

describe('createAuditLog tx-awareness (#27)', () => {
  it('writes through the provided transaction client, not the global one', async () => {
    const txCreate = jest.fn<(args: unknown) => Promise<unknown>>().mockResolvedValue({});
    const txClient = {
      auditLog: {
        create: (args: { data: Record<string, unknown> }) => txCreate(args),
      },
    };

    await createAuditLog(
      {
        userId: 'u1',
        action: AuditAction.UPDATE,
        tableName: 'services',
        recordId: 's1',
      },
      txClient
    );

    expect(txCreate).toHaveBeenCalledTimes(1);
    expect(mockGlobalAuditCreate).not.toHaveBeenCalled();
  });

  it('defaults to the global client for callers outside a transaction', async () => {
    await createAuditLog({
      action: AuditAction.LOGIN,
      tableName: 'users',
      recordId: 'u1',
    });

    expect(mockGlobalAuditCreate).toHaveBeenCalledTimes(1);
  });
});
