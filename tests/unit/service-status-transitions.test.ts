/**
 * #20 / review !16 round 2 - elevated status transitions, typed bulk-guard
 * errors, and honest stub results in service actions.
 *
 * R2-2: setting COMPLETED/INVOICED/CANCELLED/ARCHIVED demands the dedicated
 *       permission (mark_completed / mark_billed / cancel / archive) on the
 *       bulk path AND the generic single-op update/create paths (the
 *       single-op hole predated !16 and is closed by the same guard).
 * R2-1: assertBulkServiceInvariants rejections are typed ForbiddenError.
 *
 * R2-3 (stub honesty) was retired with #32: the generateBulkLoadingOrders
 * stub is deleted and the real createLoadingOrder path carries its own
 * tests (tests/unit/loading-orders.test.ts, tests/db/loading-orders.test.ts).
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ServiceStatus, UserRole } from '@/app/generated/prisma';
import type { ServiceFormData } from '@/lib/validations/service-schema';

import { bulkUpdateServices, createService, updateService } from '@/actions/service-actions';

const mockRequireAuth = jest.fn<() => Promise<unknown>>();
jest.mock('@/lib/auth', () => ({
  requireAuth: () => mockRequireAuth(),
}));

const mockRequirePermission = jest.fn<(...args: unknown[]) => Promise<void>>();
const mockCheckPermission = jest.fn<(...args: unknown[]) => Promise<boolean>>();
const mockRequireServiceAccess = jest.fn<(...args: unknown[]) => Promise<void>>();
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
    requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
    checkPermission: (...args: unknown[]) => mockCheckPermission(...args),
    requireServiceAccess: (...args: unknown[]) => mockRequireServiceAccess(...args),
  };
});

const mockFindMany = jest.fn<() => Promise<unknown>>();
const mockFindUnique = jest.fn<() => Promise<unknown>>();
const mockCreate = jest.fn<() => Promise<unknown>>();
const mockUpdate = jest.fn<() => Promise<unknown>>();
const mockUpdateMany = jest.fn<() => Promise<unknown>>();
const mockHistoryCreate = jest.fn<() => Promise<unknown>>();
const mockHistoryCreateMany = jest.fn<() => Promise<unknown>>();
const mockTransaction = jest.fn<() => Promise<unknown>>();
jest.mock('@/lib/prisma/prisma', () => ({
  __esModule: true,
  default: {
    service: {
      findMany: (..._args: unknown[]) => mockFindMany(),
      findUnique: (..._args: unknown[]) => mockFindUnique(),
      create: (..._args: unknown[]) => mockCreate(),
      update: (..._args: unknown[]) => mockUpdate(),
      updateMany: (..._args: unknown[]) => mockUpdateMany(),
    },
    serviceStatusHistory: {
      create: (..._args: unknown[]) => mockHistoryCreate(),
      createMany: (..._args: unknown[]) => mockHistoryCreateMany(),
    },
    $transaction: (..._args: unknown[]) => mockTransaction(),
  },
}));

// withTransaction (#27) hands the prisma mock back as the tx client so the
// actions' tx.service.* / tx.serviceStatusHistory.* calls hit the same mocks.
jest.mock('@/lib/prisma/db-helpers', () => ({
  createAuditLog: () => Promise.resolve(),
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const prismaMock = jest.requireMock('@/lib/prisma/prisma') as { default: unknown };
    return fn(prismaMock.default);
  },
}));
jest.mock('@/lib/prisma/numbering', () => ({
  generateDocumentNumber: () => Promise.resolve('SRV-2026-00001'),
}));
jest.mock('@/lib/data/service-data', () => ({
  getServiceWithDetails: () => Promise.resolve(null),
}));
jest.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

function session(role: UserRole, id: string) {
  return { user: { id, role, isActive: true } };
}

/** Deny exactly one services action the way requirePermission does. */
function denyOnly(deniedAction: string) {
  mockRequirePermission.mockImplementation(async (...args: unknown[]) => {
    if (args[1] === deniedAction) {
      const error = new Error(`Insufficient permissions: services:${deniedAction} required`);
      error.name = 'ForbiddenError';
      throw error;
    }
  });
}

function validServiceForm(overrides: Partial<ServiceFormData> = {}): ServiceFormData {
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
  mockRequirePermission.mockResolvedValue(undefined);
  mockCheckPermission.mockResolvedValue(false);
  mockRequireServiceAccess.mockResolvedValue(undefined);
});

describe('elevated status transitions (review !16 R2-2)', () => {
  it('bulk: OPERATOR with services:edit cannot bulk-set COMPLETED', async () => {
    mockRequireAuth.mockResolvedValue(session(UserRole.OPERATOR, 'op-1'));
    denyOnly('mark_completed');

    await expect(
      bulkUpdateServices(['s1', 's2'], { status: ServiceStatus.COMPLETED })
    ).rejects.toMatchObject({ name: 'ForbiddenError' });

    // Denied before touching any data.
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('bulk: INVOICED demands services:mark_billed', async () => {
    mockRequireAuth.mockResolvedValue(session(UserRole.OPERATOR, 'op-1'));
    denyOnly('mark_billed');

    await expect(
      bulkUpdateServices(['s1'], { status: ServiceStatus.INVOICED })
    ).rejects.toThrow('mark_billed');
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('bulk: a permitted caller passes, and the dedicated permission was demanded', async () => {
    mockRequireAuth.mockResolvedValue(session(UserRole.MANAGER, 'mgr-1'));
    mockFindMany.mockResolvedValue([
      { id: 's1', status: ServiceStatus.DRAFT, createdById: 'x', assignedToId: null },
    ]);
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await expect(
      bulkUpdateServices(['s1'], { status: ServiceStatus.COMPLETED })
    ).resolves.toEqual({ success: true, count: 1 });

    expect(mockRequirePermission).toHaveBeenCalledWith('services', 'mark_completed');
  });

  it('bulk: non-elevated destinations demand no elevated permission', async () => {
    mockRequireAuth.mockResolvedValue(session(UserRole.OPERATOR, 'op-1'));
    mockFindMany.mockResolvedValue([
      { id: 's1', status: ServiceStatus.DRAFT, createdById: 'op-1', assignedToId: null },
    ]);
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await expect(bulkUpdateServices(['s1'], { status: ServiceStatus.DRAFT })).resolves.toEqual({
      success: true,
      count: 1,
    });

    const demandedActions = mockRequirePermission.mock.calls.map((call) => call[1]);
    expect(demandedActions).toEqual(['edit']);
  });

  it('single: updateService cannot reach COMPLETED via the completed flag without mark_completed (pre-existing hole, now closed)', async () => {
    mockRequireAuth.mockResolvedValue(session(UserRole.OPERATOR, 'op-1'));
    mockFindUnique.mockResolvedValue({ status: ServiceStatus.DRAFT });
    denyOnly('mark_completed');

    await expect(
      updateService('s1', validServiceForm({ completed: true }))
    ).rejects.toMatchObject({ name: 'ForbiddenError' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('single: createService cannot be born COMPLETED without mark_completed', async () => {
    mockRequireAuth.mockResolvedValue(session(UserRole.OPERATOR, 'op-1'));
    denyOnly('mark_completed');

    await expect(createService(validServiceForm({ completed: true }))).rejects.toMatchObject({
      name: 'ForbiddenError',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});

describe('typed bulk-guard errors (review !16 R2-1)', () => {
  it('ownership rejection is a ForbiddenError, not a bare Error', async () => {
    mockRequireAuth.mockResolvedValue(session(UserRole.OPERATOR, 'op-1'));
    mockFindMany.mockResolvedValue([
      { id: 's1', status: ServiceStatus.DRAFT, createdById: 'someone-else', assignedToId: null },
    ]);

    await expect(bulkUpdateServices(['s1'], {})).rejects.toMatchObject({
      name: 'ForbiddenError',
    });
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('protected-status rejection is a ForbiddenError, not a bare Error', async () => {
    mockRequireAuth.mockResolvedValue(session(UserRole.OPERATOR, 'op-1'));
    mockFindMany.mockResolvedValue([
      { id: 's1', status: ServiceStatus.COMPLETED, createdById: 'op-1', assignedToId: null },
    ]);
    mockCheckPermission.mockResolvedValue(false);

    await expect(bulkUpdateServices(['s1'], {})).rejects.toMatchObject({
      name: 'ForbiddenError',
    });
  });
});
