/**
 * #30 - invoice domain math: Decimal-exact totals composition (the #11
 * CHECK invoices_total_composition_check must hold BY CONSTRUCTION) and
 * payment-state derivation (paidAmount == SUM(COMPLETED payments)).
 */
import { describe, expect, it } from '@jest/globals';

import { InvoiceDirection, PaymentStatus } from '@/app/generated/prisma';
import {
  PURCHASE_INVOICE_PREFIX,
  SALES_INVOICE_PREFIX,
  buildInvoiceItems,
  computeInvoiceTotals,
  derivePaymentState,
  invoiceNumberPrefix,
} from '@/lib/invoices';
import { ZERO } from '@/lib/pricing';

describe('computeInvoiceTotals (#30)', () => {
  it('sums line amounts in Decimal - 0.1 + 0.2 is exactly 0.3', () => {
    const totals = computeInvoiceTotals(['0.10', '0.20'], 0);

    expect(totals.subtotal.toFixed(2)).toBe('0.30');
    expect(totals.taxAmount.toFixed(2)).toBe('0.00');
    expect(totals.totalAmount.toFixed(2)).toBe('0.30');
  });

  it('composition is exact: total = subtotal + tax - irpf (the #11 CHECK shape)', () => {
    const totals = computeInvoiceTotals(['33.33', '33.33', '33.34'], 21, 15);

    expect(totals.subtotal.toFixed(2)).toBe('100.00');
    expect(totals.taxAmount.toFixed(2)).toBe('21.00');
    expect(totals.irpfRate?.toFixed(2)).toBe('15.00');
    expect(totals.irpfAmount?.toFixed(2)).toBe('15.00');
    expect(totals.totalAmount.toFixed(2)).toBe('106.00');

    const recomposed = totals.subtotal.plus(totals.taxAmount).minus(totals.irpfAmount ?? ZERO);
    expect(recomposed.equals(totals.totalAmount)).toBe(true);
  });

  it('stays exact on awkward component roundings', () => {
    // subtotal 0.15; 10% VAT = 0.015 -> half-up 0.02; total 0.17 exactly.
    const totals = computeInvoiceTotals(['0.10', '0.05'], 10);

    expect(totals.subtotal.toFixed(2)).toBe('0.15');
    expect(totals.taxAmount.toFixed(2)).toBe('0.02');
    expect(totals.totalAmount.toFixed(2)).toBe('0.17');
    expect(
      totals.subtotal.plus(totals.taxAmount).equals(totals.totalAmount)
    ).toBe(true);
  });

  it('stores null - not 0 - when no IRPF retention applies', () => {
    const noRate = computeInvoiceTotals(['100.00'], 21);
    const zeroRate = computeInvoiceTotals(['100.00'], 21, 0);

    for (const totals of [noRate, zeroRate]) {
      expect(totals.irpfRate).toBeNull();
      expect(totals.irpfAmount).toBeNull();
      expect(totals.totalAmount.toFixed(2)).toBe('121.00');
    }
  });
});

describe('buildInvoiceItems (#30)', () => {
  it('emits per-service items with 2dp string money for Prisma inputs', () => {
    const [item] = buildInvoiceItems(
      [{ serviceId: 'svc-1', description: 'Madrid - Barcelona', amount: '150.5' }],
      21
    );

    expect(item).toEqual({
      serviceId: 'svc-1',
      description: 'Madrid - Barcelona',
      quantity: 1,
      unitPrice: '150.50',
      amount: '150.50',
      taxRate: '21.00',
      taxAmount: '31.61', // 150.50 * 0.21 = 31.605 -> half-up 31.61
    });
  });
});

describe('derivePaymentState (#30)', () => {
  const completed = (amount: string) => ({ amount, status: PaymentStatus.COMPLETED });

  it('PENDING with no received money', () => {
    const state = derivePaymentState('121.00', []);
    expect(state.paidAmount.toFixed(2)).toBe('0.00');
    expect(state.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(state.fullyPaid).toBe(false);
  });

  it('PROCESSING while partially paid, COMPLETED when fully paid', () => {
    const partial = derivePaymentState('121.00', [completed('100.00')]);
    expect(partial.paymentStatus).toBe(PaymentStatus.PROCESSING);
    expect(partial.fullyPaid).toBe(false);

    const full = derivePaymentState('121.00', [completed('100.00'), completed('21.00')]);
    expect(full.paidAmount.toFixed(2)).toBe('121.00');
    expect(full.paymentStatus).toBe(PaymentStatus.COMPLETED);
    expect(full.fullyPaid).toBe(true);
  });

  it('only COMPLETED payments count as money received', () => {
    const state = derivePaymentState('121.00', [
      completed('50.00'),
      { amount: '50.00', status: PaymentStatus.PENDING },
      { amount: '50.00', status: PaymentStatus.PROCESSING },
      { amount: '50.00', status: PaymentStatus.FAILED },
      { amount: '50.00', status: PaymentStatus.REFUNDED },
    ]);

    expect(state.paidAmount.toFixed(2)).toBe('50.00');
    expect(state.paymentStatus).toBe(PaymentStatus.PROCESSING);
  });

  it('sums in Decimal - three cent-fraction payments reconcile exactly', () => {
    const state = derivePaymentState('0.30', [
      completed('0.10'),
      completed('0.10'),
      completed('0.10'),
    ]);

    expect(state.paidAmount.toFixed(2)).toBe('0.30');
    expect(state.paymentStatus).toBe(PaymentStatus.COMPLETED);
  });

  it('never clamps an over-payment (rejection is the DB CHECK\u0027s job)', () => {
    const state = derivePaymentState('100.00', [completed('150.00')]);
    expect(state.paidAmount.toFixed(2)).toBe('150.00');
    expect(state.fullyPaid).toBe(true);
  });

  it('a zero-total invoice is never "fully paid"', () => {
    const state = derivePaymentState('0.00', []);
    expect(state.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(state.fullyPaid).toBe(false);
  });
});

describe('invoiceNumberPrefix (#30, ADR 0001)', () => {
  it('SALES uses the issued INV series; PURCHASE the RINV registration series', () => {
    expect(invoiceNumberPrefix(InvoiceDirection.SALES)).toBe(SALES_INVOICE_PREFIX);
    expect(invoiceNumberPrefix(InvoiceDirection.PURCHASE)).toBe(PURCHASE_INVOICE_PREFIX);
    expect(SALES_INVOICE_PREFIX).toBe('INV');
    expect(PURCHASE_INVOICE_PREFIX).toBe('RINV');
  });
});
