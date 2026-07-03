/**
 * #33 - the report SQL aggregates IN the database over
 * RECOGNIZED_REVENUE_STATUSES only, excluding CANCELLED (#28), pipeline and
 * soft-deleted rows, with exact Decimal totals.
 */

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { ServiceStatus } from '@/app/generated/prisma';
import appPrisma from '@/lib/prisma/prisma';
import { queryClientMargins, queryMonthlyFinancials } from '@/lib/reports/queries';

import {
  prisma,
  uid,
  createUserFixture,
  createClientFixture,
  createSupplierFixture,
  baseServiceData,
} from './helpers';

// Window isolated from every other db test: they all date services with
// new Date(); nothing else writes 2019 rows.
const WINDOW = {
  start: new Date('2019-01-01T00:00:00Z'),
  end: new Date('2019-03-01T00:00:00Z'),
};

let userId: string;
let clientId: string;
let supplierId: string;

function service(overrides: Record<string, unknown>) {
  return prisma.service.create({
    data: {
      ...baseServiceData({
        serviceNumber: `SRV-RPT-${uid()}`,
        clientId,
        supplierId,
        createdById: userId,
      }),
      ...overrides,
    },
  });
}

beforeAll(async () => {
  const [user, client, supplier] = await Promise.all([
    createUserFixture(),
    createClientFixture(),
    createSupplierFixture(),
  ]);
  userId = user.id;
  clientId = client.id;
  supplierId = supplier.id;

  // January: exactly ONE recognized row...
  await service({
    date: new Date('2019-01-15T12:00:00Z'),
    status: ServiceStatus.COMPLETED,
    costAmount: '60.05',
    saleAmount: '100.10',
    margin: '40.05',
    marginPercentage: '40.01',
  });
  // ...a CANCELLED row that must never count (#28)...
  await service({
    date: new Date('2019-01-16T12:00:00Z'),
    status: ServiceStatus.CANCELLED,
    costAmount: '1.00',
    saleAmount: '999.00',
    margin: '998.00',
    marginPercentage: '99.90',
  });
  // ...a pipeline (DRAFT) row that is not revenue...
  await service({
    date: new Date('2019-01-17T12:00:00Z'),
    status: ServiceStatus.DRAFT,
  });
  // ...and a soft-deleted recognized row that must be excluded.
  await service({
    date: new Date('2019-01-18T12:00:00Z'),
    status: ServiceStatus.COMPLETED,
    deletedAt: new Date(),
  });

  // February: INVOICED and ARCHIVED stay recognized (state-machine exits).
  await service({
    date: new Date('2019-02-10T12:00:00Z'),
    status: ServiceStatus.INVOICED,
    costAmount: '0.10',
    saleAmount: '0.20',
    margin: '0.10',
    marginPercentage: '50.00',
  });
  await service({
    date: new Date('2019-02-20T12:00:00Z'),
    status: ServiceStatus.ARCHIVED,
    costAmount: '20.10',
    saleAmount: '50.10',
    margin: '30.00',
    marginPercentage: '59.88',
  });
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), appPrisma.$disconnect()]);
});

describe('report SQL aggregation (#33)', () => {
  it('aggregates monthly totals in SQL over recognized statuses only', async () => {
    const months = await queryMonthlyFinancials(WINDOW);

    expect(months).toHaveLength(2);

    const [jan, feb] = months;

    expect(jan.month.getUTCFullYear()).toBe(2019);
    expect(jan.month.getUTCMonth()).toBe(0);
    expect(jan.services).toBe(1); // CANCELLED, DRAFT and soft-deleted excluded
    expect(String(jan.revenue)).toBe('100.1');
    expect(String(jan.cost)).toBe('60.05');
    expect(String(jan.margin)).toBe('40.05');

    expect(feb.month.getUTCMonth()).toBe(1);
    expect(feb.services).toBe(2); // INVOICED + ARCHIVED stay recognized
    expect(String(feb.revenue)).toBe('50.3');
    expect(String(feb.cost)).toBe('20.2');
    expect(String(feb.margin)).toBe('30.1');
  });

  it('aggregates per-client margin in SQL, scoped to the window', async () => {
    const rows = await queryClientMargins(WINDOW, 20);
    const mine = rows.find((row) => row.clientId === clientId);

    expect(mine).toBeDefined();
    expect(mine?.services).toBe(3);
    expect(String(mine?.revenue)).toBe('150.4');
    expect(String(mine?.cost)).toBe('80.25');
    expect(String(mine?.margin)).toBe('70.15');
  });
});
