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
