/* eslint-disable max-lines */
// /actions/invoice-actions.ts
'use server';

/**
 * Invoice Server Actions (#30, ADR 0001).
 *
 * Money rules:
 * - Item amounts and invoice totals are computed SERVER-SIDE in Decimal via
 *   pricing.ts. Client-provided totals are never trusted.
 * - total = subtotal + tax exactly (composition CHECK); IRPF is recorded on
 *   PURCHASE invoices via pricing.irpfAmount() (informational retention).
 * - Everything money-mutating runs in ONE Serializable withTransaction with
 *   the number allocation and the audit row (#12/#27).
 */

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { InvoiceDirection, InvoiceStatus, Prisma } from '@/app/generated/prisma';
import { getServerAuth } from '@/lib/auth';
import { RESOURCES, ACTIONS } from '@/lib/permissions';
import { decimalToNumber, irpfAmount, round2, toDecimal, vatAmount, ZERO } from '@/lib/pricing';
import {
  createAuditLog,
  excludeDeleted,
  getPaginationParams,
  createPaginatedResponse,
  withTransaction,
} from '@/lib/prisma/db-helpers';
import { generateDocumentNumber } from '@/lib/prisma/numbering';
import prisma from '@/lib/prisma/prisma';
import { requirePermission } from '@/lib/rbac';
import { invoiceSchema, invoiceFilterSchema } from '@/lib/validations/invoice-schema';
import type {
  ActionResult,
  InvoiceDetailView,
  InvoiceListItem,
  InvoiceParties,
  PaginatedInvoices,
} from '@/types/invoice';

async function getRequestMeta() {
  const headersList = await headers();
  return {
    ipAddress: headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? undefined,
    userAgent: headersList.get('user-agent') ?? undefined,
  };
}

/**
 * Paginated invoices. AR/AP views filter on the indexed direction enum -
 * never on FK-null-ness (ADR 0001 convention).
 */
export async function getInvoices(
  params: Record<string, unknown>
): Promise<ActionResult<PaginatedInvoices>> {
  try {
    await requirePermission(RESOURCES.INVOICES, ACTIONS.VIEW);

    const validated = invoiceFilterSchema.parse(params);
    const { search, direction, status, paymentStatus, page, limit, sortBy, sortOrder } = validated;

    const where: Prisma.InvoiceWhereInput = excludeDeleted<'invoice'>({});

    if (direction) where.direction = direction;
    if (status) where.status = status;
    if (paymentStatus) where.paymentStatus = paymentStatus;
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { externalReference: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const { skip, take } = getPaginationParams({ page, limit });

    const [total, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
        include: {
          client: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
        },
      }),
    ]);

    const data: InvoiceListItem[] = invoices.map((invoice) => {
      const party =
        invoice.direction === InvoiceDirection.SALES ? invoice.client : invoice.supplier;
      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        direction: invoice.direction,
        partyName: party?.name ?? '—',
        partyId: party?.id ?? '',
        externalReference: invoice.externalReference,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        totalAmount: decimalToNumber(invoice.totalAmount),
        paidAmount: decimalToNumber(invoice.paidAmount),
        currency: invoice.currency,
        status: invoice.status,
        paymentStatus: invoice.paymentStatus,
      };
    });

    return { success: true, data: createPaginatedResponse(data, total, { page, limit }) };
  } catch (error) {
    console.error('Failed to get invoices:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch invoices',
    };
  }
}

/**
 * Full invoice detail with items + payments (plain DTO at the boundary).
 */
export async function getInvoiceById(id: string): Promise<ActionResult<InvoiceDetailView>> {
  try {
    await requirePermission(RESOURCES.INVOICES, ACTIONS.VIEW);

    const invoice = await prisma.invoice.findFirst({
      where: excludeDeleted<'invoice'>({ id }),
      include: {
        client: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        items: { include: { service: { select: { serviceNumber: true } } } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    });

    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    const party =
      invoice.direction === InvoiceDirection.SALES
        ? invoice.client && { id: invoice.client.id, name: invoice.client.name, kind: 'client' as const }
        : invoice.supplier && {
            id: invoice.supplier.id,
            name: invoice.supplier.name,
            kind: 'supplier' as const,
          };

    if (!party) {
      // Impossible under the party/direction CHECK; guard for type-safety.
      return { success: false, error: 'Invoice party missing' };
    }

    const totalAmount = decimalToNumber(invoice.totalAmount);
    const paidAmount = decimalToNumber(invoice.paidAmount);

    const data: InvoiceDetailView = {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      direction: invoice.direction,
      externalReference: invoice.externalReference,
      party,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      subtotal: decimalToNumber(invoice.subtotal),
      taxAmount: decimalToNumber(invoice.taxAmount),
      totalAmount,
      paidAmount,
      outstanding: decimalToNumber(round2(toDecimal(totalAmount).minus(paidAmount))),
      irpfRate: invoice.irpfRate ? decimalToNumber(invoice.irpfRate) : null,
      irpfAmount: invoice.irpfAmount ? decimalToNumber(invoice.irpfAmount) : null,
      currency: invoice.currency,
      status: invoice.status,
      paymentStatus: invoice.paymentStatus,
      paidAt: invoice.paidAt,
      sentAt: invoice.sentAt,
      description: invoice.description,
      notes: invoice.notes,
      items: invoice.items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: decimalToNumber(item.quantity),
        unitPrice: decimalToNumber(item.unitPrice),
        amount: decimalToNumber(item.amount),
        taxRate: decimalToNumber(item.taxRate),
        taxAmount: decimalToNumber(item.taxAmount),
        serviceId: item.serviceId,
        serviceNumber: item.service?.serviceNumber ?? null,
      })),
      payments: invoice.payments.map((payment) => ({
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        amount: decimalToNumber(payment.amount),
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        reference: payment.reference,
        status: payment.status,
        notes: payment.notes,
      })),
      createdBy: invoice.createdBy,
      createdAt: invoice.createdAt,
    };

    return { success: true, data };
  } catch (error) {
    console.error('Failed to get invoice:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch invoice',
    };
  }
}

/** Active clients + suppliers for the invoice form selects. */
export async function getInvoiceParties(): Promise<ActionResult<InvoiceParties>> {
  try {
    await requirePermission(RESOURCES.INVOICES, ACTIONS.CREATE);

    const [clients, suppliers] = await Promise.all([
      prisma.client.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.supplier.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return { success: true, data: { clients, suppliers } };
  } catch (error) {
    console.error('Failed to get invoice parties:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch parties',
    };
  }
}

/**
 * Create an invoice (SALES or PURCHASE per ADR 0001).
 *
 * One Serializable transaction: number allocation (INV-/RINV- scope by
 * direction; generateDocumentNumber upserts the scope, so the first SALES
 * invoice on a fresh DB is safe), invoice + items insert, audit row.
 */
export async function createInvoice(data: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission(RESOURCES.INVOICES, ACTIONS.CREATE);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const validated = invoiceSchema.parse(data);
    const { ipAddress, userAgent } = await getRequestMeta();
    const userId = session.user.id;

    // Server-side Decimal math (pricing.ts): amounts are derived, not trusted.
    const items = validated.items.map((item) => {
      const amount = round2(toDecimal(item.quantity).times(item.unitPrice));
      return {
        description: item.description,
        quantity: round2(item.quantity),
        unitPrice: round2(item.unitPrice),
        amount,
        taxRate: round2(item.taxRate),
        taxAmount: vatAmount(amount, item.taxRate),
        serviceId: item.serviceId || null,
      };
    });

    const subtotal = round2(items.reduce((sum, item) => sum.plus(item.amount), ZERO));
    const taxTotal = round2(items.reduce((sum, item) => sum.plus(item.taxAmount), ZERO));
    // Composition CHECK: total = subtotal + tax, exactly.
    const totalAmount = round2(subtotal.plus(taxTotal));

    // IRPF retention (PURCHASE only): informational, computed via pricing.ts.
    const irpfRate =
      validated.direction === 'PURCHASE' && validated.irpfRate != null
        ? round2(validated.irpfRate)
        : null;
    const irpf = irpfRate ? irpfAmount(subtotal, irpfRate) : null;

    const invoice = await withTransaction(
      async (tx) => {
        const invoiceNumber = await generateDocumentNumber(
          tx,
          validated.direction === 'SALES' ? 'INV' : 'RINV'
        );

        const created = await tx.invoice.create({
          data: {
            invoiceNumber,
            direction:
              validated.direction === 'SALES'
                ? InvoiceDirection.SALES
                : InvoiceDirection.PURCHASE,
            invoiceDate: validated.invoiceDate,
            dueDate: validated.dueDate,
            clientId: validated.direction === 'SALES' ? validated.clientId : null,
            supplierId: validated.direction === 'PURCHASE' ? validated.supplierId : null,
            externalReference:
              validated.direction === 'PURCHASE' ? validated.externalReference : null,
            createdById: userId,
            subtotal,
            taxAmount: taxTotal,
            totalAmount,
            currency: validated.currency,
            irpfRate,
            irpfAmount: irpf,
            description: validated.description || null,
            notes: validated.notes || null,
            items: {
              create: items.map((item) => ({
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                amount: item.amount,
                taxRate: item.taxRate,
                taxAmount: item.taxAmount,
                serviceId: item.serviceId,
              })),
            },
          },
        });

        await createAuditLog(
          {
            userId,
            action: 'CREATE',
            tableName: 'invoices',
            recordId: created.id,
            newValues: {
              invoiceNumber,
              direction: validated.direction,
              subtotal: subtotal.toFixed(2),
              taxAmount: taxTotal.toFixed(2),
              totalAmount: totalAmount.toFixed(2),
              items: items.length,
            },
            ipAddress,
            userAgent,
          },
          tx
        );

        return created;
      },
      { isolationLevel: 'Serializable' }
    );

    revalidatePath('/invoices');

    return { success: true, data: { id: invoice.id } };
  } catch (error) {
    console.error('Failed to create invoice:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create invoice',
    };
  }
}

/**
 * Mark an invoice as sent (audit-logged; used by the detail page action).
 */
export async function markInvoiceSent(id: string): Promise<ActionResult> {
  try {
    await requirePermission(RESOURCES.INVOICES, ACTIONS.SEND);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const existing = await prisma.invoice.findFirst({ where: excludeDeleted<'invoice'>({ id }) });
    if (!existing) {
      return { success: false, error: 'Invoice not found' };
    }
    if (existing.status === InvoiceStatus.CANCELLED) {
      return { success: false, error: 'Cannot send a cancelled invoice' };
    }

    const { ipAddress, userAgent } = await getRequestMeta();
    const userId = session.user.id;

    await withTransaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          status: existing.status === InvoiceStatus.PAID ? existing.status : InvoiceStatus.SENT,
          sentAt: existing.sentAt ?? new Date(),
        },
      });
      await createAuditLog(
        {
          userId,
          action: 'UPDATE',
          tableName: 'invoices',
          recordId: id,
          oldValues: { status: existing.status },
          newValues: { status: 'SENT' },
          ipAddress,
          userAgent,
        },
        tx
      );
    });

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${id}`);

    return { success: true };
  } catch (error) {
    console.error('Failed to mark invoice sent:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update invoice',
    };
  }
}

/**
 * Cancel an invoice. Refused once any payment has been recorded - money
 * attached to a document is never silently orphaned. Void the payments
 * first (#31), then cancel.
 */
export async function cancelInvoice(id: string): Promise<ActionResult> {
  try {
    await requirePermission(RESOURCES.INVOICES, ACTIONS.DELETE);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { ipAddress, userAgent } = await getRequestMeta();
    const userId = session.user.id;

    const result = await withTransaction(
      async (tx) => {
        const existing = await tx.invoice.findFirst({
          where: { id, deletedAt: null },
          include: { _count: { select: { payments: true } } },
        });
        if (!existing) {
          return { ok: false as const, error: 'Invoice not found' };
        }
        if (existing.status === InvoiceStatus.CANCELLED) {
          return { ok: false as const, error: 'Invoice is already cancelled' };
        }
        if (toDecimal(existing.paidAmount).greaterThan(0) || existing._count.payments > 0) {
          return {
            ok: false as const,
            error: 'Cannot cancel an invoice with recorded payments. Void the payments first.',
          };
        }

        await tx.invoice.update({
          where: { id },
          data: { status: InvoiceStatus.CANCELLED },
        });
        await createAuditLog(
          {
            userId,
            action: 'CANCEL',
            tableName: 'invoices',
            recordId: id,
            oldValues: { status: existing.status },
            newValues: { status: 'CANCELLED' },
            ipAddress,
            userAgent,
          },
          tx
        );
        return { ok: true as const };
      },
      { isolationLevel: 'Serializable' }
    );

    if (!result.ok) {
      return { success: false, error: result.error };
    }

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${id}`);

    return { success: true };
  } catch (error) {
    console.error('Failed to cancel invoice:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel invoice',
    };
  }
}
