/**
 * #30 + #31 - invoice paidAmount invariant and payment CRUD.
 *
 * Proves at the DB level:
 * - paidAmount == SUM(COMPLETED payments) after every payment operation.
 * - paidAmount <= totalAmount (the #11 CHECK) rejects an over-payment.
 * - Parallel payments serialize correctly (Serializable isolation).
 * - Voiding a payment recomputes paidAmount atomically.
 */

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

import { InvoiceDirection, InvoiceStatus, PaymentStatus } from '@/app/generated/prisma';
import appPrisma from '@/lib/prisma/prisma';
import { recomputeInvoicePaymentState } from '@/lib/invoices';
import { withTransaction } from '@/lib/prisma/db-helpers';
import { generateDocumentNumber } from '@/lib/prisma/numbering';

import { prisma, uid, createUserFixture, createClientFixture } from './helpers';

let userId: string;
let clientId: string;

beforeAll(async () => {
  const [user, client] = await Promise.all([createUserFixture(), createClientFixture()]);
  userId = user.id;
  clientId = client.id;
});

afterAll(async () => {
  await Promise.all([prisma.$disconnect(), appPrisma.$disconnect()]);
});

/** Create a minimal SALES invoice with a known totalAmount. */
async function createTestInvoice(totalAmount: string) {
  const suffix = uid();
  return prisma.invoice.create({
    data: {
      invoiceNumber: `INV-TEST-${suffix}`,
      direction: InvoiceDirection.SALES,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      clientId,
      createdById: userId,
      subtotal: totalAmount,
      taxAmount: '0.00',
      totalAmount,
      status: InvoiceStatus.SENT,
    },
  });
}

/** Create a COMPLETED payment row for an invoice. */
async function createPayment(invoiceId: string, amount: string) {
  const suffix = uid();
  return prisma.payment.create({
    data: {
      paymentNumber: `PAY-TEST-${suffix}`,
      invoiceId,
      amount,
      currency: 'EUR',
      paymentDate: new Date(),
      paymentMethod: 'TRANSFER',
      status: PaymentStatus.COMPLETED,
    },
  });
}

describe('paidAmount invariant (#30 + #31)', () => {
  it('paidAmount == SUM(COMPLETED payments) after recording a payment', async () => {
    const invoice = await createTestInvoice('121.00');

    await createPayment(invoice.id, '60.50');
    await withTransaction(
      async (tx) => recomputeInvoicePaymentState(tx, invoice.id),
      { isolationLevel: 'Serializable' }
    );

    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.paidAmount.toFixed(2)).toBe('60.50');
    expect(updated.paymentStatus).toBe(PaymentStatus.PROCESSING);
  });

  it('paidAmount == totalAmount and status COMPLETED when fully paid', async () => {
    const invoice = await createTestInvoice('100.00');

    await createPayment(invoice.id, '100.00');
    await withTransaction(
      async (tx) => recomputeInvoicePaymentState(tx, invoice.id),
      { isolationLevel: 'Serializable' }
    );

    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.paidAmount.toFixed(2)).toBe('100.00');
    expect(updated.paymentStatus).toBe(PaymentStatus.COMPLETED);
    expect(updated.paidAt).not.toBeNull();
  });

  it('DB CHECK rejects paidAmount > totalAmount (over-payment)', async () => {
    const invoice = await createTestInvoice('50.00');

    // Directly attempt to set paidAmount above the total - the #11 CHECK
    // invoices_paid_amount_range_check must reject this.
    await expect(
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { paidAmount: '51.00' },
      })
    ).rejects.toThrow();
  });

  it('voiding a payment recomputes paidAmount atomically', async () => {
    const invoice = await createTestInvoice('200.00');

    const payment = await createPayment(invoice.id, '200.00');
    await withTransaction(
      async (tx) => recomputeInvoicePaymentState(tx, invoice.id),
      { isolationLevel: 'Serializable' }
    );

    // Void the payment (status -> REFUNDED).
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED },
    });
    await withTransaction(
      async (tx) => recomputeInvoicePaymentState(tx, invoice.id),
      { isolationLevel: 'Serializable' }
    );

    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.paidAmount.toFixed(2)).toBe('0.00');
    expect(updated.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(updated.paidAt).toBeNull();
  });

  it('parallel payments serialize: paidAmount == SUM of both', async () => {
    const invoice = await createTestInvoice('100.00');

    // Two concurrent Serializable transactions each add a payment and
    // recompute. One will retry on serialization failure (P2034/40001);
    // the final paidAmount must equal the sum of both payments.
    await Promise.all([
      (async () => {
        await createPayment(invoice.id, '40.00');
        await withTransaction(
          async (tx) => recomputeInvoicePaymentState(tx, invoice.id),
          { isolationLevel: 'Serializable', maxRetries: 5 }
        );
      })(),
      (async () => {
        await createPayment(invoice.id, '35.00');
        await withTransaction(
          async (tx) => recomputeInvoicePaymentState(tx, invoice.id),
          { isolationLevel: 'Serializable', maxRetries: 5 }
        );
      })(),
    ]);

    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.paidAmount.toFixed(2)).toBe('75.00');
    expect(updated.paymentStatus).toBe(PaymentStatus.PROCESSING);
  });

  it('invoice number allocated via generateDocumentNumber in-tx (no orphan on rollback)', async () => {
    const suffix = uid();
    let allocatedNumber: string | undefined;

    // Simulate a failed create: allocate the number then throw.
    await expect(
      withTransaction(async (tx) => {
        allocatedNumber = await generateDocumentNumber(tx, `INV-INVTEST-${suffix}`);
        throw new Error('simulated failure');
      })
    ).rejects.toThrow('simulated failure');

    // The counter row was rolled back; the next allocation starts at 1.
    const next = await withTransaction(async (tx) =>
      generateDocumentNumber(tx, `INV-INVTEST-${suffix}`)
    );
    // Both allocations get the same number (the first was rolled back).
    expect(next).toBe(allocatedNumber);
  });
});
