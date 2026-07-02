/**
 * Review !17 blockers - concurrency guards on service mutations.
 *
 * Blocker 1: bulkUpdateServices must re-assert the invariant WHERE and the
 * state machine INSIDE the UPDATE itself (the #20 TOCTOU guarantee), roll
 * back on read/write count divergence, and run Serializable.
 *
 * Blocker 2: single-op mutations must read the row INSIDE the transaction
 * and assert the state machine against that fresh read - with a stale
 * outside read, two users can reach INVOICED -> DRAFT.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ServiceStatus, UserRole } from '@/app/generated/prisma';
import type { ServiceFormData } from '@/lib/validations/service-schema';

import {
  archiveService,
  bulkUpdateServices,
  markServiceComplete,
  updateService,
} from '@/actions/service-actions';

const mockRequireAuth = jest.fn<() => Promise<unknown>>();
jest.mock('@/lib/auth', () => ({
  requireAuth: () => mockRequireAuth(),
}));

const mockCheckPermission = jest.fn<(...args: unknown[]) => Promise<boolean>>();
jest.mock('@/lib/rbac', () => {
  class UnauthorizedError extends Error {
    constructor(message = 'Unauthorized') {
      super(message);
      this.name = 'UnauthorizedError';
    }
  }
  class ForbiddenError extends Error {
    constructor(message = 'Forbidden') {
      super(message);
      this.name = 'ForbiddenError';
    }
  }
  return {
    UnauthorizedError,
    ForbiddenError,
    requirePermission: () => Promise.resolve(),
    checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
    requireServiceAccess: () => Promise.resolve(),
  };
});

type Args = Record<string, unknown>;

// Tracks whether a prisma call happened inside the withTransaction callback.
let mockInTx = false;
const mockFindUniqueInTxLog: boolean[] = [];

const mockFindUnique = jest.fn<(args: Args) => Promise<unknown>>();
const mockFindMany = jest.fn<(args: Args) => Promise<unknown>>();
const mockUpdate = jest.fn<(args: Args) => Promise<unknown>>();
const mockUpdateMany = jest.fn<(args: Args) => Promise<unknown>>();
const mockHistoryCreate = jest.fn<(args: Args) => Promise<unknown>>();
const mockHistoryCreateMany = jest.fn<(args: Args) => Promise<unknown>>();

jest.mock('@/lib/prisma/prisma', () => ({
  __esModule: true,
  default: {
    service: {
      findUnique: (args: Args) => {
        mockFindUniqueInTxLog.push(mockInTx);
        return mockFindUnique(args);
      },
      findMany: (args: Args) => mockFindMany(args),
      update: (args: Args) => mockUpdate(args),
      updateMany: (args: Args) => mockUpdateMany(args),
    },
    serviceStatusHistory: {
      create: (args: Args) => mockHistoryCreate(args),
      createMany: (args: Args) => mockHistoryCreateMany(args),
    },
  },
}));

const mockCapturedTxOptions: unknown[] = [];
// Emulates withTransaction: hands the prisma mock back as the tx client and
// records the options (isolation level) each action requested.
jest.mock('@/lib/prisma/db-helpers', () => ({
  createAuditLog: () => Promise.resolve(),
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>, options?: unknown) => {
    mockCapturedTxOptions.push(options);
    const prismaMock = jest.requireMock('@/lib/prisma/prisma') as { default: unknown };
    mockInTx = true;
    try {
      return await fn(prismaMock.default);
    } finally {
      mockInTx = false;
    }
  },
}));
jest.mock('next/cache', () => ({
  revalidatePath: () => undefined,
}));
jest.mock('@/lib/prisma/numbering', () => ({
  generateDocumentNumber: () => Promise.resolve('SRV-2026-00001'),
}));
jest.mock('@/lib/data/service-data', () => ({
  getServiceWithDetails: () => Promise.resolve(null),
}));

function form(overrides: Partial<ServiceFormData> = {}): ServiceFormData {
  return {
    date: new Date('2026-07-01T00:00:00Z'),
    clientId: 'client-1',
    supplierId: 'supplier-1',
    description: 'Cargo Madrid -> Barcelona',
    origin: 'Madrid',
    destination: 'Barcelona',
    costAmount: 100,
    saleAmount: 150,
    totalCost: 100,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockInTx = false;
  mockFindUniqueInTxLog.length = 0;
  mockCapturedTxOptions.length = 0;
  mockRequireAuth.mockResolvedValue({
    user: { id: 'u1', role: UserRole.MANAGER, isActive: true },
  });
  mockCheckPermission.mockResolvedValue(true);
  mockFindUnique.mockResolvedValue({ id: 's1', status: ServiceStatus.DRAFT });
  mockFindMany.mockResolvedValue([]);
  mockUpdate.mockResolvedValue({ id: 's1', status: ServiceStatus.CONFIRMED });
  mockUpdateMany.mockResolvedValue({ count: 0 });
  mockHistoryCreate.mockResolvedValue({});
  mockHistoryCreateMany.mockResolvedValue({ count: 0 });
});

describe('single-op mutations read the row inside the transaction (review !17 blocker 2)', () => {
  it('updateService asserts the state machine against the in-tx read: INVOICED -> DRAFT is unreachable', async () => {
    mockFindUnique.mockResolvedValue({ id: 's1', status: ServiceStatus.INVOICED });

    await expect(
      updateService('s1', form({ status: ServiceStatus.DRAFT }))
    ).rejects.toMatchObject({ name: 'IllegalStatusTransitionError' });

    // The one and only status read happened inside the transaction.
    expect(mockFindUniqueInTxLog).toEqual([true]);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockHistoryCreate).not.toHaveBeenCalled();
  });

  it('updateService runs Serializable so a concurrent status change retries the whole callback', async () => {
    await updateService('s1', form({ status: ServiceStatus.CONFIRMED }));

    expect(mockCapturedTxOptions[0]).toMatchObject({ isolationLevel: 'Serializable' });
    expect(mockFindUniqueInTxLog).toEqual([true]);
  });

  it('markServiceComplete reads inside a Serializable tx', async () => {
    mockUpdate.mockResolvedValue({ id: 's1', status: ServiceStatus.COMPLETED });

    await markServiceComplete('s1');

    expect(mockFindUniqueInTxLog).toEqual([true]);
    expect(mockCapturedTxOptions[0]).toMatchObject({ isolationLevel: 'Serializable' });
  });

  it('archiveService rejects an illegal move using the in-tx read', async () => {
    mockFindUnique.mockResolvedValue({ id: 's1', status: ServiceStatus.DRAFT });

    await expect(archiveService('s1')).rejects.toMatchObject({
      name: 'IllegalStatusTransitionError',
    });

    expect(mockFindUniqueInTxLog).toEqual([true]);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe('bulkUpdateServices re-asserts invariants inside the UPDATE (review !17 blocker 1)', () => {
  it('the UPDATE WHERE carries the invariant fragment and the legal-source statuses, Serializable', async () => {
    mockRequireAuth.mockResolvedValue({
      user: { id: 'op-1', role: UserRole.OPERATOR, isActive: true },
    });
    mockCheckPermission.mockResolvedValue(false); // not elevated
    mockFindMany.mockResolvedValue([
      { id: 's1', status: ServiceStatus.DRAFT, createdById: 'op-1', assignedToId: null },
    ]);
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      bulkUpdateServices(['s1'], { status: ServiceStatus.CONFIRMED })
    ).resolves.toEqual({ success: true, count: 1 });

    const call = mockUpdateMany.mock.calls[0]?.[0] as { where: { AND: Args[] } };
    const [idClause, invariants, legality] = call.where.AND;
    expect(idClause).toEqual({ id: { in: ['s1'] } });
    expect(invariants).toMatchObject({
      deletedAt: null,
      status: { notIn: [ServiceStatus.COMPLETED, ServiceStatus.INVOICED] },
      OR: [{ createdById: 'op-1' }, { assignedToId: 'op-1' }],
    });
    expect(legality).toEqual({
      status: {
        in: expect.arrayContaining([
          ServiceStatus.DRAFT,
          ServiceStatus.CONFIRMED,
          ServiceStatus.IN_PROGRESS,
          ServiceStatus.CANCELLED,
        ]),
      },
    });
    expect(mockCapturedTxOptions[0]).toMatchObject({ isolationLevel: 'Serializable' });
  });

  it('a status-less bulk update still re-asserts the invariant WHERE', async () => {
    mockFindMany.mockResolvedValue([
      { id: 's1', status: ServiceStatus.DRAFT, createdById: 'u1', assignedToId: null },
    ]);
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await bulkUpdateServices(['s1'], {});

    const call = mockUpdateMany.mock.calls[0]?.[0] as { where: { AND: Args[] } };
    expect(call.where.AND).toHaveLength(2);
    expect(call.where.AND[1]).toMatchObject({ deletedAt: null });
  });

  it('rolls back (no history) when the UPDATE touches fewer rows than were read', async () => {
    mockFindMany.mockResolvedValue([
      { id: 's1', status: ServiceStatus.DRAFT, createdById: 'u1', assignedToId: null },
    ]);
    mockUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      bulkUpdateServices(['s1'], { status: ServiceStatus.CONFIRMED })
    ).rejects.toThrow('read 1 rows but updated 0');
    expect(mockHistoryCreateMany).not.toHaveBeenCalled();
  });
});
