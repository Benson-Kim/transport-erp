/* eslint-disable max-lines */
// src/actions/payment-actions.ts
'use server';

/**
 * Payment Server Actions (#31)
 *
 * Record and void payments against invoices. paidAmount is ALWAYS derived
 * from the Payment rows via recomputeInvoicePaymentState inside the same
 * Serializable transaction - never set independently.
 *
 * Pre-validation: a new payment cannot exceed the invoice's remaining
 * balance (app guard before the DB CHECK). The DB CHECK
 * (paidAmount <= totalAmount, #11) is the final backstop.
 */

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { PaymentStatus, type Prisma } from '@/app/generated/prisma';
import { getServerAuth } from '@/lib/auth';
import { recomputeInvoicePaymentState } from '@/lib/invoices';
import { RESOURCES, ACTIONS } from '@/lib/permissions';
import { decimalToNumber, toDecimal } from '@/lib/pricing';
import {
  createAuditLog,
  excludeDeleted,
  withTransaction,
} from '@/lib/prisma/db-helpers';
import { generateDocumentNumber } from '@/lib/prisma/numbering';
import prisma from '@/lib/prisma/prisma';
import { requirePermission } from '@/lib/rbac';
import { createPaymentSchema } from '@/lib/validations/payment-schema';
import type { ActionResult } from '@/types/invoice';

async function getRequestMeta() {
  const headersList = await headers();
  return {
    ipAddress: headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? undefined,
    userAgent: headersList.get('user-agent') ?? undefined,
  };
}

/**
 * Record a payment against an invoice.
 *
 * The entire operation runs in ONE Serializable transaction:
 * 1. Re-read the invoice (TOCTOU: status/paidAmount may have changed).
 * 2. App-level guard: new payment cannot exceed remaining balance.
 * 3. generateDocumentNumber(tx, 'PAY') - atomic counter bump (#12/#61).
 * 4. tx.payment.create.
 * 5. recomputeInvoicePaymentState(tx, invoiceId) - derives paidAmount from
 *    SUM(COMPLETED payments) and writes it atomically.
 * 6. createAuditLog(tx) - audit row commits with the mutation (#27).
 */
export async function recordPayment(
  invoiceId: string,
  data: unknown
): Promise<ActionResult<{ id: string; paymentNumber: string }>> {
  try {
    await requirePermission(RESOURCES.PAYMENTS, ACTIONS.CREATE);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const validated = createPaymentSchema.parse(data);
    const { ipAddress, userAgent } = await getRequestMeta();
    const userId = session.user.id;

    const result = await withTransaction(
      async (tx) => {
        // Re-read inside the tx (TOCTOU guard).
        const invoice = await tx.invoice.findFirst({
          where: { id: invoiceId, deletedAt: null },
          select: { totalAmount: true, paidAmount: true, status: true },
        });
        if (!invoice) {
          throw new Error('Invoice not found');
        }

        const remaining = toDecimal(invoice.totalAmount).minus(toDecimal(invoice.paidAmount));
        const paymentAmount = toDecimal(validated.amount);

        if (paymentAmount.greaterThan(remaining)) {
          throw new Error(
            `Payment amount (${paymentAmount.toFixed(2)}) exceeds remaining balance (${remaining.toFixed(2)})`
          );
        }

        const paymentNumber = await generateDocumentNumber(tx, 'PAY');

        const createData: Prisma.PaymentCreateInput = {
          paymentNumber,
          invoice: { connect: { id: invoiceId } },
          amount: validated.amount,
          currency: validated.currency,
          paymentDate: validated.paymentDate,
          paymentMethod: validated.paymentMethod,
          reference: validated.reference ?? null,
          status: PaymentStatus.COMPLETED,
          notes: validated.notes ?? null,
        };

        const payment = await tx.payment.create({ data: createData });

        // Derive paidAmount from SUM(payments) - the single writer.
        await recomputeInvoicePaymentState(tx, invoiceId);

        await createAuditLog(
          {
            userId,
            action: 'CREATE',
            tableName: 'payments',
            recordId: payment.id,
            newValues: {
              paymentNumber,
              invoiceId,
              amount: validated.amount,
              paymentMethod: validated.paymentMethod,
            },
            ipAddress,
            userAgent,
          },
          tx
        );

        return { id: payment.id, paymentNumber };
      },
      { isolationLevel: 'Serializable' }
    );

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${invoiceId}`);

    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to record payment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record payment',
    };
  }
}

/**
 * Void a payment (set status to REFUNDED) and recompute the invoice
 * paidAmount in the same Serializable transaction.
 *
 * Only COMPLETED payments may be voided; a REFUNDED payment is already
 * excluded from paidAmount and cannot be double-voided.
 */
export async function voidPayment(
  paymentId: string
): Promise<ActionResult<{ invoiceId: string }>> {
  try {
    await requirePermission(RESOURCES.PAYMENTS, ACTIONS.DELETE);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const existing = await prisma.payment.findUnique({
      where: { id: paymentId },
      select: { invoiceId: true, status: true, amount: true, paymentNumber: true },
    });
    if (!existing) {
      return { success: false, error: 'Payment not found' };
    }
    if (existing.status !== PaymentStatus.COMPLETED) {
      return { success: false, error: 'Only completed payments can be voided' };
    }

    const { ipAddress, userAgent } = await getRequestMeta();
    const userId = session.user.id;
    const { invoiceId } = existing;

    await withTransaction(
      async (tx) => {
        await tx.payment.update({
          where: { id: paymentId },
          data: { status: PaymentStatus.REFUNDED },
        });

        // Recompute paidAmount after the void.
        await recomputeInvoicePaymentState(tx, invoiceId);

        await createAuditLog(
          {
            userId,
            action: 'UPDATE',
            tableName: 'payments',
            recordId: paymentId,
            oldValues: { status: PaymentStatus.COMPLETED },
            newValues: { status: PaymentStatus.REFUNDED },
            ipAddress,
            userAgent,
            metadata: { paymentNumber: existing.paymentNumber, invoiceId },
          },
          tx
        );
      },
      { isolationLevel: 'Serializable' }
    );

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${invoiceId}`);

    return { success: true, data: { invoiceId } };
  } catch (error) {
    console.error('Failed to void payment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to void payment',
    };
  }
}

/**
 * Get all payments for an invoice (for the detail view).
 */
export async function getPaymentsByInvoice(
  invoiceId: string
): Promise<ActionResult<Array<{
  id: string;
  paymentNumber: string;
  amount: number;
  paymentDate: Date;
  paymentMethod: string;
  reference: string | null;
  status: PaymentStatus;
}>>> {
  try {
    await requirePermission(RESOURCES.PAYMENTS, ACTIONS.VIEW);

    const invoice = await prisma.invoice.findFirst({
      where: excludeDeleted<'invoice'>({ id: invoiceId }),
      select: { id: true },
    });
    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    const payments = await prisma.payment.findMany({
      where: { invoiceId },
      orderBy: { paymentDate: 'asc' },
    });

    return {
      success: true,
      data: payments.map((payment) => ({
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        amount: decimalToNumber(payment.amount),
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        reference: payment.reference,
        status: payment.status,
      })),
    };
  } catch (error) {
    console.error('Failed to get payments:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch payments',
    };
  }
}
