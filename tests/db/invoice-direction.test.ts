/**
 * #30 / ADR 0001 - invoice billing direction. DB-level guarantees: the
 * invoices_party_matches_direction CHECK admits exactly the party matching
 * the direction (never both, never neither), and the pre-ADR row shape
 * (supplier-linked) remains valid as PURCHASE.
 *
 * Money fields compose total = subtotal + tax exactly, per the
 * invoices_total_composition_check (#11) - integer-cents reference pattern
 * in prisma/seed.ts createSingleInvoice.
 */

import { afterAll, expect, it } from '@jest/globals';

import { InvoiceDirection } from '@/app/generated/prisma';

import {
  prisma,
  uid,
  createClientFixture,
  createSupplierFixture,
  createUserFixture,
} from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

function baseInvoiceData(createdById: string) {
  return {
    invoiceNumber: `TEST-${uid()}`,
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    subtotal: '100.00',
    taxAmount: '21.00',
    totalAmount: '121.00',
    createdById,
  };
}

it('accepts a PURCHASE invoice linked to a supplier only (pre-ADR shape, #30)', async () => {
  const [user, supplier] = await Promise.all([createUserFixture(), createSupplierFixture()]);

  const invoice = await prisma.invoice.create({
    data: {
      ...baseInvoiceData(user.id),
      direction: InvoiceDirection.PURCHASE,
      supplierId: supplier.id,
      externalReference: `SUP-INV-${uid()}`,
    },
  });

  expect(invoice.direction).toBe(InvoiceDirection.PURCHASE);
  expect(invoice.clientId).toBeNull();
});

it('accepts a SALES invoice linked to a client only (#30)', async () => {
  const [user, client] = await Promise.all([createUserFixture(), createClientFixture()]);

  const invoice = await prisma.invoice.create({
    data: {
      ...baseInvoiceData(user.id),
      direction: InvoiceDirection.SALES,
      clientId: client.id,
    },
  });

  expect(invoice.direction).toBe(InvoiceDirection.SALES);
  expect(invoice.supplierId).toBeNull();
});

it('rejects a SALES invoice pointing at a supplier (party/direction CHECK, #30)', async () => {
  const [user, supplier] = await Promise.all([createUserFixture(), createSupplierFixture()]);

  await expect(
    prisma.invoice.create({
      data: {
        ...baseInvoiceData(user.id),
        direction: InvoiceDirection.SALES,
        supplierId: supplier.id,
      },
    })
  ).rejects.toThrow();
});

it('rejects an invoice with BOTH parties set (party/direction CHECK, #30)', async () => {
  const [user, client, supplier] = await Promise.all([
    createUserFixture(),
    createClientFixture(),
    createSupplierFixture(),
  ]);

  await expect(
    prisma.invoice.create({
      data: {
        ...baseInvoiceData(user.id),
        direction: InvoiceDirection.PURCHASE,
        clientId: client.id,
        supplierId: supplier.id,
      },
    })
  ).rejects.toThrow();
});

it('rejects an invoice with NO party set (party/direction CHECK, #30)', async () => {
  const user = await createUserFixture();

  await expect(
    prisma.invoice.create({
      data: {
        ...baseInvoiceData(user.id),
        direction: InvoiceDirection.PURCHASE,
      },
    })
  ).rejects.toThrow();
});
