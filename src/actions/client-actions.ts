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

import type { Prisma } from '@/app/generated/prisma';
import { ServiceStatus } from '@/app/generated/prisma';
import { getServerAuth } from '@/lib/auth';
import { RESOURCES, ACTIONS } from '@/lib/permissions';
import {
  createAuditLog,
  excludeDeleted,
  getPaginationParams,
  createPaginatedResponse,
  generateUniqueIdentifier,
} from '@/lib/prisma/db-helpers';
import prisma from '@/lib/prisma/prisma';
import { requirePermission } from '@/lib/rbac';
import { clientSchema, clientFilterSchema } from '@/lib/validations/client-schema';
import type {
  ActionResult,
  ClientListItem,
  ClientWithStats,
  ClientStats,
  ClientService,
  PaginatedClients,
  Address,
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
      // Filter by country in billingAddress JSON
      where.billingAddress = {
        path: ['country'],
        equals: country,
      };
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
      const billingAddress = client.billingAddress as Address;
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
 * Calculate client statistics
 */
async function calculateClientStats(clientId: string): Promise<ClientStats> {
  const services = await prisma.service.findMany({
    where: {
      clientId,
      deletedAt: null,
    },
    select: {
      status: true,
      saleAmount: true,
      costAmount: true,
      margin: true,
      marginPercentage: true,
      date: true,
    },
    orderBy: { date: 'desc' },
  });

  const totalServices = services.length;
  const activeServices = services.filter(
    (s) =>
      s.status === ServiceStatus.DRAFT ||
      s.status === ServiceStatus.CONFIRMED ||
      s.status === ServiceStatus.IN_PROGRESS
  ).length;
  const completedServices = services.filter(
    (s) => s.status === ServiceStatus.COMPLETED || s.status === ServiceStatus.INVOICED
  ).length;
  const cancelledServices = services.filter((s) => s.status === ServiceStatus.CANCELLED).length;

  const totalRevenue = services.reduce((sum, s) => sum + Number(s.saleAmount), 0);
  const totalCost = services.reduce((sum, s) => sum + Number(s.costAmount), 0);
  const totalMargin = services.reduce((sum, s) => sum + Number(s.margin), 0);

  const averageMarginPercentage =
    totalServices > 0
      ? services.reduce((sum, s) => sum + Number(s.marginPercentage), 0) / totalServices
      : 0;

  const lastServiceDate = services.length > 0 ? services[0].date : null;

  return {
    totalServices,
    activeServices,
    completedServices,
    cancelledServices,
    totalRevenue,
    totalCost,
    totalMargin,
    averageMarginPercentage,
    lastServiceDate,
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

    // Generate unique client code
    const clientCode = await generateUniqueIdentifier('CLI', 'client', 'clientCode');

    // Prepare data
    const createData: Prisma.ClientCreateInput = {
      clientCode,
      name: validated.name,
      tradeName: validated.tradeName ?? null,
      vatNumber: validated.vatNumber ?? null,
      billingAddress: validated.billingAddress,
      shippingAddress: validated.useShippingAddress ? validated.shippingAddress : null,
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

    const client = await prisma.client.create({
      data: createData,
    });

    // Create audit log
    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      tableName: 'clients',
      recordId: client.id,
      newValues: createData,
      ipAddress,
      userAgent,
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
      shippingAddress: validated.useShippingAddress ? validated.shippingAddress : null,
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

    // Create audit log
    await createAuditLog({
      userId: session.user.id,
      action: 'DELETE',
      tableName: 'clients',
      recordId: id,
      oldValues: existing,
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
      const address = client.billingAddress as Address;
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
      const addr = client.billingAddress as Address;
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
