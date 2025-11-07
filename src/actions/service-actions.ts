/**
 * Service Server Actions
 * CRUD operations for services
 */

'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { Prisma, ServiceStatus } from '@prisma/client';
import { ServiceFilters, serviceSchema } from '@/lib/validations/service-schema';
import  prisma from '@/lib/prisma/prisma';
import { createAuditLog } from '@/lib/prisma/db-helpers';

/**
 * Get services with filters
 */
export async function getServices(filters: ServiceFilters) {
  await requirePermission('services', 'view');
  
  const where: any = {
    deletedAt: null,
  };

  // Apply filters
  if (filters.search) {
    where.OR = [
      { serviceNumber: { contains: filters.search, mode: 'insensitive' } },
      { client: { name: { contains: filters.search, mode: 'insensitive' } } },
      { driverName: { contains: filters.search, mode: 'insensitive' } },
      { vehiclePlate: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters.dateFrom) {
    where.date = { ...where.date, gte: new Date(filters.dateFrom) };
  }

  if (filters.dateTo) {
    where.date = { ...where.date, lte: new Date(filters.dateTo) };
  }

  if (filters.status) {
    where.status = filters.status as ServiceStatus;
  }

  if (filters.clientId) {
    where.clientId = filters.clientId;
  }

  if (filters.supplierId) {
    where.supplierId = filters.supplierId;
  }

  if (filters.driver) {
    where.driverName = { contains: filters.driver, mode: 'insensitive' };
  }

  // Pagination
  const skip = ((filters.page || 1) - 1) * (filters.pageSize || 50);
  const take = filters.pageSize || 50;

  // Sorting
  const sortKeyMap: Record<
    string,
    keyof Prisma.ServiceOrderByWithRelationInput | { [key: string]: any }
  > = {
    driver: 'driverName',
    client: { client: { name: filters.sortOrder || 'asc' } },
    supplier: { supplier: { name: filters.sortOrder || 'asc' } },
    clientCode: { client: { clientCode: filters.sortOrder || 'asc' } },
    supplierCode: { supplier: { supplierCode: filters.sortOrder || 'asc' } },
    date: 'date',
    margin: 'margin',
    cost: 'costAmount',
    sale: 'saleAmount',
    marginPercentage: 'marginPercentage',
    status: 'status',
    serviceNumber: 'serviceNumber',
    createdAt: 'createdAt',
  };

  let orderBy: Prisma.ServiceOrderByWithRelationInput | Prisma.ServiceOrderByWithRelationInput[];

  const sortByKey = filters.sortBy ?? 'date';
  const sortOrder = filters.sortOrder ?? 'desc';
  const mapped = sortKeyMap[sortByKey];

  if (!mapped) {
    orderBy = { date: 'desc' };
  } else if (typeof mapped === 'string') {
    orderBy = { [mapped]: sortOrder };
  } else {
    orderBy = mapped;
  }

  // Fetch data
  const [services, total] = await Promise.all([
    prisma.service.findMany({
      where,
      include: {
        client: {
          select: {
            id: true,
            name: true,
            clientCode: true,
          },
        },
        supplier: {
          select: {
            id: true,
            name: true,
            supplierCode: true,
          },
        },
      },
      orderBy,
      skip,
      take,
    }),
    prisma.service.count({ where }),
  ]);

  // Format services for frontend
  const formattedServices = services.map((service) => ({
    id: service.id,
    serviceNumber: service.serviceNumber,
    date: service.date.toISOString(),
    clientId: service.clientId,
    clientName: service.client.name,
    clientCode: service.client.clientCode,
    supplierId: service.supplierId,
    supplierName: service.supplier.name,
    supplierCode: service.supplier.supplierCode,
    driverName: service.driverName,
    vehiclePlate: service.vehiclePlate,
    origin: service.origin,
    destination: service.destination,
    costAmount: Number(service.costAmount),
    saleAmount: Number(service.saleAmount),
    margin: Number(service.margin),
    marginPercentage: Number(service.marginPercentage),
    status: service.status,
  }));

  return {
    services: formattedServices,
    total,
  };
}

/**
 * Get clients and suppliers for filters
 */
export async function getClientsAndSuppliers() {
  await requirePermission('services', 'view');
  
  const [clients, suppliers] = await Promise.all([
    prisma.client.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        clientCode: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.supplier.findMany({
      where: { deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        supplierCode: true,
      },
      orderBy: { name: 'asc' },
    }),
  ]);

  return { clients, suppliers };
}

/**
 * Create new service
 */
export async function createService(data: z.infer<typeof serviceSchema>) {
  const session = await requireAuth();
  await requirePermission('services', 'create');
  
  const validatedData = serviceSchema.parse(data);
  
  // Generate service number
  const count = await prisma.service.count();
  const serviceNumber = `SRV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
  
  // Calculate margins
  const margin = validatedData.saleAmount - validatedData.costAmount;
  const marginPercentage = (margin / validatedData.costAmount) * 100;
  
  const service = await prisma.service.create({
    data: {
      ...validatedData,
      serviceNumber,
      margin,
      marginPercentage,
      createdById: session.user.id,
    },
  });
  
  // Create audit log
  await createAuditLog({
    userId: session.user.id,
    action: 'CREATE',
    tableName: 'services',
    recordId: service.id,
    newValues: service,
  });
  
  revalidatePath('/services');
  
  return { success: true, service };
}

/**
 * Update service
 */
export async function updateService(
  serviceId: string,
  data: z.infer<typeof serviceSchema>
) {
  const session = await requireAuth();
  await requirePermission('services', 'edit');
  
  const validatedData = serviceSchema.parse(data);
  
  // Get current service
  const currentService = await prisma.service.findUnique({
    where: { id: serviceId },
  });
  
  if (!currentService) {
    throw new Error('Service not found');
  }
  
  // Check if service is completed and user can't edit completed
  if (
    currentService.status === ServiceStatus.COMPLETED &&
    !(await requirePermission('services', 'edit_completed'))
  ) {
    throw new Error('Cannot edit completed services');
  }
  
  // Recalculate margins
  const margin = validatedData.saleAmount - validatedData.costAmount;
  const marginPercentage = (margin / validatedData.costAmount) * 100;
  
  const service = await prisma.service.update({
    where: { id: serviceId },
    data: {
      ...validatedData,
      margin,
      marginPercentage,
    },
  });
  
  // Create audit log
  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    tableName: 'services',
    recordId: serviceId,
    oldValues: currentService,
    newValues: service,
  });
  
  revalidatePath('/services');
  revalidatePath(`/services/${serviceId}`);
  
  return { success: true, service };
}

/**
 * Delete service (soft delete)
 */
export async function deleteService(serviceId: string) {
  const session = await requireAuth();
  await requirePermission('services', 'delete');
  
  await prisma.service.update({
    where: { id: serviceId },
    data: { deletedAt: new Date() },
  });
  
  // Create audit log
  await createAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    tableName: 'services',
    recordId: serviceId,
  });
  
  revalidatePath('/services');
  
  return { success: true };
}

/**
 * Bulk update services
 */
export async function bulkUpdateServices(
  serviceIds: string[],
  updates: Partial<{ status: ServiceStatus }>
) {
  const session = await requireAuth();
  await requirePermission('services', 'edit');
  
  await prisma.service.updateMany({
    where: {
      id: { in: serviceIds },
      deletedAt: null,
    },
    data: updates,
  });
  
  // Create audit log
  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    tableName: 'services',
    recordId: serviceIds.join(','),
    metadata: { bulk: true, updates },
  });
  
  revalidatePath('/services');
  
  return { success: true };
}

/**
 * Bulk delete services
 */
export async function bulkDeleteServices(serviceIds: string[]) {
  const session = await requireAuth();
  await requirePermission('services', 'delete');
  
  await prisma.service.updateMany({
    where: {
      id: { in: serviceIds },
    },
    data: { deletedAt: new Date() },
  });
  
  // Create audit log
  await createAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    tableName: 'services',
    recordId: serviceIds.join(','),
    metadata: { bulk: true },
  });
  
  revalidatePath('/services');
  
  return { success: true };
}

/**
 * Generate bulk loading orders
 */
export async function generateBulkLoadingOrders(serviceIds: string[]) {
  const session = await requireAuth();
  await requirePermission('loading_orders', 'create');
  
  // Implementation for generating loading orders
  // This would group services and create loading order documents
  
  return { success: true, count: 1 };
}