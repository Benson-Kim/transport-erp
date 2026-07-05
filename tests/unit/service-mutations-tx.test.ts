/**
 * #27 - transactional service mutations: the audit log and the
 * ServiceStatusHistory row join the same transaction as the service write.
 * A failing audit insert aborts the transaction (the real helper rolls the
 * write back); status changes always record history; illegal lifecycle
 * moves are rejected before any write.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ServiceStatus, UserRole } from '@/app/generated/prisma';
import type { ServiceFormData } from '@/lib/validations/service-schema';

import { markServiceComplete, updateService } from '@/actions/service-actions';

const mockRequireAuth = jest.fn<() => Promise<unknown>>();
jest.mock('@/lib/auth', () => ({
  requireAuth: () => mockRequireAuth(),
}));

jest.mock('@/lib/rbac', () => {
  class UnauthorizedError extends Error {}
  class ForbiddenError extends Error {}
  return {
    UnauthorizedError,
    ForbiddenError,
    requirePermission: () => Promise.resolve(),
    checkPermission: () => Promise.resolve(true),
    requireServiceAccess: () => Promise.resolve(),
  };
});

type Args = Record<string, unknown>;
const mockFindUnique = jest.fn<() => Promise<unknown>>();
const mockUpdate = jest.fn<(args: Args) => Promise<unknown>>();
const mockHistoryCreate = jest.fn<(args: Args) => Promise<unknown>>();
jest.mock('@/lib/prisma/prisma', () => ({
  __esModule: true,
  default: {
    service: {
      findUnique: (..._args: unknown[]) => mockFindUnique(),
      update: (args: Args) => mockUpdate(args),
    },
    serviceStatusHistory: {
      create: (args: Args) => mockHistoryCreate(args),
    },
  },
}));

const mockAudit = jest.fn<(...args: unknown[]) => Promise<unknown>>();
// Emulates withTransaction: runs the callback against the prisma mock as the
// tx client. A rejection inside the callback aborts the action exactly like
// the real helper's transaction rollback discards the writes.
jest.mock('@/lib/prisma/db-helpers', () => ({
  createAuditLog: (...args: unknown[]) => mockAudit(...args),
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const prismaMock = jest.requireMock('@/lib/prisma/prisma') as { default: unknown };
    return fn(prismaMock.default);
  },
}));

const mockRevalidate = jest.fn<(...args: unknown[]) => void>();
jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidate(...args),
  updateTag: (...args: unknown[]) => mockRevalidate(...args),
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
  mockRequireAuth.mockResolvedValue({
    user: { id: 'u1', role: UserRole.MANAGER, isActive: true },
  });
  mockFindUnique.mockResolvedValue({ id: 's1', status: ServiceStatus.DRAFT });
  mockUpdate.mockResolvedValue({ id: 's1', status: ServiceStatus.CONFIRMED });
  mockHistoryCreate.mockResolvedValue({});
  mockAudit.mockResolvedValue({});
});

describe('audit joins the mutation transaction (#27)', () => {
  it('a failing audit insert aborts the update (write shares the rollback)', async () => {
    mockAudit.mockRejectedValueOnce(new Error('audit insert failed'));

    await expect(updateService('s1', form({ status: ServiceStatus.CONFIRMED }))).rejects.toThrow(
      'audit insert failed'
    );

    // The service write happened inside the tx callback, so the real
    // transaction discards it; post-commit side effects must not run.
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it('a status change writes a ServiceStatusHistory row in the same tx', async () => {
    await updateService('s1', form({ status: ServiceStatus.CONFIRMED }));

    expect(mockHistoryCreate).toHaveBeenCalledTimes(1);
    const args = mockHistoryCreate.mock.calls[0]?.[0] as {
      data: { serviceId: string; fromStatus: ServiceStatus; toStatus: ServiceStatus };
    };
    expect(args.data).toMatchObject({
      serviceId: 's1',
      fromStatus: ServiceStatus.DRAFT,
      toStatus: ServiceStatus.CONFIRMED,
    });
    // Audit row written through the same transaction client.
    expect(mockAudit).toHaveBeenCalledTimes(1);
    expect(mockAudit.mock.calls[0]?.[1]).toBeDefined();
  });

  it('no history row when the status does not change', async () => {
    await updateService('s1', form({ status: ServiceStatus.DRAFT }));

    expect(mockHistoryCreate).not.toHaveBeenCalled();
  });

  it('markServiceComplete records from -> COMPLETED history in the tx', async () => {
    mockUpdate.mockResolvedValue({ id: 's1', status: ServiceStatus.COMPLETED });

    await markServiceComplete('s1');

    expect(mockHistoryCreate).toHaveBeenCalledTimes(1);
    const args = mockHistoryCreate.mock.calls[0]?.[0] as {
      data: { fromStatus: ServiceStatus; toStatus: ServiceStatus };
    };
    expect(args.data).toMatchObject({
      fromStatus: ServiceStatus.DRAFT,
      toStatus: ServiceStatus.COMPLETED,
    });
  });
});

describe('illegal transitions are rejected before any write (#27)', () => {
  it('updateService refuses CANCELLED -> IN_PROGRESS', async () => {
    mockFindUnique.mockResolvedValue({ id: 's1', status: ServiceStatus.CANCELLED });

    await expect(
      updateService('s1', form({ status: ServiceStatus.IN_PROGRESS }))
    ).rejects.toMatchObject({ name: 'IllegalStatusTransitionError' });

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockHistoryCreate).not.toHaveBeenCalled();
  });
});
