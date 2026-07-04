/* eslint-disable max-lines */
// src/actions/invoice-actions.ts
'use server';

/**
 * Invoice Server Actions (#30, ADR 0001)
 *
 * CRUD for the billing vertical: SALES invoices issued to clients (revenue)
 * and PURCHASE invoices received from suppliers (cost). paidAmount is
 * DERIVED from Payment rows inside a Serializable transaction - never set
 * independently by two writers.
 *
 * Quality bar: Clients/Suppliers reference (typed Prisma inputs, gated
 * actions, SQL-side aggregation, decimalToNumber only at the DTO boundary).
 */

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import {
  DocumentType,
  InvoiceDirection,
  InvoiceStatus,
  ServiceStatus,
  type Prisma,
} from '@/app/generated/prisma';
import { getServerAuth } from '@/lib/auth';
import {
  buildInvoiceItems,
  computeInvoiceTotals,
  invoiceNumberPrefix,
  recomputeInvoicePaymentState,
} from '@/lib/invoices';
import { RESOURCES, ACTIONS } from '@/lib/permissions';
import { decimalToNumber, toDecimal } from '@/lib/pricing';
import {
  createAuditLog,
  createPaginatedResponse,
  excludeDeleted,
  getPaginationParams,
  withTransaction,
} from '@/lib/prisma/db-helpers';
import { generateDocumentNumber } from '@/lib/prisma/numbering';
import prisma from '@/lib/prisma/prisma';
import { requirePermission } from '@/lib/rbac';
import {
  createInvoiceSchema,
  invoiceableServicesSchema,
  invoiceFilterSchema,
} from '@/lib/validations/invoice-schema';
import type {
  ActionResult,
  InvoiceDetail,
  InvoiceListItem,
  InvoiceableService,
  InvoicePartyOption,
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
 * Paginated invoice list with direction/status filters.
 * Party name is resolved from the correct FK per direction.
 */
export async function getInvoices(
  params: Record<string, unknown>
): Promise<ActionResult<PaginatedInvoices>> {
  try {
    await requirePermission(RESOURCES.INVOICES, ACTIONS.VIEW);

    const { search, direction, status, page, limit, sortBy, sortOrder } =
      invoiceFilterSchema.parse(params);

    const where: Prisma.InvoiceWhereInput = excludeDeleted<'invoice'>({});

    if (direction) where.direction = direction;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { externalReference: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const { skip, take } = getPaginationParams({ page, limit });

    const [total, rows] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
        include: {
          client: { select: { id: true, name: true } },
          supplier: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    const data: InvoiceListItem[] = rows.map((row) => ({
      id: row.id,
      invoiceNumber: row.invoiceNumber,
      direction: row.direction,
      externalReference: row.externalReference,
      partyName:
        row.direction === InvoiceDirection.SALES
          ? (row.client?.name ?? '—')
          : (row.supplier?.name ?? '—'),
      invoiceDate: row.invoiceDate,
      dueDate: row.dueDate,
      status: row.status,
      paymentStatus: row.paymentStatus,
      totalAmount: decimalToNumber(row.totalAmount),
      paidAmount: decimalToNumber(row.paidAmount),
      currency: row.currency,
      itemsCount: row._count.items,
    }));

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
 * Full invoice detail with items and payments.
 * remainingAmount is derived server-side (Decimal subtraction, then
 * decimalToNumber at the DTO boundary).
 */
export async function getInvoiceById(id: string): Promise<ActionResult<InvoiceDetail>> {
  try {
    await requirePermission(RESOURCES.INVOICES, ACTIONS.VIEW);

    const invoice = await prisma.invoice.findFirst({
      where: excludeDeleted<'invoice'>({ id }),
      include: {
        client: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        items: {
          include: { service: { select: { serviceNumber: true } } },
          orderBy: { id: 'asc' },
        },
        payments: { orderBy: { paymentDate: 'asc' } },
      },
    });

    if (!invoice) {
      return { success: false, error: 'Invoice not found' };
    }

    const party =
      invoice.direction === InvoiceDirection.SALES
        ? invoice.client
          ? { id: invoice.client.id, name: invoice.client.name, type: 'client' as const }
          : null
        : invoice.supplier
          ? { id: invoice.supplier.id, name: invoice.supplier.name, type: 'supplier' as const }
          : null;

    if (!party) {
      return { success: false, error: 'Invoice party not found' };
    }

    const remaining = toDecimal(invoice.totalAmount).minus(toDecimal(invoice.paidAmount));

    // Live Document row for the stored invoice PDF (#34): generation
    // supersedes the previous rows, so at most one is live per invoice.
    const pdfDocument = await prisma.document.findFirst({
      where: {
        documentType: DocumentType.INVOICE,
        documentNumber: invoice.invoiceNumber,
        deletedAt: null,
      },
      select: { id: true },
    });

    const detail: InvoiceDetail = {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      direction: invoice.direction,
      externalReference: invoice.externalReference,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      paymentStatus: invoice.paymentStatus,
      subtotal: decimalToNumber(invoice.subtotal),
      taxAmount: decimalToNumber(invoice.taxAmount),
      irpfRate: invoice.irpfRate ? decimalToNumber(invoice.irpfRate) : null,
      irpfAmount: invoice.irpfAmount ? decimalToNumber(invoice.irpfAmount) : null,
      totalAmount: decimalToNumber(invoice.totalAmount),
      paidAmount: decimalToNumber(invoice.paidAmount),
      remainingAmount: decimalToNumber(remaining),
      paidAt: invoice.paidAt,
      currency: invoice.currency,
      description: invoice.description,
      notes: invoice.notes,
      sentAt: invoice.sentAt,
      party,
      createdByName: invoice.createdBy.name,
      createdAt: invoice.createdAt,
      pdfDocumentId: pdfDocument?.id ?? null,
      items: invoice.items.map((item) => ({
        id: item.id,
        description: item.description,
        serviceId: item.serviceId,
        serviceNumber: item.service?.serviceNumber ?? null,
        quantity: decimalToNumber(item.quantity),
        unitPrice: decimalToNumber(item.unitPrice),
        amount: decimalToNumber(item.amount),
        taxRate: decimalToNumber(item.taxRate),
        taxAmount: decimalToNumber(item.taxAmount),
      })),
      payments: invoice.payments.map((payment) => ({
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        amount: decimalToNumber(payment.amount),
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        reference: payment.reference,
        status: payment.status,
      })),
    };

    return { success: true, data: detail };
  } catch (error) {
    console.error('Failed to get invoice:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch invoice',
    };
  }
}

/**
 * Services eligible for invoicing per direction and party:
 * - SALES: COMPLETED services for the chosen client (not yet INVOICED).
 * - PURCHASE: COMPLETED or INVOICED services for the chosen supplier
 *   (a supplier invoice may cover already-invoiced services on the cost side).
 * Returns the net amount per direction (saleAmount for SALES, costAmount
 * for PURCHASE) so the create form can preview totals.
 */
export async function getInvoiceableServices(
  params: Record<string, unknown>
): Promise<ActionResult<InvoiceableService[]>> {
  try {
    await requirePermission(RESOURCES.INVOICES, ACTIONS.CREATE);

    const { direction, partyId } = invoiceableServicesSchema.parse(params);

    const where: Prisma.ServiceWhereInput = {
      deletedAt: null,
      // Double-billing guard: a service already covered by a live invoice
      // of the same direction is not offered again. Relation-based (not
      // status-based) so soft-deleting a draft invoice frees its services.
      invoiceItems: { none: { invoice: { direction, deletedAt: null } } },
      ...(direction === InvoiceDirection.SALES
        ? {
            clientId: partyId,
            status: ServiceStatus.COMPLETED,
          }
        : {
            supplierId: partyId,
            status: { in: [ServiceStatus.COMPLETED, ServiceStatus.INVOICED] },
          }),
    };

    const services = await prisma.service.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 100,
      select: {
        id: true,
        serviceNumber: true,
        date: true,
        description: true,
        origin: true,
        destination: true,
        status: true,
        saleAmount: true,
        costAmount: true,
      },
    });

    const data: InvoiceableService[] = services.map((service) => ({
      id: service.id,
      serviceNumber: service.serviceNumber,
      date: service.date,
      description: service.description,
      origin: service.origin,
      destination: service.destination,
      status: service.status,
      amount: decimalToNumber(
        direction === InvoiceDirection.SALES ? service.saleAmount : service.costAmount
      ),
    }));

    return { success: true, data };
  } catch (error) {
    console.error('Failed to get invoiceable services:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch services',
    };
  }
}

/**
 * Party options for the create-invoice direction selector.
 * Capped at 100 live rows; #47 replaces with a server-side searchable
 * selector once the scalability phase lands.
 */
export async function getInvoiceParties(
  direction: InvoiceDirection
): Promise<ActionResult<InvoicePartyOption[]>> {
  try {
    await requirePermission(RESOURCES.INVOICES, ACTIONS.CREATE);

    if (direction === InvoiceDirection.SALES) {
      const clients = await prisma.client.findMany({
        where: { deletedAt: null, isActive: true },
        orderBy: { name: 'asc' },
        take: 100,
        select: { id: true, name: true },
      });
      return { success: true, data: clients };
    }

    const suppliers = await prisma.supplier.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: 'asc' },
      take: 100,
      select: { id: true, name: true },
    });
    return { success: true, data: suppliers };
  } catch (error) {
    console.error('Failed to get invoice parties:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch parties',
    };
  }
}

/**
 * Create an invoice.
 *
 * The entire operation runs in ONE Serializable transaction:
 * 1. generateDocumentNumber(tx, prefix) - atomic counter bump (#12/#61).
 * 2. tx.invoice.create with items nested.
 * 3. recomputeInvoicePaymentState(tx, id) - sets paidAmount = 0 atomically
 *    (the invariant holds from the first write).
 * 4. createAuditLog(tx) - audit row commits with the mutation (#27).
 *
 * The XOR party constraint (invoices_party_matches_direction CHECK, !19)
 * is enforced at the DB level; the action sets exactly one FK.
 */
export async function createInvoice(
  data: unknown
): Promise<ActionResult<{ id: string; invoiceNumber: string }>> {
  try {
    await requirePermission(RESOURCES.INVOICES, ACTIONS.CREATE);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const validated = createInvoiceSchema.parse(data);
    const { ipAddress, userAgent } = await getRequestMeta();
    const userId = session.user.id;

    // Verify the party exists and is live before entering the transaction.
    if (validated.direction === InvoiceDirection.SALES) {
      const client = await prisma.client.findFirst({
        where: { id: validated.partyId, deletedAt: null },
        select: { id: true },
      });
      if (!client) return { success: false, error: 'Client not found' };
    } else {
      const supplier = await prisma.supplier.findFirst({
        where: { id: validated.partyId, deletedAt: null },
        select: { id: true },
      });
      if (!supplier) return { success: false, error: 'Supplier not found' };
    }

    // Fetch the selected services to compute line amounts. The where
    // clause re-enforces exactly what getInvoiceableServices offers -
    // party ownership, an invoiceable status per direction, and no live
    // invoice of the same direction already covering the service - the UI
    // list is a convenience, never the validation.
    const services = await prisma.service.findMany({
      where: {
        id: { in: validated.serviceIds },
        deletedAt: null,
        invoiceItems: {
          none: { invoice: { direction: validated.direction, deletedAt: null } },
        },
        ...(validated.direction === InvoiceDirection.SALES
          ? { clientId: validated.partyId, status: ServiceStatus.COMPLETED }
          : {
              supplierId: validated.partyId,
              status: { in: [ServiceStatus.COMPLETED, ServiceStatus.INVOICED] },
            }),
      },
      select: {
        id: true,
        serviceNumber: true,
        description: true,
        saleAmount: true,
        costAmount: true,
      },
    });

    if (services.length !== validated.serviceIds.length) {
      return {
        success: false,
        error: 'One or more selected services are not eligible for this invoice',
      };
    }

    const lines = services.map((service) => ({
      serviceId: service.id,
      description: service.description,
      amount:
        validated.direction === InvoiceDirection.SALES ? service.saleAmount : service.costAmount,
    }));

    const totals = computeInvoiceTotals(
      lines.map((line) => line.amount),
      validated.vatRatePoints,
      validated.irpfRatePoints
    );

    const items = buildInvoiceItems(lines, validated.vatRatePoints);

    const now = new Date();
    const invoiceDate = validated.invoiceDate ?? now;
    const dueDate = validated.dueDate ?? new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    const result = await withTransaction(
      async (tx) => {
        const prefix = invoiceNumberPrefix(validated.direction);
        const invoiceNumber = await generateDocumentNumber(tx, prefix);

        const createData: Prisma.InvoiceCreateInput = {
          invoiceNumber,
          direction: validated.direction,
          externalReference: validated.externalReference ?? null,
          invoiceDate,
          dueDate,
          ...(validated.direction === InvoiceDirection.SALES
            ? { client: { connect: { id: validated.partyId } } }
            : { supplier: { connect: { id: validated.partyId } } }),
          createdBy: { connect: { id: userId } },
          subtotal: totals.subtotal.toFixed(2),
          taxAmount: totals.taxAmount.toFixed(2),
          totalAmount: totals.totalAmount.toFixed(2),
          irpfRate: totals.irpfRate?.toFixed(2) ?? null,
          irpfAmount: totals.irpfAmount?.toFixed(2) ?? null,
          currency: 'EUR',
          status: InvoiceStatus.DRAFT,
          description: validated.description ?? null,
          notes: validated.notes ?? null,
          items: { create: items },
        };

        const invoice = await tx.invoice.create({ data: createData });

        // Initialise paidAmount = 0 atomically via the single writer.
        await recomputeInvoicePaymentState(tx, invoice.id);

        await createAuditLog(
          {
            userId,
            action: 'CREATE',
            tableName: 'invoices',
            recordId: invoice.id,
            newValues: {
              invoiceNumber,
              direction: validated.direction,
              partyId: validated.partyId,
              serviceIds: validated.serviceIds,
            },
            ipAddress,
            userAgent,
          },
          tx
        );

        return { id: invoice.id, invoiceNumber };
      },
      { isolationLevel: 'Serializable' }
    );

    revalidatePath('/invoices');

    return { success: true, data: result };
  } catch (error) {
    console.error('Failed to create invoice:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create invoice',
    };
  }
}

/**
 * Transition an invoice from DRAFT to SENT.
 * Only DRAFT invoices may be sent; the status machine is intentionally
 * simple here - a full state machine is Phase 5+ scope.
 */
export async function updateInvoiceStatus(
  id: string,
  newStatus: InvoiceStatus
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission(RESOURCES.INVOICES, ACTIONS.EDIT);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const existing = await prisma.invoice.findFirst({
      where: excludeDeleted<'invoice'>({ id }),
    });
    if (!existing) {
      return { success: false, error: 'Invoice not found' };
    }

    if (newStatus === InvoiceStatus.SENT && existing.status !== InvoiceStatus.DRAFT) {
      return { success: false, error: 'Only draft invoices can be sent' };
    }

    const { ipAddress, userAgent } = await getRequestMeta();
    const userId = session.user.id;

    await withTransaction(async (tx) => {
      await tx.invoice.update({
        where: { id },
        data: {
          status: newStatus,
          ...(newStatus === InvoiceStatus.SENT ? { sentAt: new Date() } : {}),
        },
      });

      await createAuditLog(
        {
          userId,
          action: 'UPDATE',
          tableName: 'invoices',
          recordId: id,
          oldValues: { status: existing.status },
          newValues: { status: newStatus },
          ipAddress,
          userAgent,
        },
        tx
      );
    });

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${id}`);

    return { success: true, data: { id } };
  } catch (error) {
    console.error('Failed to update invoice status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update invoice status',
    };
  }
}

/**
 * Soft-delete an invoice. Refused on PAID or SENT invoices - a financial
 * document that has been issued or settled must not disappear.
 */
export async function deleteInvoice(id: string): Promise<ActionResult> {
  try {
    await requirePermission(RESOURCES.INVOICES, ACTIONS.DELETE);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const existing = await prisma.invoice.findFirst({
      where: excludeDeleted<'invoice'>({ id }),
      include: { _count: { select: { payments: true } } },
    });
    if (!existing) {
      return { success: false, error: 'Invoice not found' };
    }

    if (
      existing.status === InvoiceStatus.PAID ||
      existing.status === InvoiceStatus.SENT ||
      existing._count.payments > 0
    ) {
      return {
        success: false,
        error: 'Cannot delete an invoice that has been sent or has payments recorded',
      };
    }

    const { ipAddress, userAgent } = await getRequestMeta();
    const userId = session.user.id;

    await withTransaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
      await createAuditLog(
        {
          userId,
          action: 'DELETE',
          tableName: 'invoices',
          recordId: id,
          oldValues: { status: existing.status, invoiceNumber: existing.invoiceNumber },
          ipAddress,
          userAgent,
        },
        tx
      );
    });

    revalidatePath('/invoices');

    return { success: true };
  } catch (error) {
    console.error('Failed to delete invoice:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete invoice',
    };
  }
}
