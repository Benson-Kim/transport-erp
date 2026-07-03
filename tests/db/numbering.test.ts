/**
 * #12 - Race-free business-number allocation.
 */

import { afterAll, expect, it } from '@jest/globals';

import { generateDocumentNumber } from '@/lib/prisma/numbering';

import {
  prisma,
  uid,
  createUserFixture,
  createClientFixture,
  createSupplierFixture,
  baseServiceData,
} from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

it('allocates distinct, contiguous numbers under concurrency (#12)', async () => {
  const prefix = `T${uid().toUpperCase()}`; // unique scope per test run
  const year = new Date().getFullYear();
  const N = 50;

  const numbers = await Promise.all(
    Array.from({ length: N }, () => generateDocumentNumber(prisma, prefix, year))
  );

  const unique = new Set(numbers);
  expect(unique.size).toBe(N);

  // Contiguity note (review !15 item 9): 1..N holds here ONLY because these
  // allocations auto-commit. Under the intended transactional usage, a
  // rolled-back transaction burns its number and leaves a gap BY DESIGN
  // (numbers are gap-tolerant). If this assertion ever fails after adding
  // transactional allocations to this test, relax the assertion - do NOT
  // "fix" the allocator to be gapless.
  const seqs = numbers.map((n) => Number(n.split('-').at(-1))).sort((a, b) => a - b);
  expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));
});

it('DB unique index rejects a duplicate serviceNumber (#12)', async () => {
  const [user, client, supplier] = await Promise.all([
    createUserFixture(),
    createClientFixture(),
    createSupplierFixture(),
  ]);

  const serviceNumber = `SRV-TEST-${uid()}`;
  const data = baseServiceData({
    serviceNumber,
    clientId: client.id,
    supplierId: supplier.id,
    createdById: user.id,
  });

  await prisma.service.create({ data });
  await expect(prisma.service.create({ data })).rejects.toThrow();
});

it('converted call site (#61): in-tx allocation + insert commit or roll back together', async () => {
  const prefix = `C${uid().toUpperCase()}`; // unique scope per test run
  const year = new Date().getFullYear();
  const suffix = uid();

  const billingAddress = {
    line1: '1 Test St',
    city: 'Madrid',
    postalCode: '28001',
    country: 'ES',
  };

  // Success path - the createClient shape after #61: allocate the code and
  // insert the row in ONE transaction.
  const created = await prisma.$transaction(async (tx) => {
    const clientCode = await generateDocumentNumber(tx, prefix, year);
    return tx.client.create({
      data: {
        clientCode,
        name: `Tx Client ${suffix}`,
        billingAddress,
        billingEmail: `tx-${suffix}@example.test`,
      },
    });
  });
  expect(created.clientCode).toBe(`${prefix}-${year}-00001`);

  // Failure path: the insert violates the unique clientCode index, the
  // transaction rolls back, and NO partially-visible row remains. Because
  // the allocation happened in-tx, the counter bump rolls back with it -
  // the next allocation reuses the sequence value instead of leaving a gap.
  // (Gaps remain BY DESIGN for allocations that auto-commit outside the
  // insert's transaction - see the contiguity note above.)
  await expect(
    prisma.$transaction(async (tx) => {
      await generateDocumentNumber(tx, prefix, year);
      return tx.client.create({
        data: {
          clientCode: created.clientCode, // duplicate -> unique violation
          name: `Tx Client dup ${suffix}`,
          billingAddress,
          billingEmail: `tx-dup-${suffix}@example.test`,
        },
      });
    })
  ).rejects.toThrow();

  const orphans = await prisma.client.findMany({
    where: { name: `Tx Client dup ${suffix}` },
  });
  expect(orphans).toHaveLength(0);

  const next = await generateDocumentNumber(prisma, prefix, year);
  expect(next).toBe(`${prefix}-${year}-00002`);
});
