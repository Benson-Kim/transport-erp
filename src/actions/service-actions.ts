/**
 * Service Server Actions
 * CRUD operations for services
 */

'use server';

import { revalidatePath } from 'next/cache';

import type { Prisma } from '@/app/generated/prisma';
import { ServiceStatus, DocumentType } from '@/app/generated/prisma';
import { requireAuth } from '@/lib/auth';
import { createAuditLog, generateUniqueIdentifier } from '@/lib/prisma/db-helpers';
import prisma from '@/lib/prisma/prisma';
import { requirePermission } from '@/lib/rbac';
import type { ServiceFormData } from '@/lib/validations/service-schema';
import { serviceSchema } from '@/lib/validations/service-schema';
import type { ServiceFiltersAPI } from '@/types/service';
import { PdfService } from '@/lib/pdf/pdf-service';
import { computeFinancials } from '@/lib/service-financials';
import { filterValidTransitions } from '@/lib/service/service-state-machine';

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
export async function getServices(filters: ServiceFiltersAPI) {
  await requirePermission('services', 'view');

  const where: Prisma.ServiceWhereInput = {
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

  if (filters.dateFrom || filters.dateTo) {
    const dateFilter: Record<string, Date> = {};
    if (filters.dateFrom) dateFilter.gte = new Date(filters.dateFrom);
    if (filters.dateTo) dateFilter.lte = new Date(filters.dateTo);
    where.date = dateFilter;
  }

  if (filters.status) {
    where.status = filters.status;
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
    keyof Prisma.ServiceOrderByWithRelationInput | Record<string, unknown>
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

  // Service number generated inside transaction below to prevent sequence gaps.

  const { completed, cancelled, totalCost, sale, kilometers, pricePerKm, extras, ...saveData } =
    validatedData;

  // Single source of truth for financial calculations
  const financials = computeFinancials({
    costAmount: validatedData.costAmount,
    saleAmount: validatedData.saleAmount,
    costVatRate: validatedData.costVatRate || 0,
    saleVatRate: validatedData.saleVatRate || 0,
    cancelled: cancelled || false,
  });

  let serviceStatus: ServiceStatus;

  if (cancelled) {
    serviceStatus = ServiceStatus.CANCELLED;
  } else if (completed) {
    serviceStatus = ServiceStatus.COMPLETED;
  } else {
    serviceStatus = saveData.status || ServiceStatus.DRAFT;
  }

  const service = await prisma.$transaction(async (tx) => {
    // Generate inside tx to avoid orphaned sequence numbers on rollback
    const serviceNumber = await generateUniqueIdentifier('SRV', 'service', 'serviceNumber', tx);

    const created = await tx.service.create({
      data: {
        ...(Object.fromEntries(Object.entries(saveData).filter(([_, v]) => v !== undefined)) as any),
        serviceNumber,
        margin: financials.margin,
        marginPercentage: financials.marginPercentage,
        costVatAmount: financials.costVatAmount,
        saleVatAmount: financials.saleVatAmount,
        status: serviceStatus,
        createdById: session.user.id,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'CREATE',
        tableName: 'services',
        recordId: created.id,
        newValues: created as any,
        metadata: { timestamp: new Date().toISOString() },
      },
    });

    return created;
  });

  revalidatePath('/services');

  return { success: true, service };
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

  const { completed, cancelled, totalCost, sale, kilometers, pricePerKm, extras, ...dataToStore } =
    validatedData;

  // Single source of truth for financial calculations
  const financials = computeFinancials({
    costAmount: validatedData.costAmount,
    saleAmount: validatedData.saleAmount,
    costVatRate: validatedData.costVatRate || 0,
    saleVatRate: validatedData.saleVatRate || 0,
    cancelled: cancelled || false,
  });

  let serviceStatus: ServiceStatus;
  if (cancelled) {
    serviceStatus = ServiceStatus.CANCELLED;
  } else if (completed) {
    serviceStatus = ServiceStatus.COMPLETED;
  } else {
    serviceStatus = dataToStore.status || currentService.status;
  }

  const timestamps: { completedAt?: Date; cancelledAt?: Date } = {};
  if (completed) timestamps.completedAt = new Date();
  if (cancelled) timestamps.cancelledAt = new Date();

  const updateData = {
    ...(Object.fromEntries(Object.entries(dataToStore).filter(([_, v]) => v !== undefined)) as any),
    costAmount: financials.costAmount,
    saleAmount: financials.saleAmount,
    margin: financials.margin,
    marginPercentage: financials.marginPercentage,
    costVatAmount: financials.costVatAmount,
    saleVatAmount: financials.saleVatAmount,
    status: serviceStatus,
    ...timestamps,
  };

  const service = await prisma.$transaction(async (tx) => {
    const updated = await tx.service.update({
      where: { id: serviceId },
      data: updateData,
    });

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        tableName: 'services',
        recordId: serviceId,
        oldValues: currentService as any,
        newValues: updated as any,
        metadata: { timestamp: new Date().toISOString() },
      },
    });

    return updated;
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

  // Guard: prevent deletion if service has active (non-terminal) shipments
  const activeShipments = await prisma.shipment.count({
    where: {
      serviceId,
      status: { notIn: ['DELIVERED', 'RETURNED', 'FAILED'] },
    },
  });
  if (activeShipments > 0) {
    throw new Error(
      `Cannot delete service with ${activeShipments} active shipment(s). ` +
      `Complete or cancel all shipments first.`
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.service.update({
      where: { id: serviceId },
      data: { deletedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'DELETE',
        tableName: 'services',
        recordId: serviceId,
        oldValues: { deletedAt: null },
        newValues: { deletedAt: new Date().toISOString() },
        metadata: { timestamp: new Date().toISOString() },
      },
    });
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
  await requirePermission('services', 'view');

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
  const timelineItems = items.map((activity) => {
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
          const oldVals = activity.oldValues as Record<string, unknown>;
          const newVals = activity.newValues as Record<string, unknown>;

          // Check common fields for changes
          const fieldsToCheck = ['costAmount', 'saleAmount', 'status', 'origin', 'destination'];
          for (const field of fieldsToCheck) {
            if (oldVals[field] !== newVals[field]) {
              changes.push({
                field: field.replaceAll(/([A-Z])/g, ' $1').toLowerCase(),
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
        description = activity.action.replaceAll('_', ' ').toLowerCase();
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

  const current = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!current) throw new Error('Service not found');

  const allowedFrom: ServiceStatus[] = [ServiceStatus.DRAFT, ServiceStatus.CONFIRMED, ServiceStatus.IN_PROGRESS];
  if (!allowedFrom.includes(current.status)) {
    throw new Error(`Cannot complete a service with status "${current.status}"`);
  }

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

  const current = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!current) throw new Error('Service not found');

  const allowedFrom: ServiceStatus[] = [ServiceStatus.COMPLETED, ServiceStatus.INVOICED];
  if (!allowedFrom.includes(current.status)) {
    throw new Error(`Cannot archive a service with status "${current.status}". Only completed or invoiced services can be archived.`);
  }

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
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: {
      client: true,
      shipments: true,
    },
  });

  if (!service) throw new Error('Service not found');

  // Generate and upload PDF
  const { url, path } = await PdfService.generateAndUploadLoadingOrder(service);

  const fileName = `LoadingOrder_${service.serviceNumber}.pdf`;

  // Save document reference
  const document = await prisma.document.create({
    data: {
      documentType: DocumentType.LOADING_ORDER,
      documentNumber: `LO-${service.serviceNumber}`,
      serviceId,
      fileName,
      filePath: path,
      fileSize: 0, // In a real app we could get this from buffer.length
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
    metadata: { documentType: 'LOADING_ORDER', fileName },
  });

  revalidatePath(`/services/${serviceId}`);

  return { url, document };
}

/**
 * Send service details by email
 */
export async function sendServiceEmail(serviceId: string) {
  const session = await requireAuth();
  await requirePermission('services', 'edit');

  const service = await getServiceWithDetails(serviceId);
  if (!service) throw new Error('Service not found');

  const { EmailService } = await import('@/lib/email/service');
  const emailService = EmailService.getInstance();

  const result = await emailService.sendTemplate(
    'notification',
    service.client.billingEmail,
    {
      recipientName: service.client.contactPerson ?? service.client.name,
      title: `Detalles del Servicio — ${service.serviceNumber}`,
      message: `Servicio ${service.serviceNumber} del ${new Date(service.date).toLocaleDateString('es-ES')}. Origen: ${service.origin} → Destino: ${service.destination}.`,
      actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/services/${serviceId}`,
      actionLabel: 'Ver Servicio',
      type: 'info',
    },
  );

  if (!result.success) {
    return { success: false, error: result.error ?? 'Email sending failed' };
  }

  await createAuditLog({
    userId: session.user.id,
    action: 'SEND_EMAIL',
    tableName: 'services',
    recordId: serviceId,
    metadata: { recipient: service.client.billingEmail, messageId: result.id },
  });

  return { success: true };
}

/**
 * Maximum number of IDs allowed in a single bulk operation.
 */
const MAX_BULK_IDS = 100;

/**
 * Bulk update services
 */
export async function bulkUpdateServices(
  serviceIds: string[],
  updates: { status?: ServiceStatus }
) {
  if (serviceIds.length > MAX_BULK_IDS) {
    throw new Error(`Cannot process more than ${MAX_BULK_IDS} items at once`);
  }
  const session = await requireAuth();
  await requirePermission('services', 'edit');

  // When updating status, validate transitions via the state machine
  if (updates.status) {
    const targetStatus = updates.status;

    // Fetch current statuses
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds }, deletedAt: null },
      select: { id: true, status: true },
    });

    const { validIds, skippedCount } = filterValidTransitions(services, targetStatus);

    if (validIds.length > 0) {
      await prisma.service.updateMany({
        where: { id: { in: validIds }, deletedAt: null },
        data: updates,
      });
    }

    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      tableName: 'services',
      recordId: validIds.join(',') || 'none',
      metadata: { bulk: true, updates, updatedCount: validIds.length, skippedCount },
    });

    revalidatePath('/services');
    return { success: true, updatedCount: validIds.length, skippedCount };
  }

  // Non-status updates — apply directly
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
  if (serviceIds.length > MAX_BULK_IDS) {
    throw new Error(`Cannot process more than ${MAX_BULK_IDS} items at once`);
  }
  const session = await requireAuth();
  await requirePermission('services', 'delete');

  await prisma.service.updateMany({
    where: {
      id: { in: serviceIds },
      deletedAt: null,
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
  if (serviceIds.length > MAX_BULK_IDS) {
    throw new Error(`Cannot process more than ${MAX_BULK_IDS} items at once`);
  }
  const session = await requireAuth();
  await requirePermission('documents', 'create');

  const results: Array<{ serviceId: string; success: boolean; url?: string; error?: string }> = [];

  for (const serviceId of serviceIds) {
    try {
      const result = await generateLoadingOrder(serviceId);
      results.push({ serviceId, success: true, url: result.url });
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      console.error(`[BulkLoadingOrders] Failed for service ${serviceId}:`, error);
      results.push({ serviceId, success: false, error });
    }
  }

  const successCount = results.filter((r) => r.success).length;

  await createAuditLog({
    userId: session.user.id,
    action: 'GENERATE_DOCUMENT',
    tableName: 'services',
    recordId: serviceIds.join(','),
    metadata: {
      bulk: true,
      documentType: 'LOADING_ORDER',
      totalRequested: serviceIds.length,
      successCount,
      failedCount: serviceIds.length - successCount,
    },
  });

  return { success: successCount > 0, count: successCount, results };
}
