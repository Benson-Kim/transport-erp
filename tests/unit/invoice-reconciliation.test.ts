/**
 * #30/#31 - reconciliation derivation matrix. paidAmount/paymentStatus/
 * invoice status are pure functions of the COMPLETED-payments sum.
 */

import { describe, expect, it } from '@jest/globals';

import { InvoiceStatus, PaymentStatus } from '@/app/generated/prisma';
import {
  derivePaymentStatus,
  invoiceStatusAfterReconcile,
  OverpaymentError,
  reconcilePaidAmount,
} from '@/lib/invoice-reconciliation';

describe('derivePaymentStatus', () => {
  it('is PENDING at zero, PROCESSING when partial, COMPLETED when full', () => {
    expect(derivePaymentStatus(0, 100)).toBe(PaymentStatus.PENDING);
    expect(derivePaymentStatus('50.00', '100.00')).toBe(PaymentStatus.PROCESSING);
    expect(derivePaymentStatus('100.00', '100.00')).toBe(PaymentStatus.COMPLETED);
  });
});

describe('reconcilePaidAmount', () => {
  it('returns the 2dp sum and derived status', () => {
    const result = reconcilePaidAmount('33.335', '100.00');
    expect(result.paidAmount.toFixed(2)).toBe('33.34'); // half-up, seed-canonical
    expect(result.paymentStatus).toBe(PaymentStatus.PROCESSING);
    expect(result.fullyPaid).toBe(false);
  });

  it('marks fully paid only at exactly the total (and above zero)', () => {
    const full = reconcilePaidAmount('121.00', '121.00');
    expect(full.fullyPaid).toBe(true);
    expect(full.paymentStatus).toBe(PaymentStatus.COMPLETED);

    const zero = reconcilePaidAmount(0, 0);
    expect(zero.fullyPaid).toBe(false); // zero-total invoice is never "paid"
  });

  it('throws typed OverpaymentError when the sum exceeds the total', () => {
    expect(() => reconcilePaidAmount('121.01', '121.00')).toThrow(OverpaymentError);
    expect(() => reconcilePaidAmount('121.01', '121.00')).toThrow(/exceed/i);
  });
});

describe('invoiceStatusAfterReconcile', () => {
  it('promotes to PAID when fully paid', () => {
    expect(invoiceStatusAfterReconcile(InvoiceStatus.SENT, true, new Date())).toBe(
      InvoiceStatus.PAID
    );
    expect(invoiceStatusAfterReconcile(InvoiceStatus.DRAFT, true, null)).toBe(InvoiceStatus.PAID);
  });

  it('demotes a PAID invoice back to SENT (if ever sent) or DRAFT on void', () => {
    expect(invoiceStatusAfterReconcile(InvoiceStatus.PAID, false, new Date())).toBe(
      InvoiceStatus.SENT
    );
    expect(invoiceStatusAfterReconcile(InvoiceStatus.PAID, false, null)).toBe(InvoiceStatus.DRAFT);
  });

  it('passes other statuses through unchanged when not fully paid', () => {
    expect(invoiceStatusAfterReconcile(InvoiceStatus.SENT, false, new Date())).toBe(
      InvoiceStatus.SENT
    );
    expect(invoiceStatusAfterReconcile(InvoiceStatus.OVERDUE, false, null)).toBe(
      InvoiceStatus.OVERDUE
    );
  });
});
