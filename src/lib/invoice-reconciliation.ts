/**
 * Invoice/payment reconciliation (#30/#31) - pure module, no 'use server',
 * no I/O, mirroring pricing.ts: unit-testable and shared by every writer.
 *
 * INVARIANT (single-writer): Invoice.paidAmount is ALWAYS derived as the
 * 2dp sum of its COMPLETED payments inside the same transaction that
 * mutates payments. No code path may increment or set paidAmount
 * independently - the seed's createSingleInvoice established the pattern,
 * payment-actions.ts enforces it at runtime, and the paidAmount <= total
 * CHECK (#11) is the database backstop.
 */

import { InvoiceStatus, PaymentStatus } from '@/app/generated/prisma';
// eslint-disable-next-line no-restricted-imports -- same browser-safe runtime entry as pricing.ts
import { Decimal } from '@/app/generated/prisma/runtime/index-browser';

import { round2, toDecimal, type MoneyInput } from '@/lib/pricing';

/** Payment statuses that count toward paidAmount. Exactly COMPLETED. */
export const COUNTED_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  PaymentStatus.COMPLETED,
] as const;

/** Thrown before any write when a payment would exceed the invoice total. */
export class OverpaymentError extends Error {
  constructor(message = 'Payment would exceed the invoice total') {
    super(message);
    this.name = 'OverpaymentError';
  }
}

/** Derive the invoice's paymentStatus from its paid/total amounts. */
export function derivePaymentStatus(paid: MoneyInput, total: MoneyInput): PaymentStatus {
  const paidDecimal = toDecimal(paid);
  if (paidDecimal.lessThanOrEqualTo(0)) {
    return PaymentStatus.PENDING;
  }
  if (paidDecimal.greaterThanOrEqualTo(toDecimal(total))) {
    return PaymentStatus.COMPLETED;
  }
  return PaymentStatus.PROCESSING;
}

export interface ReconcileResult {
  /** 2dp sum of COMPLETED payments - the only legal paidAmount value. */
  paidAmount: Decimal;
  paymentStatus: PaymentStatus;
  fullyPaid: boolean;
}

/**
 * Reconcile an invoice's payment totals from the (already aggregated) sum
 * of its COMPLETED payments. Throws OverpaymentError when the sum exceeds
 * the total - callers check BEFORE writing, the DB CHECK backstops after.
 */
export function reconcilePaidAmount(
  completedPaymentsSum: MoneyInput,
  totalAmount: MoneyInput
): ReconcileResult {
  const paidAmount = round2(completedPaymentsSum);
  const total = round2(totalAmount);

  if (paidAmount.greaterThan(total)) {
    throw new OverpaymentError(
      `Payments (${paidAmount.toFixed(2)}) exceed invoice total (${total.toFixed(2)})`
    );
  }

  return {
    paidAmount,
    paymentStatus: derivePaymentStatus(paidAmount, total),
    fullyPaid: paidAmount.greaterThan(0) && paidAmount.equals(total),
  };
}

/**
 * Invoice document status after reconciliation:
 * - fully paid -> PAID
 * - no longer fully paid (a payment was voided) -> back to SENT if it was
 *   ever sent, else DRAFT. Other statuses pass through unchanged.
 */
export function invoiceStatusAfterReconcile(
  current: InvoiceStatus,
  fullyPaid: boolean,
  sentAt: Date | null
): InvoiceStatus {
  if (fullyPaid) {
    return InvoiceStatus.PAID;
  }
  if (current === InvoiceStatus.PAID) {
    return sentAt ? InvoiceStatus.SENT : InvoiceStatus.DRAFT;
  }
  return current;
}
