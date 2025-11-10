/**
 * Service Server Actions
 * CRUD operations for services
 */

'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { ServiceStatus, DocumentType, Prisma } from '@/app/generated/prisma';

import { ServiceFilters, ServiceFormData, serviceSchema } from '@/lib/validations/service-schema';
import prisma from '@/lib/prisma/prisma';
import { createAuditLog } from '@/lib/prisma/db-helpers';

/**
 * Get a single service by ID
 */
export async function getService(serviceId: string) {
  await requirePermission('services', 'view');

  const service = await prisma.service.findFirst({
    where: { id: serviceId, deletedAt: null },
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
  });

  if (!service) {
    return null;
  }

  return {
    ...service,
    date: service.date.toISOString(),
    costAmount: Number(service.costAmount),
    saleAmount: Number(service.saleAmount || 0),
    margin: Number(service.margin || 0),
    marginPercentage: Number(service.marginPercentage || 0),
  };
}

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
export async function createService(data: ServiceFormData) {
  const session = await requireAuth();
  await requirePermission('services', 'create');

  const validatedData = serviceSchema.parse(data);

  // Generate service number
  const count = await prisma.service.count();
  const serviceNumber = `SRV-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;

  const costVatRate = validatedData.costVatRate ?? 21;
  const saleVatRate = validatedData.saleVatRate ?? 21;

  const margin = Number((validatedData.saleAmount - validatedData.costAmount).toFixed(2));
  const marginPercentage = validatedData.saleAmount > 0
    ? Number(((margin / validatedData.saleAmount) * 100).toFixed(2))
    : 0;

  const saleVatAmount = Number((validatedData.saleAmount * (saleVatRate / 100)).toFixed(2));
  const costVatAmount = Number((validatedData.costAmount * (costVatRate / 100)).toFixed(2));

  const {
    completed,
    cancelled,
    totalCost,
    sale,
    kilometers,
    pricePerKm,
    extras,
    ...saveData
  } = validatedData;

  const service = await prisma.service.create({
    data: {
      ...(Object.fromEntries(Object.entries(saveData).filter(([_, v]) => v !== undefined)) as any),
      serviceNumber,
      margin,
      marginPercentage,
      costVatAmount,
      saleVatAmount,
      status: cancelled ? ServiceStatus.CANCELLED :
        completed ? ServiceStatus.COMPLETED :
          saveData.status || ServiceStatus.DRAFT,
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

  return { success: true, service: { ...service, serviceNumber } };
}

/**
 * Update service
 */
export async function updateService(serviceId: string, data: ServiceFormData) {
  const session = await requireAuth();
  await requirePermission('services', 'edit');

  const validatedData = serviceSchema.parse(data);

  const currentService = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!currentService) throw new Error('Service not found');

  if (currentService.status === ServiceStatus.COMPLETED) {
    await requirePermission('services', 'edit_completed');
  }

  const costVatRate = validatedData.costVatRate ?? 21;
  const saleVatRate = validatedData.saleVatRate ?? 21;

  let costAmount = validatedData.costAmount;
  let saleAmount = validatedData.saleAmount;
  let margin = saleAmount - costAmount;
  let marginPercentage = saleAmount > 0 ? (margin / saleAmount) * 100 : 0;
  let saleVatAmount = saleAmount * (saleVatRate / 100);
  let costVatAmount = costAmount * (costVatRate / 100);

  if (validatedData.cancelled) {
    costVatAmount = saleVatAmount = costAmount = saleAmount = margin = marginPercentage = 0;
  }

  const {
    completed,
    cancelled,
    totalCost,
    sale,
    kilometers,
    pricePerKm,
    extras,
    ...dataToStore
  } = validatedData;

  const updateData = {
    ...(Object.fromEntries(Object.entries(dataToStore).filter(([_, v]) => v !== undefined)) as any),
    costAmount,
    saleAmount,
    margin: Number(margin.toFixed(2)),
    marginPercentage: Number(marginPercentage.toFixed(2)),
    costVatAmount: Number(costVatAmount.toFixed(2)),
    saleVatAmount: Number(saleVatAmount.toFixed(2)),
    status: cancelled ? ServiceStatus.CANCELLED :
      completed ? ServiceStatus.COMPLETED :
        dataToStore.status || currentService.status,
    ...(completed ? { completedAt: new Date() } : {}),
    ...(cancelled ? { cancelledAt: new Date() } : {}),
  };

  const service = await prisma.service.update({
    where: { id: serviceId },
    data: updateData,
  });

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
 * Duplicate service
 */
export async function duplicateService(sourceServiceId: string) {
  await requirePermission('services', 'create');

  const sourceService = await getService(sourceServiceId);

  if (!sourceService) {
    throw new Error('Source service not found');
  }

  // Return the service data without date and status
  // The form will handle creating the new service
  return {
    ...sourceService,
    id: undefined,
    serviceNumber: undefined,
    date: undefined, // Will be required in form
    status: ServiceStatus.DRAFT,
    createdAt: undefined,
    updatedAt: undefined,
  };
}

/**
 * Get service with all details
 */
export async function getServiceWithDetails(serviceId: string) {
  const service = await prisma.service.findFirst({
    where: {
      id: serviceId,
      deletedAt: null,
    },
    include: {
      client: true,
      supplier: true,
      createdBy: true,
      assignedTo: true,
      invoiceItems: {
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
            },
          },
        },
      },
      documents: {
        where: { deletedAt: null },
        orderBy: { uploadedAt: 'desc' },
      },
      statusHistory: {
        orderBy: { changedAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!service) return null;

  const invoice = service.invoiceItems?.[0]?.invoice || null;

  // Calculate edit count from audit logs
  const editCount = await prisma.auditLog.count({
    where: {
      tableName: 'services',
      recordId: serviceId,
      action: 'UPDATE',
    },
  });

  return {
    ...service,
    invoice,
    invoiceId: invoice?.id,
    editCount,
  };
}

/**
 * Get service activity timeline
 */
export async function getServiceActivity(
  serviceId: string,
  options: { page?: number; limit?: number } = {}
) {
  const { page = 1, limit = 10 } = options;
  const offset = (page - 1) * limit;

  const activities = await prisma.auditLog.findMany({
    where: {
      tableName: 'services',
      recordId: serviceId,
    },
    orderBy: { createdAt: 'desc' },
    skip: offset,
    take: limit + 1, // Get one extra to check if there's more
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });

  const hasMore = activities.length > limit;
  const items = activities.slice(0, limit);

  // Transform activities into timeline items
  const timelineItems = items.map(activity => {
    let description = '';
    let metadata = {};

    switch (activity.action) {
      case 'CREATE':
        description = 'Service created';
        break;
      case 'UPDATE':
        description = 'Service updated';
        // Parse changes from old/new values
        if (activity.oldValues && activity.newValues) {
          const changes = [];
          const oldVals = activity.oldValues as any;
          const newVals = activity.newValues as any;

          // Check common fields for changes
          const fieldsToCheck = ['costAmount', 'saleAmount', 'status', 'origin', 'destination'];
          for (const field of fieldsToCheck) {
            if (oldVals[field] !== newVals[field]) {
              changes.push({
                field: field.replace(/([A-Z])/g, ' $1').toLowerCase(),
                oldValue: oldVals[field],
                newValue: newVals[field],
              });
            }
          }

          metadata = { changes };
        }
        break;
      case 'DELETE':
        description = 'Service deleted';
        break;
      case 'COMPLETE':
        description = 'Service marked as completed';
        break;
      case 'CANCEL':
        description = 'Service cancelled';
        break;
      case 'ARCHIVE':
        description = 'Service archived';
        break;
      default:
        description = activity.action.replace(/_/g, ' ').toLowerCase();
    }

    return {
      id: activity.id,
      action: activity.action,
      description,
      user: activity.user,
      createdAt: activity.createdAt.toISOString(),
      metadata,
    };
  });

  return {
    activities: timelineItems,
    hasMore,
  };
}

/**
 * Mark service as complete
 */
export async function markServiceComplete(serviceId: string) {
  const session = await requireAuth();
  await requirePermission('services', 'mark_completed');

  const service = await prisma.service.update({
    where: { id: serviceId },
    data: {
      status: ServiceStatus.COMPLETED,
      completedAt: new Date(),
    },
  });

  await createAuditLog({
    userId: session.user.id,
    action: 'COMPLETE',
    tableName: 'services',
    recordId: serviceId,
    newValues: { status: ServiceStatus.COMPLETED },
  });

  revalidatePath(`/services/${serviceId}`);

  return service;
}

/**
 * Archive service
 */
export async function archiveService(serviceId: string) {
  const session = await requireAuth();
  await requirePermission('services', 'archive');

  const service = await prisma.service.update({
    where: { id: serviceId },
    data: {
      status: ServiceStatus.ARCHIVED,
      archivedAt: new Date(),
    },
  });

  await createAuditLog({
    userId: session.user.id,
    action: 'ARCHIVE',
    tableName: 'services',
    recordId: serviceId,
  });

  revalidatePath(`/services/${serviceId}`);

  return service;
}

/**
 * Generate loading order PDF
 */
export async function generateLoadingOrder(serviceId: string) {
  const session = await requireAuth();
  await requirePermission('documents', 'create');

  // Get service details
  const service = await getServiceWithDetails(serviceId);
  if (!service) throw new Error('Service not found');

  // TODO: Implement PDF generation
  // const pdfBuffer = await generateServicePDF(service, 'loading-order');
  // const pdfPath = await saveFile(pdfBuffer);

  // For now, use a placeholder
  const pdfPath = `/documents/loading-orders/${serviceId}.pdf`;
  const fileName = `LoadingOrder_${service.serviceNumber}.pdf`;

  // Save document reference
  const document = await prisma.document.create({
    data: {
      documentType: DocumentType.LOADING_ORDER,
      documentNumber: `LO-${service.serviceNumber}`,
      serviceId,
      fileName,
      filePath: pdfPath,
      fileSize: 0, // TODO: Get actual file size
      mimeType: 'application/pdf',
      description: `Loading order for service ${service.serviceNumber}`,
      uploadedBy: session.user.id,
    },
  });

  await createAuditLog({
    userId: session.user.id,
    action: 'GENERATE_DOCUMENT',
    tableName: 'services',
    recordId: serviceId,
    metadata: { documentType: 'LOADING_ORDER' },
  });

  revalidatePath(`/services/${serviceId}`);

  return { url: pdfPath, document };
}

/**
 * Send service details by email
 */
export async function sendServiceEmail(serviceId: string) {
  const session = await requireAuth();
  await requirePermission('services', 'edit');

  const service = await getServiceWithDetails(serviceId);
  if (!service) throw new Error('Service not found');

  // TODO: Implement email sending
  // await sendEmail({
  //   to: service.client.billingEmail,
  //   subject: `Service Details - ${service.serviceNumber}`,
  //   template: 'service-details',
  //   data: service,
  // });

  await createAuditLog({
    userId: session.user.id,
    action: 'SEND_EMAIL',
    tableName: 'services',
    recordId: serviceId,
    metadata: { recipient: service.client.billingEmail },
  });

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
  // const session = await requireAuth();
  await requirePermission('documents', 'create');

  // TODO: Implementation for generating loading orders
  // This would group services and create loading order documents

  return { success: true, count: serviceIds.length };
}