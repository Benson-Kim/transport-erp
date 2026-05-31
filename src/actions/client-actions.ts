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
import { RESOURCES, ACTIONS, Resource, Action } from '@/lib/permissions';
import {
  createAuditLog,
  excludeDeleted,
  getPaginationParams,
  createPaginatedResponse,
  generateUniqueIdentifier,
} from '@/lib/prisma/db-helpers';
import prisma from '@/lib/prisma/prisma';
import { requirePermission } from '@/lib/rbac';
import { clientSchema, clientFilterSchema, ClientFilterInput } from '@/lib/validations/client-schema';
import type {
  ActionResult,
  ClientListItem,
  ClientWithStats,
  ClientStats,
  ClientService,
  PaginatedClients,
  Address,
} from '@/types/client';
import z from 'zod';

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

async function withAction<T>(
  permission: { resource: Resource; action: Action },
  handler: (ctx: { userId: string; ipAddress?: string; userAgent?: string; }) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    await requirePermission(permission.resource, permission.action);

    const session = await getServerAuth();

    if (!session?.user) {
      return { success: false, error: 'Not authenticated' }
    }

    const { ipAddress, userAgent } = await getRequestMeta();

    return await handler({
      userId: session.user.id,
      ...(ipAddress && { ipAddress }),
      ...(userAgent && { userAgent })
    });
  } catch (error) {
    console.error(error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "An unexpected error occurred"
    }
  }
}

// Check for duplicate VAT number if provided
async function validateVATNumber(vatNumber: string | null | undefined, excludeId?: string) {
  if (!vatNumber) return null;

  const existing = await prisma.client.findFirst({
    where: {
      vatNumber,
      deletedAt: null,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });

  if (existing) {
    return {
      success: false,
      error: 'A client with this VAT number already exists',
      errors: { vatNumber: ['VAT number already in use'] },
    };
  }

  return null;
}

// Client data builder for create and update
function buildClientData(validated: z.infer<typeof clientSchema>): Omit<Prisma.ClientCreateInput, 'clientCode'> {
  return {
    name: validated.name,
    tradeName: validated.tradeName ?? null,
    vatNumber: validated.vatNumber ?? null,
    billingAddress: validated.billingAddress,
    shippingAddress: validated.useShippingAddress && validated.shippingAddress ? validated.shippingAddress : Prisma.JsonNull,
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
}

function buildClientFilter(validated: ClientFilterInput): Prisma.ClientWhereInput {
  // Build where clause
  const where: Prisma.ClientWhereInput = excludeDeleted<'client'>({}) ?? {};

  if (validated.search) {
    where.OR = [
      { name: { contains: validated.search, mode: 'insensitive' } },
      { tradeName: { contains: validated.search, mode: 'insensitive' } },
      { vatNumber: { contains: validated.search, mode: 'insensitive' } },
      { billingEmail: { contains: validated.search, mode: 'insensitive' } },
      { clientCode: { contains: validated.search, mode: 'insensitive' } },
    ];
  }

  if (validated.country) {
    where.billingAddress = {
      path: ['country'], equals: validated.country,
    };
  }

  if (validated.isActive !== undefined) {
    where.isActive = validated.isActive;
  }

  if (validated.currency) {
    where.currency = validated.currency;
  }

  if (validated.tags?.length) {
    where.tags = { hasSome: validated.tags };
  }

  return where;

}


/**
 * Get paginated list of clients with filters
 */
export async function getClients(params: Record<string, unknown>): Promise<ActionResult<PaginatedClients>> {
  try {
    await requirePermission(RESOURCES.CLIENTS, ACTIONS.VIEW);

    const validated = clientFilterSchema.parse(params);
    const { page, limit, sortBy, sortOrder } = validated;

    // Build where clause
    const where = buildClientFilter(validated)

    // Get total count and paginated clients
    const [total, clients] = await Promise.all([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        orderBy: sortBy === 'servicesCount' ? { services: { _count: sortOrder } } : { [sortBy || 'name']: sortOrder },
        skip: getPaginationParams({ page, limit }).skip,
        take: getPaginationParams({ page, limit }).take,
        include: {
          _count: {
            select: { services: true },
          },
        },
      }),
    ]);

    // Transform to list items
    const data: ClientListItem[] = clients.map((client) => {
      const billingAddress = client.billingAddress as unknown as Address;
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
      where: excludeDeleted<'client'>({ id }) ?? { id },
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
 * Calculate client statistics
 */
async function calculateClientStats(clientId: string): Promise<ClientStats> {
  const baseWhere = { clientId, deletedAt: null };

  // All counts and aggregates done at the DB level — no in-memory loading
  const [totals, statusCounts, lastService] = await Promise.all([
    prisma.service.aggregate({
      where: baseWhere,
      _sum: { saleAmount: true, costAmount: true, margin: true, marginPercentage: true },
      _count: { id: true },
    }),
    prisma.service.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: { id: true },
    }),
    prisma.service.findFirst({
      where: baseWhere,
      orderBy: { date: 'desc' },
      select: { date: true },
    }),
  ]);

  const totalServices = totals._count.id;

  const statusMap = Object.fromEntries(
    (statusCounts as Array<{ status: ServiceStatus; _count: { id: number } }>).map((s) => [s.status, s._count.id])
  );

  const activeStatuses = [ServiceStatus.DRAFT, ServiceStatus.CONFIRMED, ServiceStatus.IN_PROGRESS];
  const completedStatuses = [ServiceStatus.COMPLETED, ServiceStatus.INVOICED];

  const activeServices = activeStatuses.reduce((sum, s) => sum + (statusMap[s] ?? 0), 0);
  const completedServices = completedStatuses.reduce((sum, s) => sum + (statusMap[s] ?? 0), 0);
  const cancelledServices = statusMap[ServiceStatus.CANCELLED] ?? 0;

  const totalRevenue = Number(totals._sum.saleAmount ?? 0);
  const totalCost = Number(totals._sum.costAmount ?? 0);
  const totalMargin = Number(totals._sum.margin ?? 0);
  const averageMarginPercentage =
    totalServices > 0 ? Number(totals._sum.marginPercentage ?? 0) / totalServices : 0;

  return {
    totalServices,
    activeServices,
    completedServices,
    cancelledServices,
    totalRevenue,
    totalCost,
    totalMargin,
    averageMarginPercentage,
    lastServiceDate: lastService?.date ? new Date(lastService.date) : null,
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
      where.status = params.status as ServiceStatus;
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
  return withAction(

    { resource: RESOURCES.CLIENTS, action: ACTIONS.CREATE },

    async ({ userId, ipAddress, userAgent }) => {
      const validated = clientSchema.parse(data);

      // Check for duplicate VAT number if provided
      const checkVatError = await validateVATNumber(validated.vatNumber);
      if (checkVatError) return checkVatError

      // Generate unique client code
      const clientCode = await generateUniqueIdentifier('CLI', 'client', 'clientCode');

      // Prepare data
      const createData = {
        clientCode,
        ...buildClientData(validated)
      };

      const client = await prisma.client.create({
        data: createData,
      });

      // Create audit log
      await createAuditLog({
        userId,
        action: 'CREATE',
        tableName: 'clients',
        recordId: client.id,
        newValues: createData,
        ... (ipAddress && { ipAddress }),
        ... (userAgent && { userAgent }),
      });

      revalidatePath('/clients');

      return { success: true, data: { id: client.id } };
    }
  )
}

/**
 * Update an existing client
 */
export async function updateClient(id: string, data: unknown): Promise<ActionResult<{ id: string }>> {
  return withAction(
    { resource: RESOURCES.CLIENTS, action: ACTIONS.EDIT },
    async ({ userId, ipAddress, userAgent }) => {

      const validated = clientSchema.parse(data);

      // Check if client exists
      const existing = await prisma.client.findFirst({
        where: excludeDeleted<'client'>({ id }) ?? {},
      });

      if (!existing) {
        return { success: false, error: 'Client not found' };
      }

      // Check for duplicate VAT number if changed
      const checkVatError = await validateVATNumber(validated.vatNumber, id);
      if (checkVatError) return checkVatError

      // Prepare update data
      const updateData = buildClientData(validated);

      const client = await prisma.client.update({
        where: { id },
        data: updateData,
      });

      // Create audit log
      await createAuditLog({
        userId,
        action: 'UPDATE',
        tableName: 'clients',
        recordId: client.id,
        oldValues: existing,
        newValues: updateData,
        ...(ipAddress && { ipAddress }),
        ...(userAgent && { userAgent })
      });

      revalidatePath('/clients');
      revalidatePath(`/clients/${id}`);

      return { success: true, data: { id: client.id } };
    }
  );
}

/**
 * Delete a client (soft delete)
 */
export async function deleteClient(id: string): Promise<ActionResult> {
  return withAction(
    { resource: RESOURCES.CLIENTS, action: ACTIONS.DELETE },
    async ({ userId, ipAddress, userAgent }) => {

      // Check if client exists
      const existing = await prisma.client.findFirst({
        where: excludeDeleted<'client'>({ id }) ?? { id },
        include: {
          _count: {
            select: { services: true },
          },
        },
      });

      if (!existing) {
        return { success: false, error: 'Client not found' };
      }

      // Soft delete
      await prisma.client.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      // Create audit log
      await createAuditLog({
        userId,
        action: 'DELETE',
        tableName: 'clients',
        recordId: id,
        oldValues: existing,
        ...(ipAddress && { ipAddress }),
        ...(userAgent && { userAgent }),
        metadata: { servicesCount: existing._count.services },
      });

      revalidatePath('/clients');

      return { success: true };
    }
  );
}

/**
 * Maximum number of IDs allowed in a single bulk operation.
 */
const MAX_BULK_IDS = 100;

/**
 * Bulk delete clients
 */
export async function bulkDeleteClients(ids: string[]): Promise<ActionResult<{ deleted: number }>> {
  if (ids.length > MAX_BULK_IDS) {
    return { success: false, error: `Cannot process more than ${MAX_BULK_IDS} items at once` };
  }
  return withAction(
    { resource: RESOURCES.CLIENTS, action: ACTIONS.DELETE },
    async ({ userId, ipAddress, userAgent }) => {

      const result = await prisma.client.updateMany({
        where: {
          id: { in: ids },
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });

      // Create audit log for bulk operation
      await createAuditLog({
        userId,
        action: 'DELETE',
        tableName: 'clients',
        recordId: 'bulk',
        metadata: { ids, count: result.count },
        ...(ipAddress && { ipAddress }),
        ...(userAgent && { userAgent })
      });

      revalidatePath('/clients');

      return { success: true, data: { deleted: result.count } };
    }
  )
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
      const address = client.billingAddress as unknown as Address;
      if (address?.country) {
        countries.add(address.country);
      }
    });

    return { success: true, data: Array.from(countries).sort((a, b) => a.localeCompare(b)) };
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

    // Build where clause
    const where = buildClientFilter(validated)

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
      const addr = client.billingAddress as unknown as Address;
      return [
        client.clientCode,
        `"${client.name.replaceAll('"', '""')}"`,
        client.tradeName ? `"${client.tradeName.replaceAll('"', '""')}"` : '',
        client.vatNumber ?? '',
        client.billingEmail,
        client.trafficEmail ?? '',
        client.contactPerson ?? '',
        client.contactPhone ?? '',
        client.contactMobile ?? '',
        addr ? `"${[addr.line1, addr.line2].filter(Boolean).join(', ').replaceAll('"', '""')}"` : '',
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
