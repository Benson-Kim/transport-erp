/**
 * #13 - Reusable codes are unique only among live (non-deleted) rows.
 */

import { afterAll, expect, it } from '@jest/globals';

import { prisma, uid } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

it('rejects a duplicate live clientCode, allows reuse after soft delete (#13)', async () => {
  const clientCode = `CLI-REUSE-${uid()}`;
  const base = {
    clientCode,
    billingAddress: {
      line1: '1 Test St',
      city: 'Madrid',
      postalCode: '28001',
      country: 'ES',
    },
  };

  const first = await prisma.client.create({
    data: { ...base, name: 'First owner', billingEmail: `first-${uid()}@example.test` },
  });

  // While the first row is live, the partial-unique index must reject a duplicate.
  await expect(
    prisma.client.create({
      data: { ...base, name: 'Duplicate', billingEmail: `dup-${uid()}@example.test` },
    })
  ).rejects.toThrow();

  // Soft-delete the first row; the code becomes reusable.
  await prisma.client.update({ where: { id: first.id }, data: { deletedAt: new Date() } });

  await expect(
    prisma.client.create({
      data: { ...base, name: 'Second owner', billingEmail: `second-${uid()}@example.test` },
    })
  ).resolves.toBeDefined();
});
