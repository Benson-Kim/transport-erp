// /actions/payment-actions.ts
'use server';

/**
 * Payment Server Actions (#31).
 *
 * INVARIANT: after any payment operation, Invoice.paidAmount equals the 2dp
 * SUM of its COMPLETED payments, and paymentStatus/paidAt/status are derived
 * from that sum - recomputed by re-aggregating INSIDE the same Serializable
 * transaction as the payment write. Parallel payments serialize (Postgres
 * 40001 retries via withTransaction); overpayment is rejected before the
 * write (OverpaymentError) and backstopped by the #11 DB CHECK.
 */

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { InvoiceStatus, PaymentStatus } from '@/app/generated/prisma';
import {
  COUNTED_PAYMENT_STATUSES,
  invoiceStatusAfterReconcile,
  OverpaymentError,
  reconcilePaidAmount,
} from '@/lib/invoice-reconciliation';
import { getServerAuth } from '@/lib/auth';
import { RESOURCES, ACTIONS } from '@/lib/permissions';
import { round2, toDecimal, ZERO } from '@/lib/pricing';
import { createAuditLog, withTransaction } from '@/lib/prisma/db-helpers';
import { generateDocumentNumber } from '@/lib/prisma/numbering';
import { requirePermission } from '@/lib/rbac';
import { recordPaymentSchema } from '@/lib/validations/invoice-schema';
import type { ActionResult } from '@/types/invoice';

async function getRequestMeta() {
  const headersList = await headers();
  return {
    ipAddress: headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? undefined,
    userAgent: headersList.get('user-agent') ?? undefined,
  };
}

type TxResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Record a payment against an invoice.
 */
export async function recordPayment(data: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission(RESOURCES.PAYMENTS, ACTIONS.CREATE);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const validated = recordPaymentSchema.parse(data);
    const { ipAddress, userAgent } = await getRequestMeta();
    const userId = session.user.id;

    const result = await withTransaction<TxResult>(
      async (tx) => {
        const invoice = await tx.invoice.findFirst({
          where: { id: validated.invoiceId, deletedAt: null },
        });
        if (!invoice) {
          return { ok: false, error: 'Invoice not found' };
        }
        if (invoice.status === InvoiceStatus.CANCELLED) {
          return { ok: false, error: 'Cannot record a payment on a cancelled invoice' };
        }

        // Pre-write guard: would this payment exceed the total?
        const existingSum = await tx.payment.aggregate({
          where: { invoiceId: invoice.id, status: { in: [...COUNTED_PAYMENT_STATUSES] } },
          _sum: { amount: true },
        });
        const projected = round2(
          toDecimal(existingSum._sum.amount ?? ZERO).plus(round2(validated.amount))
        );
        if (projected.greaterThan(toDecimal(invoice.totalAmount))) {
          const outstanding = round2(
            toDecimal(invoice.totalAmount).minus(existingSum._sum.amount ?? ZERO)
          );
          return {
            ok: false,
            error: `Payment exceeds the outstanding amount (${outstanding.toFixed(2)} ${invoice.currency})`,
          };
        }

        const paymentNumber = await generateDocumentNumber(tx, 'PAY');
        const payment = await tx.payment.create({
          data: {
            paymentNumber,
            invoiceId: invoice.id,
            amount: round2(validated.amount),
            currency: invoice.currency,
            paymentDate: validated.paymentDate,
            paymentMethod: validated.paymentMethod,
            reference: validated.reference || null,
            notes: validated.notes || null,
            status: PaymentStatus.COMPLETED,
          },
        });

        // Re-aggregate AFTER the write, inside the same tx: paidAmount is
        // derived from what is actually stored, never incremented.
        const sumAfter = await tx.payment.aggregate({
          where: { invoiceId: invoice.id, status: { in: [...COUNTED_PAYMENT_STATUSES] } },
          _sum: { amount: true },
        });
        const reconciled = reconcilePaidAmount(sumAfter._sum.amount ?? ZERO, invoice.totalAmount);

        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: reconciled.paidAmount,
            paymentStatus: reconciled.paymentStatus,
            paidAt: reconciled.fullyPaid ? (invoice.paidAt ?? new Date()) : null,
            status: invoiceStatusAfterReconcile(
              invoice.status,
              reconciled.fullyPaid,
              invoice.sentAt
            ),
            paymentMethod: validated.paymentMethod,
            paymentReference: validated.reference || invoice.paymentReference,
          },
        });

        await createAuditLog(
          {
            userId,
            action: 'CREATE',
            tableName: 'payments',
            recordId: payment.id,
            newValues: {
              paymentNumber,
              invoiceId: invoice.id,
              amount: round2(validated.amount).toFixed(2),
              paidAmountAfter: reconciled.paidAmount.toFixed(2),
              paymentStatusAfter: reconciled.paymentStatus,
            },
            ipAddress,
            userAgent,
          },
          tx
        );

        return { ok: true, id: payment.id };
      },
      { isolationLevel: 'Serializable' }
    );

    if (!result.ok) {
      return { success: false, error: result.error };
    }

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${validated.invoiceId}`);

    return { success: true, data: { id: result.id } };
  } catch (error) {
    console.error('Failed to record payment:', error);
    if (error instanceof OverpaymentError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record payment',
    };
  }
}

/**
 * Void a payment (sets REFUNDED - rows are never deleted; the financial
 * trail is preserved) and re-derive the invoice's payment state.
 */
export async function voidPayment(paymentId: string): Promise<ActionResult> {
  try {
    await requirePermission(RESOURCES.PAYMENTS, ACTIONS.DELETE);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { ipAddress, userAgent } = await getRequestMeta();
    const userId = session.user.id;

    const result = await withTransaction<TxResult>(
      async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          include: { invoice: true },
        });
        if (!payment) {
          return { ok: false, error: 'Payment not found' };
        }
        if (payment.status === PaymentStatus.REFUNDED) {
          return { ok: false, error: 'Payment is already voided' };
        }

        await tx.payment.update({
          where: { id: paymentId },
          data: { status: PaymentStatus.REFUNDED },
        });

        const sumAfter = await tx.payment.aggregate({
          where: { invoiceId: payment.invoiceId, status: { in: [...COUNTED_PAYMENT_STATUSES] } },
          _sum: { amount: true },
        });
        const reconciled = reconcilePaidAmount(
          sumAfter._sum.amount ?? ZERO,
          payment.invoice.totalAmount
        );

        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            paidAmount: reconciled.paidAmount,
            paymentStatus: reconciled.paymentStatus,
            paidAt: reconciled.fullyPaid ? payment.invoice.paidAt : null,
            status: invoiceStatusAfterReconcile(
              payment.invoice.status,
              reconciled.fullyPaid,
              payment.invoice.sentAt
            ),
          },
        });

        await createAuditLog(
          {
            userId,
            action: 'UPDATE',
            tableName: 'payments',
            recordId: paymentId,
            oldValues: { status: payment.status },
            newValues: {
              status: PaymentStatus.REFUNDED,
              paidAmountAfter: reconciled.paidAmount.toFixed(2),
            },
            ipAddress,
            userAgent,
          },
          tx
        );

        return { ok: true, id: paymentId };
      },
      { isolationLevel: 'Serializable' }
    );

    if (!result.ok) {
      return { success: false, error: result.error };
    }

    revalidatePath('/invoices');

    return { success: true };
  } catch (error) {
    console.error('Failed to void payment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to void payment',
    };
  }
}
