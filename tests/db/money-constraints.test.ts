/**
 * #11 - Money CHECK constraints are enforced by the database itself.
 */

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import {
  prisma,
  uid,
  createUserFixture,
  createClientFixture,
  createSupplierFixture,
  baseServiceData,
} from './helpers';

let userId: string;
let clientId: string;
let supplierId: string;

beforeAll(async () => {
  const [user, client, supplier] = await Promise.all([
    createUserFixture(),
    createClientFixture(),
    createSupplierFixture(),
  ]);
  userId = user.id;
  clientId = client.id;
  supplierId = supplier.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function service(overrides: Record<string, unknown>) {
  return prisma.service.create({
    data: {
      ...baseServiceData({
        serviceNumber: `SRV-TEST-${uid()}`,
        clientId,
        supplierId,
        createdById: userId,
      }),
      ...overrides,
    },
  });
}

describe('services money constraints (#11)', () => {
  it('rejects a negative costAmount', async () => {
    await expect(service({ costAmount: '-1.00' })).rejects.toThrow();
  });

  it('rejects a negative saleAmount', async () => {
    await expect(service({ saleAmount: '-0.01' })).rejects.toThrow();
  });

  it('accepts non-negative amounts', async () => {
    await expect(service({ costAmount: '0.00', saleAmount: '0.00' })).resolves.toBeDefined();
  });
});

function invoice(overrides: Record<string, unknown>) {
  return prisma.invoice.create({
    data: {
      invoiceNumber: `INV-TEST-${uid()}`,
      invoiceDate: new Date(),
      dueDate: new Date(),
      supplierId,
      createdById: userId,
      subtotal: '100.00',
      taxAmount: '21.00',
      totalAmount: '121.00',
      paidAmount: '0.00',
      ...overrides,
    },
  });
}

describe('invoices money constraints (#11)', () => {
  it('rejects a negative paidAmount', async () => {
    await expect(invoice({ paidAmount: '-1.00' })).rejects.toThrow();
  });

  it('rejects paidAmount greater than totalAmount', async () => {
    await expect(invoice({ paidAmount: '200.00' })).rejects.toThrow();
  });

  it('rejects a total that does not equal subtotal + tax - irpf', async () => {
    await expect(
      invoice({ subtotal: '100.00', taxAmount: '21.00', totalAmount: '999.00' })
    ).rejects.toThrow();
  });

  it('accepts a total equal to subtotal + tax - irpf', async () => {
    // 100 + 21 - 15 = 106
    await expect(
      invoice({
        subtotal: '100.00',
        taxAmount: '21.00',
        irpfAmount: '15.00',
        totalAmount: '106.00',
        paidAmount: '50.00',
      })
    ).resolves.toBeDefined();
  });

  // Sign constraints (#11 sign-off): each case keeps the composition equality
  // satisfied and the total positive, so the rejection isolates the sign
  // constraint itself, not composition or the paidAmount range.
  it('rejects a negative subtotal even when composition holds', async () => {
    // -100 + 221 - 0 = 121
    await expect(
      invoice({ subtotal: '-100.00', taxAmount: '221.00', totalAmount: '121.00' })
    ).rejects.toThrow();
  });

  it('rejects a negative taxAmount even when composition holds', async () => {
    // 142 + (-21) - 0 = 121
    await expect(
      invoice({ subtotal: '142.00', taxAmount: '-21.00', totalAmount: '121.00' })
    ).rejects.toThrow();
  });

  it('rejects a negative irpfAmount even when composition holds', async () => {
    // 100 + 21 - (-15) = 136
    await expect(
      invoice({
        subtotal: '100.00',
        taxAmount: '21.00',
        irpfAmount: '-15.00',
        totalAmount: '136.00',
      })
    ).rejects.toThrow();
  });
});
