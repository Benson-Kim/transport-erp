/**
 * #32 - loading-order grouping: transactional create semantics against a
 * real Postgres.
 */

import { afterAll, expect, it } from '@jest/globals';

import { createLoadingOrderRecords } from '@/lib/loading-orders';

import {
  baseServiceData,
  createClientFixture,
  createSupplierFixture,
  createUserFixture,
  prisma,
  uid,
} from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

async function createServiceFixture(params: {
  clientId: string;
  supplierId: string;
  createdById: string;
}) {
  return prisma.service.create({
    data: baseServiceData({ serviceNumber: `SRV-LO-${uid()}`, ...params }),
  });
}

it('creates the order and dense, input-ordered join rows in one transaction (#32)', async () => {
  const [user, client, supplier] = await Promise.all([
    createUserFixture(),
    createClientFixture(),
    createSupplierFixture(),
  ]);
  const ids = { clientId: client.id, supplierId: supplier.id, createdById: user.id };
  const s1 = await createServiceFixture(ids);
  const s2 = await createServiceFixture(ids);

  const created = await prisma.$transaction(async (tx) =>
    createLoadingOrderRecords(tx, {
      // Duplicate id on purpose: normalization must keep first-seen order.
      serviceIds: [s2.id, s1.id, s2.id],
      clientId: client.id,
      notes: 'integration test notes',
      generatedById: user.id,
    })
  );

  expect(created.orderNumber).toMatch(/^LO-\d{4}-\d{5}$/);

  const joins = await prisma.serviceLoadingOrder.findMany({
    where: { loadingOrderId: created.id },
    orderBy: { position: 'asc' },
  });
  expect(joins.map((j) => j.serviceId)).toEqual([s2.id, s1.id]);
  expect(joins.map((j) => j.position)).toEqual([1, 2]);
});

it('rolls back the whole group when any member insert fails - no partial order (#32)', async () => {
  const [user, client, supplier] = await Promise.all([
    createUserFixture(),
    createClientFixture(),
    createSupplierFixture(),
  ]);
  const s1 = await createServiceFixture({
    clientId: client.id,
    supplierId: supplier.id,
    createdById: user.id,
  });

  await expect(
    prisma.$transaction(async (tx) =>
      createLoadingOrderRecords(tx, {
        serviceIds: [s1.id, `missing-${uid()}`], // FK violation on the join insert
        clientId: null,
        notes: null,
        generatedById: user.id,
      })
    )
  ).rejects.toThrow();

  // The order row from the failed transaction must not be visible; the
  // burned LO number is acceptable by design (gap-tolerant numbering, #12).
  const orders = await prisma.loadingOrder.findMany({
    where: { generatedById: user.id },
  });
  expect(orders).toHaveLength(0);
});
