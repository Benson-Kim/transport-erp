/**
 * #14 - clients.billingCountry is a DB-generated column: derived from
 * billingAddress JSON, never writable by the application.
 */

import { afterAll, expect, it } from '@jest/globals';

import { prisma, uid, createClientFixture } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

it('derives billingCountry from billingAddress->>country (#14)', async () => {
  // createClientFixture writes billingAddress.country = 'ES'.
  const client = await createClientFixture();
  expect(client.billingCountry).toBe('ES');
});

it('rejects application writes to the generated billingCountry column (#14)', async () => {
  await expect(
    prisma.client.create({
      data: {
        clientCode: `CLI-GEN-${uid()}`,
        name: 'Generated column probe',
        billingAddress: {
          line1: '1 Test St',
          city: 'Madrid',
          postalCode: '28001',
          country: 'ES',
        },
        billingEmail: `gen-${uid()}@example.test`,
        billingCountry: 'FR',
      },
    })
  ).rejects.toThrow();
});
