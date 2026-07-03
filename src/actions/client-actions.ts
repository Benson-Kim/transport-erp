/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
// /actions/client-actions.ts
'use server';

/**
 * Client Server Actions
 * CRUD operations for client management with audit logging
 */

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { Prisma, ServiceStatus } from '@/app/generated/prisma';
import { getServerAuth } from '@/lib/auth';
import { RESOURCES, ACTIONS } from '@/lib/permissions';
import { decimalToNumber, ZERO } from '@/lib/pricing';
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
import { RECOGNIZED_REVENUE_STATUSES } from '@/lib/revenue';
import { asAddress } from '@/lib/utils/address';
import { clientSchema, clientFilterSchema } from '@/lib/validations/client-schema';
import type {
  ActionResult,
  ClientListItem,
  ClientWithStats,
  ClientStats,
  ClientService,
  PaginatedClients,
} from '@/types/client';

/**
 * Get request metadata for audit logging
 */
async function getRequestMeta() {
  const headersList = await headers();
  return {
    ipAddress: headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? undefined,
    userAgent: headersList.get('user-agent') ?? undefined,
  };
}

/**
 * Get paginated list of clients with filters
 */
export async function getClients(
  params: Record<string, unknown>
): Promise<ActionResult<PaginatedClients>> {
  try {
    await requirePermission(RESOURCES.CLIENTS, ACTIONS.VIEW);

    const validated = clientFilterSchema.parse(params);
    const { search, country, isActive, currency, tags, page, limit, sortBy, sortOrder } = validated;

    // Build where clause
    const where: Prisma.ClientWhereInput = excludeDeleted<'client'>({});

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { tradeName: { contains: search, mode: 'insensitive' } },
        { vatNumber: { contains: search, mode: 'insensitive' } },
        { billingEmail: { contains: search, mode: 'insensitive' } },
        { clientCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (country) {
      // Filter by the indexed, generated billingCountry column (#14).
      where.billingCountry = country;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (currency) {
      where.currency = currency;
    }

    if (tags && tags.length > 0) {
      where.tags = { hasSome: tags };
    }

    // Get total count
    const total = await prisma.client.count({ where });

    // Build orderBy
    let orderBy: Prisma.ClientOrderByWithRelationInput = {};
    if (sortBy === 'servicesCount') {
      orderBy = { services: { _count: sortOrder } };
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    // Get paginated data
    const { skip, take } = getPaginationParams({ page, limit });

    const clients = await prisma.client.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        _count: {
          select: { services: true },
        },
      },
    });

    // Transform to list items
    const data: ClientListItem[] = clients.map((client) => {
      const billingAddress = asAddress(client.billingAddress);
      return {
        id: client.id,
        clientCode: client.clientCode,
        name: client.name,
        tradeName: client.tradeName,
        vatNumber: client.vatNumber,
        billingEmail: client.billingEmail,
        contactPhone: client.contactPhone,
        country: billingAddress?.country ?? '',
        isActive: client.isActive,
        currency: client.currency,
        servicesCount: client._count.services,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
      };
    });

    return {
      success: true,
      data: createPaginatedResponse(data, total, { page, limit }),
    };
  } catch (error) {
    console.error('Failed to get clients:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch clients',
    };
  }
}

/**
 * Get single client by ID with full details and stats
 */
export async function getClientById(id: string): Promise<ActionResult<ClientWithStats>> {
  try {
    await requirePermission(RESOURCES.CLIENTS, ACTIONS.VIEW);

    const client = await prisma.client.findFirst({
      where: excludeDeleted<'client'>({ id }),
      include: {
        company: {
          select: { id: true, legalName: true },
        },
        contacts: {
          orderBy: { isPrimary: 'desc' },
        },
        _count: {
          select: { services: true, documents: true },
        },
      },
    });

    if (!client) {
      return { success: false, error: 'Client not found' };
    }

    // Calculate statistics
    const stats = await calculateClientStats(id);

    return {
      success: true,
      data: { ...client, stats },
    };
  } catch (error) {
    console.error('Failed to get client:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch client',
    };
  }
}

/**
 * Client statistics, aggregated IN the database (#33): status counts via
 * count(), money sums via aggregate over RECOGNIZED_REVENUE_STATUSES - no
 * row streaming, no Number(decimal) float sums in JS. count()/aggregate()
 * instead of groupBy because the $extends(withAccelerate()) client
 * (src/lib/prisma/prisma.ts) collapses groupBy's inferred payload to {}[]
 * (same failure fixed in calculateSupplierStats, !20).
 */
async function calculateClientStats(clientId: string): Promise<ClientStats> {
  const serviceWhere: Prisma.ServiceWhereInput = { clientId, deletedAt: null };

  const countWhere = (statuses: ServiceStatus[]): Prisma.ServiceWhereInput => ({
    ...serviceWhere,
    status: { in: statuses },
  });

  const active = [ServiceStatus.DRAFT, ServiceStatus.CONFIRMED, ServiceStatus.IN_PROGRESS];
  const completed = [ServiceStatus.COMPLETED, ServiceStatus.INVOICED];

  const [
    totalServices,
    activeServices,
    completedServices,
    cancelledServices,
    revenueSums,
    lastService,
  ] = await Promise.all([
    prisma.service.count({ where: serviceWhere }),
    prisma.service.count({ where: countWhere(active) }),
    prisma.service.count({ where: countWhere(completed) }),
    prisma.service.count({ where: countWhere([ServiceStatus.CANCELLED]) }),
    prisma.service.aggregate({
      where: countWhere([...RECOGNIZED_REVENUE_STATUSES]),
      _sum: { saleAmount: true, costAmount: true, margin: true },
      _avg: { marginPercentage: true },
    }),
    prisma.service.findFirst({
      where: serviceWhere,
      orderBy: { date: 'desc' },
      select: { date: true },
    }),
  ]);

  return {
    totalServices,
    activeServices,
    completedServices,
    cancelledServices,
    totalRevenue: decimalToNumber(revenueSums._sum.saleAmount ?? ZERO),
    totalCost: decimalToNumber(revenueSums._sum.costAmount ?? ZERO),
    totalMargin: decimalToNumber(revenueSums._sum.margin ?? ZERO),
    averageMarginPercentage: decimalToNumber(revenueSums._avg.marginPercentage ?? ZERO),
    lastServiceDate: lastService?.date ?? null,
  };
}

/**
 * Get client services for detail view
 */
export async function getClientServices(
  clientId: string,
  params: { page?: number; limit?: number; status?: string }
): Promise<ActionResult<{ data: ClientService[]; total: number }>> {
  try {
    await requirePermission(RESOURCES.CLIENTS, ACTIONS.VIEW);

    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const { skip, take } = getPaginationParams({ page, limit });

    const where: Prisma.ServiceWhereInput = {
      clientId,
      deletedAt: null,
    };

    if (params.status && params.status !== 'all') {
      where.status = params.status as any;
    }

    const [services, total] = await Promise.all([
      prisma.service.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take,
        include: {
          supplier: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.service.count({ where }),
    ]);

    const data: ClientService[] = services.map((service) => ({
      id: service.id,
      serviceNumber: service.serviceNumber,
      date: service.date,
      description: service.description,
      origin: service.origin,
      destination: service.destination,
      supplier: service.supplier,
      costAmount: Number(service.costAmount),
      saleAmount: Number(service.saleAmount),
      margin: Number(service.margin),
      marginPercentage: Number(service.marginPercentage),
      status: service.status,
    }));

    return { success: true, data: { data, total } };
  } catch (error) {
    console.error('Failed to get client services:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch services',
    };
  }
}

/**
 * Create a new client
 */
export async function createClient(data: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission(RESOURCES.CLIENTS, ACTIONS.CREATE);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const validated = clientSchema.parse(data);
    const { ipAddress, userAgent } = await getRequestMeta();

    // Check for duplicate VAT number if provided
    if (validated.vatNumber) {
      const existing = await prisma.client.findFirst({
        where: {
          vatNumber: validated.vatNumber,
          deletedAt: null,
        },
      });

      if (existing) {
        return {
          success: false,
          error: 'A client with this VAT number already exists',
          errors: { vatNumber: ['VAT number already in use'] },
        };
      }
    }

    // Prepare data. The client code is allocated INSIDE the transaction
    // below (#61) so the counter bump and the insert commit - or roll
    // back - together.
    const createData: Omit<Prisma.ClientCreateInput, 'clientCode'> = {
      name: validated.name,
      tradeName: validated.tradeName ?? null,
      vatNumber: validated.vatNumber ?? null,
      billingAddress: validated.billingAddress,
      shippingAddress:
        validated.useShippingAddress && validated.shippingAddress
          ? validated.shippingAddress
          : Prisma.DbNull,
      billingEmail: validated.billingEmail,
      trafficEmail: validated.trafficEmail ?? null,
      contactPerson: validated.contactPerson ?? null,
      contactPhone: validated.contactPhone ?? null,
      contactMobile: validated.contactMobile ?? null,
      creditLimit: validated.creditLimit ?? null,
      paymentTerms: validated.paymentTerms,
      discount: validated.discount ?? null,
      currency: validated.currency,
      language: validated.language,
      sendReminders: validated.sendReminders,
      autoInvoice: validated.autoInvoice,
      notes: validated.notes ?? null,
      tags: validated.tags,
      isActive: validated.isActive,
    };

    // Allocation, insert and audit row in ONE transaction (#61), following
    // the service-actions.ts createService pattern: generateDocumentNumber
    // takes a row lock on the counter, so concurrent creates cannot
    // duplicate codes, and a rollback leaves neither a partial client row
    // nor - allocation being in-tx - a burned number.
    const client = await withTransaction(async (tx) => {
      const clientCode = await generateDocumentNumber(tx, 'CLI');

      const created = await tx.client.create({
        data: { ...createData, clientCode },
      });

      await createAuditLog(
        {
          userId: session.user.id,
          action: 'CREATE',
          tableName: 'clients',
          recordId: created.id,
          newValues: { ...createData, clientCode },
          ipAddress,
          userAgent,
        },
        tx
      );

      return created;
    });

    revalidatePath('/clients');

    return { success: true, data: { id: client.id } };
  } catch (error) {
    console.error('Failed to create client:', error);

    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return {
        success: false,
        error: 'A client with this information already exists',
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create client',
    };
  }
}

/**
 * Update an existing client
 */
export async function updateClient(
  id: string,
  data: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission(RESOURCES.CLIENTS, ACTIONS.EDIT);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check if client exists
    const existing = await prisma.client.findFirst({
      where: excludeDeleted<'client'>({ id }),
    });

    if (!existing) {
      return { success: false, error: 'Client not found' };
    }

    const validated = clientSchema.parse(data);
    const { ipAddress, userAgent } = await getRequestMeta();

    // Check for duplicate VAT number if changed
    if (validated.vatNumber && validated.vatNumber !== existing.vatNumber) {
      const duplicate = await prisma.client.findFirst({
        where: {
          vatNumber: validated.vatNumber,
          deletedAt: null,
          NOT: { id },
        },
      });

      if (duplicate) {
        return {
          success: false,
          error: 'A client with this VAT number already exists',
          errors: { vatNumber: ['VAT number already in use'] },
        };
      }
    }

    // Prepare update data
    const updateData: Prisma.ClientUpdateInput = {
      name: validated.name,
      tradeName: validated.tradeName ?? null,
      vatNumber: validated.vatNumber ?? null,
      billingAddress: validated.billingAddress,
      shippingAddress:
        validated.useShippingAddress && validated.shippingAddress
          ? validated.shippingAddress
          : Prisma.DbNull,
      billingEmail: validated.billingEmail,
      trafficEmail: validated.trafficEmail ?? null,
      contactPerson: validated.contactPerson ?? null,
      contactPhone: validated.contactPhone ?? null,
      contactMobile: validated.contactMobile ?? null,
      creditLimit: validated.creditLimit ?? null,
      paymentTerms: validated.paymentTerms,
      discount: validated.discount ?? null,
      currency: validated.currency,
      language: validated.language,
      sendReminders: validated.sendReminders,
      autoInvoice: validated.autoInvoice,
      notes: validated.notes ?? null,
      tags: validated.tags,
      isActive: validated.isActive,
    };

    const client = await prisma.client.update({
      where: { id },
      data: updateData,
    });

    // Create audit log
    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      tableName: 'clients',
      recordId: client.id,
      oldValues: existing,
      newValues: updateData,
      ipAddress,
      userAgent,
    });

    revalidatePath('/clients');
    revalidatePath(`/clients/${id}`);

    return { success: true, data: { id: client.id } };
  } catch (error) {
    console.error('Failed to update client:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update client',
    };
  }
}

/**
 * Delete a client (soft delete)
 */
export async function deleteClient(id: string): Promise<ActionResult> {
  try {
    await requirePermission(RESOURCES.CLIENTS, ACTIONS.DELETE);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Check if client exists
    const existing = await prisma.client.findFirst({
      where: excludeDeleted<'client'>({ id }),
      include: {
        _count: {
          select: { services: true },
        },
      },
    });

    if (!existing) {
      return { success: false, error: 'Client not found' };
    }

    const { ipAddress, userAgent } = await getRequestMeta();

    // Soft delete
    await prisma.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Create audit log. Minimal before-image (#21): the row still exists
    // (soft delete) - snapshotting it duplicated the whole record,
    // including creditLimit/discount, into audit_logs.
    await createAuditLog({
      userId: session.user.id,
      action: 'DELETE',
      tableName: 'clients',
      recordId: id,
      oldValues: { deletedAt: null },
      newValues: { deletedAt: new Date() },
      ipAddress,
      userAgent,
      metadata: { servicesCount: existing._count.services },
    });

    revalidatePath('/clients');

    return { success: true };
  } catch (error) {
    console.error('Failed to delete client:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete client',
    };
  }
}

/**
 * Bulk delete clients
 */
export async function bulkDeleteClients(ids: string[]): Promise<ActionResult<{ deleted: number }>> {
  try {
    await requirePermission(RESOURCES.CLIENTS, ACTIONS.DELETE);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const { ipAddress, userAgent } = await getRequestMeta();

    const result = await prisma.client.updateMany({
      where: {
        id: { in: ids },
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });

    // Create audit log for bulk operation
    await createAuditLog({
      userId: session.user.id,
      action: 'DELETE',
      tableName: 'clients',
      recordId: 'bulk',
      metadata: { ids, count: result.count },
      ipAddress,
      userAgent,
    });

    revalidatePath('/clients');

    return { success: true, data: { deleted: result.count } };
  } catch (error) {
    console.error('Failed to bulk delete clients:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete clients',
    };
  }
}

/**
 * Check if client has active services
 */
export async function checkClientDependencies(
  id: string
): Promise<ActionResult<{ hasServices: boolean; servicesCount: number }>> {
  try {
    await requirePermission(RESOURCES.CLIENTS, ACTIONS.VIEW);

    const count = await prisma.service.count({
      where: {
        clientId: id,
        deletedAt: null,
        status: { notIn: [ServiceStatus.CANCELLED] },
      },
    });

    return {
      success: true,
      data: { hasServices: count > 0, servicesCount: count },
    };
  } catch (error) {
    console.error('Failed to check dependencies:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check dependencies',
    };
  }
}

/**
 * Get unique countries from clients for filter dropdown
 */
export async function getClientCountries(): Promise<ActionResult<string[]>> {
  try {
    await requirePermission(RESOURCES.CLIENTS, ACTIONS.VIEW);

    const clients = await prisma.client.findMany({
      where: { deletedAt: null },
      select: { billingAddress: true },
      distinct: ['billingAddress'],
    });

    const countries = new Set<string>();
    clients.forEach((client) => {
      const address = asAddress(client.billingAddress);
      if (address?.country) {
        countries.add(address.country);
      }
    });

    return { success: true, data: Array.from(countries).sort() };
  } catch (error) {
    console.error('Failed to get countries:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch countries',
    };
  }
}

/**
 * Export clients to CSV format
 */
export async function exportClients(
  params: Record<string, unknown>
): Promise<ActionResult<{ csv: string; filename: string }>> {
  try {
    await requirePermission(RESOURCES.CLIENTS, ACTIONS.EXPORT);

    const validated = clientFilterSchema.parse({ ...params, limit: 10000 });
    const { search, country, isActive, currency, tags } = validated;

    // Build where clause
    const where: Prisma.ClientWhereInput = excludeDeleted<'client'>({});

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { tradeName: { contains: search, mode: 'insensitive' } },
        { vatNumber: { contains: search, mode: 'insensitive' } },
        { billingEmail: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (country) {
      where.billingAddress = { path: ['country'], equals: country };
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (currency) {
      where.currency = currency;
    }

    if (tags && tags.length > 0) {
      where.tags = { hasSome: tags };
    }

    const clients = await prisma.client.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { services: true } },
      },
    });

    // Generate CSV
    const headers = [
      'Client Code',
      'Name',
      'Trade Name',
      'VAT Number',
      'Billing Email',
      'Traffic Email',
      'Contact Person',
      'Phone',
      'Mobile',
      'Address',
      'City',
      'Postal Code',
      'Country',
      'Currency',
      'Payment Terms',
      'Credit Limit',
      'Discount %',
      'Active',
      'Services Count',
      'Created At',
    ];

    const rows = clients.map((client) => {
      const addr = asAddress(client.billingAddress);
      return [
        client.clientCode,
        `"${client.name.replace(/"/g, '""')}"`,
        client.tradeName ? `"${client.tradeName.replace(/"/g, '""')}"` : '',
        client.vatNumber ?? '',
        client.billingEmail,
        client.trafficEmail ?? '',
        client.contactPerson ?? '',
        client.contactPhone ?? '',
        client.contactMobile ?? '',
        addr ? `"${[addr.line1, addr.line2].filter(Boolean).join(', ').replace(/"/g, '""')}"` : '',
        addr?.city ?? '',
        addr?.postalCode ?? '',
        addr?.country ?? '',
        client.currency,
        client.paymentTerms.toString(),
        client.creditLimit?.toString() ?? '',
        client.discount?.toString() ?? '',
        client.isActive ? 'Yes' : 'No',
        client._count.services.toString(),
        client.createdAt.toISOString().split('T')[0],
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const filename = `clients_export_${new Date().toISOString().split('T')[0]}.csv`;

    return { success: true, data: { csv, filename } };
  } catch (error) {
    console.error('Failed to export clients:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export clients',
    };
  }
}
