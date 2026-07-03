/**
 * Invoice domain logic (#30, ADR 0001).
 *
 * Pure money composition and payment-state derivation live here
 * (unit-testable without a DB), plus recomputeInvoicePaymentState - the ONE
 * transactional writer of Invoice.paidAmount / paymentStatus / paidAt. No
 * other code path may set those columns: every payment operation recomputes
 * them from the Payment rows INSIDE the surrounding transaction
 * (Serializable at the call sites), so paidAmount == SUM(payments) is an
 * invariant, not a hope. Reference pattern: prisma/seed.ts
 * createSingleInvoice (the paidAmount-with-Payment-row-in-one-tx shape).
 *
 * All arithmetic goes through src/lib/pricing.ts (#25): Decimal end-to-end,
 * 2dp half-up. The invoice-level composition
 * total = subtotal + tax - COALESCE(irpf, 0) is exact BY CONSTRUCTION -
 * every component is rounded to 2dp before the sum - so it satisfies the
 * #11 CHECK invoices_total_composition_check exactly (the same
 * integer-exact composition the seed achieves in cents).
 */

import { InvoiceDirection, PaymentStatus } from '@/app/generated/prisma';
import {
  irpfAmount as irpfRetention,
  round2,
  toDecimal,
  vatAmount,
  ZERO,
  type MoneyInput,
} from '@/lib/pricing';

type Money = ReturnType<typeof toDecimal>;

/** Issued SALES series - we allocate and own these numbers. */
export const SALES_INVOICE_PREFIX = 'INV';

/**
 * PURCHASE registration series: we REGISTER received supplier invoices under
 * our internal RINV number; the supplier's own number is stored in
 * externalReference (never in invoiceNumber - we do not issue theirs).
 */
export const PURCHASE_INVOICE_PREFIX = 'RINV';

/** Document-number prefix per billing direction (see numbering.ts, #12/#61). */
export function invoiceNumberPrefix(direction: InvoiceDirection): string {
  return direction === InvoiceDirection.SALES ? SALES_INVOICE_PREFIX : PURCHASE_INVOICE_PREFIX;
}

export interface InvoiceTotals {
  subtotal: Money;
  taxAmount: Money;
  /** null when no retention applies (rate absent or 0) - matching the nullable DB columns. */
  irpfRate: Money | null;
  irpfAmount: Money | null;
  totalAmount: Money;
}

/**
 * Compose invoice totals from net line amounts.
 *
 * VAT is computed on the SUBTOTAL (seed-canonical), not summed from
 * per-line tax roundings - the #11 composition CHECK constrains the
 * invoice-level figures. IRPF (Spanish retention, PURCHASE invoices) is
 * stored as null - not 0 - when no retention applies: "0% retention" and
 * "no retention configured" are different facts (!20 review doctrine).
 */
export function computeInvoiceTotals(
  lineAmounts: readonly MoneyInput[],
  vatRatePoints: MoneyInput,
  irpfRatePoints?: MoneyInput | null
): InvoiceTotals {
  const subtotal = round2(
    lineAmounts.reduce<Money>((sum, amount) => sum.plus(toDecimal(amount)), ZERO)
  );
  const taxAmount = vatAmount(subtotal, vatRatePoints);

  const rate =
    irpfRatePoints === null || irpfRatePoints === undefined ? null : toDecimal(irpfRatePoints);
  const hasIrpf = rate !== null && rate.greaterThan(0);
  const irpfValue = hasIrpf ? irpfRetention(subtotal, rate) : null;

  const totalAmount = round2(subtotal.plus(taxAmount).minus(irpfValue ?? ZERO));

  return {
    subtotal,
    taxAmount,
    irpfRate: hasIrpf ? rate : null,
    irpfAmount: irpfValue,
    totalAmount,
  };
}

export interface InvoiceLineInput {
  serviceId: string;
  description: string;
  /** Net amount: saleAmount on SALES invoices, costAmount on PURCHASE. */
  amount: MoneyInput;
}

export interface InvoiceItemData {
  serviceId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  amount: string;
  taxRate: string;
  taxAmount: string;
}

/**
 * Per-service invoice items (quantity 1, unitPrice = net amount). The
 * per-item taxAmount is informational per-line rounding; the binding
 * figures are the invoice-level totals from computeInvoiceTotals.
 * Decimal fields are emitted as fixed 2dp strings for Prisma inputs.
 */
export function buildInvoiceItems(
  lines: readonly InvoiceLineInput[],
  vatRatePoints: MoneyInput
): InvoiceItemData[] {
  const rate = toDecimal(vatRatePoints);
  return lines.map((line) => {
    const amount = round2(line.amount);
    return {
      serviceId: line.serviceId,
      description: line.description,
      quantity: 1,
      unitPrice: amount.toFixed(2),
      amount: amount.toFixed(2),
      taxRate: rate.toFixed(2),
      taxAmount: vatAmount(amount, rate).toFixed(2),
    };
  });
}

/**
 * Payment statuses that count as money actually received. PENDING /
 * PROCESSING / FAILED payments contribute nothing to paidAmount; REFUNDED
 * payments are money returned, so they stop counting once refunded.
 */
export const PAID_PAYMENT_STATUSES: readonly PaymentStatus[] = [PaymentStatus.COMPLETED];

export interface PaymentLike {
  amount: MoneyInput;
  status: PaymentStatus;
}

export interface DerivedPaymentState {
  paidAmount: Money;
  paymentStatus: PaymentStatus;
  fullyPaid: boolean;
}

/**
 * Derive the invoice payment state from its Payment rows - the single
 * definition of "how paid is this invoice":
 * - paidAmount = SUM(amount of COMPLETED payments), 2dp
 * - COMPLETED when fully paid (total > 0), PROCESSING when partially paid,
 *   PENDING when nothing received.
 * Never clamps: over-payment is surfaced to the DB CHECK by the caller.
 */
export function derivePaymentState(
  totalAmount: MoneyInput,
  payments: readonly PaymentLike[]
): DerivedPaymentState {
  const total = toDecimal(totalAmount);
  const paidAmount = round2(
    payments
      .filter((payment) => PAID_PAYMENT_STATUSES.includes(payment.status))
      .reduce<Money>((sum, payment) => sum.plus(toDecimal(payment.amount)), ZERO)
  );

  const fullyPaid = total.greaterThan(0) && paidAmount.greaterThanOrEqualTo(total);

  let paymentStatus: PaymentStatus = PaymentStatus.PENDING;
  if (fullyPaid) {
    paymentStatus = PaymentStatus.COMPLETED;
  } else if (paidAmount.greaterThan(0)) {
    paymentStatus = PaymentStatus.PROCESSING;
  }

  return { paidAmount, paymentStatus, fullyPaid };
}

/**
 * Minimal structural client (method shorthand for parameter bivariance -
 * the db-helpers.ts AuditLogWriter / loading-orders.ts pattern): satisfied
 * by the $extends-ed app singleton, an interactive transaction client, and
 * the raw PrismaClient the DB test harness uses.
 */
export type InvoicePaymentTxClient = {
  invoice: {
    findFirst(args: {
      where: { id: string; deletedAt: null };
      select: { totalAmount: true; paidAt: true };
    }): Promise<{ totalAmount: MoneyInput; paidAt: Date | null } | null>;
    update(args: {
      where: { id: string };
      data: { paidAmount: string; paymentStatus: PaymentStatus; paidAt: Date | null };
    }): Promise<unknown>;
  };
  payment: {
    findMany(args: {
      where: { invoiceId: string };
      select: { amount: true; status: true };
    }): Promise<Array<{ amount: MoneyInput; status: PaymentStatus }>>;
  };
};

/**
 * Recompute Invoice.paidAmount / paymentStatus / paidAt from the Payment
 * rows - the ONLY writer of those columns (#30: never let two writers set
 * paidAmount independently).
 *
 * MUST be called with the client of the surrounding transaction, and the
 * transaction MUST be Serializable at money call sites: concurrent payment
 * operations then serialize (withTransaction retries P2034/40001), so
 * parallel payments can never over- or under-count paidAmount.
 *
 * Deliberately NO clamping: if payments exceed the total, the write carries
 * SUM(payments) and the #11 DB CHECK (paidAmount <= totalAmount) rejects
 * the whole transaction - honest failure, never silently-capped books.
 * App-level pre-validation of individual payments is #31's scope.
 */
export async function recomputeInvoicePaymentState(
  tx: InvoicePaymentTxClient,
  invoiceId: string
): Promise<DerivedPaymentState> {
  const invoice = await tx.invoice.findFirst({
    where: { id: invoiceId, deletedAt: null },
    select: { totalAmount: true, paidAt: true },
  });
  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found or deleted`);
  }

  const payments = await tx.payment.findMany({
    where: { invoiceId },
    select: { amount: true, status: true },
  });

  const state = derivePaymentState(invoice.totalAmount, payments);

  await tx.invoice.update({
    where: { id: invoiceId },
    data: {
      paidAmount: state.paidAmount.toFixed(2),
      paymentStatus: state.paymentStatus,
      // First full settlement stamps paidAt; a later void/refund that drops
      // below the total clears it - derived, never drifting (#30).
      paidAt: state.fullyPaid ? (invoice.paidAt ?? new Date()) : null,
    },
  });

  return state;
}
