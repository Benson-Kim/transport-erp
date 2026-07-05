/**
 * #28 - non-destructive cancel. Cancelling stores the booked figures
 * unchanged (only the status and cancelledAt change); reverting the
 * cancellation restores the original amounts and clears cancelledAt; the
 * €0 presentation for cancelled services is derived at the DTO boundary.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ServiceStatus, UserRole } from '@/app/generated/prisma';
import type { ServiceFormData } from '@/lib/validations/service-schema';

import { getServices, updateService } from '@/actions/service-actions';

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
const mockFindMany = jest.fn<() => Promise<unknown>>();
const mockCount = jest.fn<() => Promise<unknown>>();
const mockUpdate = jest.fn<(args: Args) => Promise<unknown>>();
const mockHistoryCreate = jest.fn<(args: Args) => Promise<unknown>>();
jest.mock('@/lib/prisma/prisma', () => ({
  __esModule: true,
  default: {
    service: {
      findUnique: (..._args: unknown[]) => mockFindUnique(),
      findMany: (..._args: unknown[]) => mockFindMany(),
      count: (..._args: unknown[]) => mockCount(),
      update: (args: Args) => mockUpdate(args),
    },
    serviceStatusHistory: {
      create: (args: Args) => mockHistoryCreate(args),
    },
  },
}));

jest.mock('@/lib/prisma/db-helpers', () => ({
  createAuditLog: () => Promise.resolve(),
  withTransaction: async (fn: (tx: unknown) => Promise<unknown>) => {
    const prismaMock = jest.requireMock('@/lib/prisma/prisma') as { default: unknown };
    return fn(prismaMock.default);
  },
}));
jest.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  updateTag: () => undefined,
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

function updateArgs(): { data: Record<string, unknown> } {
  const args = mockUpdate.mock.calls[0]?.[0] as { data: Record<string, unknown> } | undefined;
  if (!args) throw new Error('service.update was not called');
  return args;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequireAuth.mockResolvedValue({
    user: { id: 'u1', role: UserRole.MANAGER, isActive: true },
  });
  mockUpdate.mockResolvedValue({ id: 's1' });
  mockHistoryCreate.mockResolvedValue({});
});

describe('non-destructive cancel (#28)', () => {
  it('cancelling stores the booked figures unchanged and stamps cancelledAt', async () => {
    mockFindUnique.mockResolvedValue({ id: 's1', status: ServiceStatus.CONFIRMED });

    await updateService('s1', form({ cancelled: true }));

    const { data } = updateArgs();
    // Booked money preserved - NOT zeroed. (Bracket access: index signature.)
    expect(String(data['costAmount'])).toBe('100');
    expect(String(data['saleAmount'])).toBe('150');
    expect(String(data['margin'])).toBe('50');
    expect(data['status']).toBe(ServiceStatus.CANCELLED);
    expect(data['cancelledAt']).toBeInstanceOf(Date);
  });

  it('cancel -> uncancel round-trip restores figures and clears cancelledAt', async () => {
    mockFindUnique.mockResolvedValue({ id: 's1', status: ServiceStatus.CANCELLED });

    await updateService('s1', form({ cancelled: false, status: ServiceStatus.DRAFT }));

    const { data } = updateArgs();
    expect(String(data['costAmount'])).toBe('100');
    expect(String(data['saleAmount'])).toBe('150');
    expect(data['status']).toBe(ServiceStatus.DRAFT);
    expect(data['cancelledAt']).toBeNull();
  });
});

describe('€0 presentation is derived, not stored (#28)', () => {
  it('getServices lists cancelled services as €0 and others with booked amounts', async () => {
    const row = (id: string, status: ServiceStatus) => ({
      id,
      serviceNumber: `SRV-2026-0000${id}`,
      date: new Date('2026-07-01T00:00:00Z'),
      clientId: 'c1',
      client: { id: 'c1', name: 'Client', clientCode: 'CLI001' },
      supplierId: 'p1',
      supplier: { id: 'p1', name: 'Supplier', supplierCode: 'SUP001' },
      driverName: null,
      vehiclePlate: null,
      origin: 'Madrid',
      destination: 'Barcelona',
      costAmount: '100.00',
      saleAmount: '150.00',
      margin: '50.00',
      marginPercentage: '33.33',
      costVatAmount: '21.00',
      saleVatAmount: '31.50',
      status,
    });
    mockFindMany.mockResolvedValue([
      row('1', ServiceStatus.CANCELLED),
      row('2', ServiceStatus.COMPLETED),
    ]);
    mockCount.mockResolvedValue(2);

    const { services } = await getServices({});

    const cancelled = services.find((s) => s.id === '1');
    const completed = services.find((s) => s.id === '2');
    expect(cancelled).toMatchObject({ costAmount: 0, saleAmount: 0, margin: 0 });
    expect(completed).toMatchObject({ costAmount: 100, saleAmount: 150, margin: 50 });
  });
});
