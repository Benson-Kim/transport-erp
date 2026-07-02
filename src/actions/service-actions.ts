/**
 * Service Server Actions
 * CRUD operations for services
 */

'use server';

import { revalidatePath } from 'next/cache';

import type { Prisma } from '@/app/generated/prisma';
import { ServiceStatus, DocumentType, UserRole } from '@/app/generated/prisma';
import { requireAuth } from '@/lib/auth';
import { getServiceWithDetails } from '@/lib/data/service-data';
import type { Action } from '@/lib/permissions';
import { createAuditLog } from '@/lib/prisma/db-helpers';
import { generateDocumentNumber } from '@/lib/prisma/numbering';
import prisma from '@/lib/prisma/prisma';
import {
  checkPermission,
  ForbiddenError,
  requirePermission,
  requireServiceAccess,
} from '@/lib/rbac';
import type { ServiceFormData } from '@/lib/validations/service-schema';
import { serviceSchema } from '@/lib/validations/service-schema';
import type { ServiceFiltersAPI } from '@/types/service';

/**
 * Get a single service by ID
 */
export async function getService(serviceId: string) {
  await requireServiceAccess('view', serviceId);

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

  // Calculate margin and VAT amounts
  const costVatRate = validatedData.costVatRate ?? 21;
  const saleVatRate = validatedData.saleVatRate ?? 21;

  const margin = Number((validatedData.saleAmount - validatedData.costAmount).toFixed(2));
  const marginPercentage =
    validatedData.saleAmount > 0
      ? Number(((margin / validatedData.saleAmount) * 100).toFixed(2))
      : 0;

  const saleVatAmount = Number((validatedData.saleAmount * (saleVatRate / 100)).toFixed(2));
  const costVatAmount = Number((validatedData.costAmount * (costVatRate / 100)).toFixed(2));

  const { completed, cancelled, totalCost, sale, kilometers, pricePerKm, extras, ...saveData } =
    validatedData;

  let serviceStatus: ServiceStatus;

  if (cancelled) {
    serviceStatus = ServiceStatus.CANCELLED;
  } else if (completed) {
    serviceStatus = ServiceStatus.COMPLETED;
  } else {
    serviceStatus = saveData.status || ServiceStatus.DRAFT;
  }

  // A new service may not be born into an elevated status the caller could
  // not reach via the dedicated action (review !16 R2-2).
  await requireElevatedStatusTransition(serviceStatus);

  // Allocate the service number and insert in one transaction so the counter
  // bump and the row insert commit together (race-free, no P2002).
  const service = await prisma.$transaction(async (tx) => {
    const serviceNumber = await generateDocumentNumber(tx, 'SRV');

    return tx.service.create({
      data: {
        ...(Object.fromEntries(
          Object.entries(saveData).filter(([_, v]) => v !== undefined)
        ) as any),
        serviceNumber,
        margin,
        marginPercentage,
        costVatAmount,
        saleVatAmount,
        status: serviceStatus,
        createdById: session.user.id,
      },
    });
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
export async function updateService(serviceId: string, data: ServiceFormData) {
  const session = await requireAuth();
  await requireServiceAccess('edit', serviceId);

  const validatedData = serviceSchema.parse(data);

  const currentService = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!currentService) throw new Error('Service not found');

  if (currentService.status === ServiceStatus.COMPLETED) {
    await requirePermission('services', 'edit_completed');
  }

  const costVatRate = validatedData.costVatRate ?? 21;
  const saleVatRate = validatedData.saleVatRate ?? 21;

  let { costAmount } = validatedData;
  let { saleAmount } = validatedData;
  let margin = saleAmount - costAmount;
  let marginPercentage = saleAmount > 0 ? (margin / saleAmount) * 100 : 0;
  let saleVatAmount = saleAmount * (saleVatRate / 100);
  let costVatAmount = costAmount * (costVatRate / 100);

  if (validatedData.cancelled) {
    costVatAmount = saleVatAmount = costAmount = saleAmount = margin = marginPercentage = 0;
  }

  const { completed, cancelled, totalCost, sale, kilometers, pricePerKm, extras, ...dataToStore } =
    validatedData;

  let serviceStatus: ServiceStatus;
  if (cancelled) {
    serviceStatus = ServiceStatus.CANCELLED;
  } else if (completed) {
    serviceStatus = ServiceStatus.COMPLETED;
  } else {
    serviceStatus = dataToStore.status || currentService.status;
  }

  // The generic edit path may not perform an elevated transition the
  // dedicated action (markServiceComplete, archiveService, ...) would deny.
  // This closes a pre-existing hole: serviceSchema accepts any ServiceStatus
  // and the completed/cancelled flags, so services:edit alone could reach
  // COMPLETED/INVOICED/CANCELLED/ARCHIVED here. (review !16 R2-2)
  if (serviceStatus !== currentService.status) {
    await requireElevatedStatusTransition(serviceStatus);
  }

  const timestamps: { completedAt?: Date; cancelledAt?: Date } = {};
  if (completed) timestamps.completedAt = new Date();
  if (cancelled) timestamps.cancelledAt = new Date();

  const updateData = {
    ...(Object.fromEntries(Object.entries(dataToStore).filter(([_, v]) => v !== undefined)) as any),
    costAmount,
    saleAmount,
    margin: Number(margin.toFixed(2)),
    marginPercentage: Number(marginPercentage.toFixed(2)),
    costVatAmount: Number(costVatAmount.toFixed(2)),
    saleVatAmount: Number(saleVatAmount.toFixed(2)),
    status: serviceStatus,
    ...timestamps,
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
  await requireServiceAccess('delete', serviceId);

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
  await requireAuth();
  await requirePermission('services', 'create');
  // getService below enforces read access (incl. ownership) on the source.

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

/** Full service payload returned by getServiceWithDetails (type-only export). */
export type ServiceWithDetails = NonNullable<Awaited<ReturnType<typeof getServiceWithDetails>>>;

/**
 * Get service activity timeline
 */
export async function getServiceActivity(
  serviceId: string,
  options: { page?: number; limit?: number } = {}
) {
  await requireServiceAccess('view', serviceId);

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
  await requireServiceAccess('mark_completed', serviceId);

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
  await requireServiceAccess('archive', serviceId);

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
  await requireServiceAccess('view', serviceId);

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
  await requireServiceAccess('edit', serviceId);

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
 * Elevated status DESTINATIONS and the dedicated permission each requires
 * (review !16 R2-2). Mirrors the single-purpose actions and the
 * PERMISSION_MATRIX (markServiceComplete -> services:mark_completed,
 * INVOICED -> services:mark_billed, archiveService -> services:archive,
 * CANCELLED -> services:cancel), so no generic create/edit/bulk path can
 * perform a transition whose dedicated action would be denied.
 * "Bulk = fold of single" applies to the transition, not only the origin
 * state.
 */
const ELEVATED_STATUS_TRANSITIONS: Partial<Record<ServiceStatus, Action>> = {
  [ServiceStatus.COMPLETED]: 'mark_completed',
  [ServiceStatus.INVOICED]: 'mark_billed',
  [ServiceStatus.CANCELLED]: 'cancel',
  [ServiceStatus.ARCHIVED]: 'archive',
};

/**
 * No-op for undefined or non-elevated destinations; throws ForbiddenError
 * (via requirePermission) when the caller lacks the dedicated permission for
 * an elevated destination.
 */
async function requireElevatedStatusTransition(
  target: ServiceStatus | undefined
): Promise<void> {
  if (!target) return;
  const requiredAction = ELEVATED_STATUS_TRANSITIONS[target];
  if (requiredAction) {
    await requirePermission('services', requiredAction);
  }
}

/**
 * Statuses that are locked for edit/delete unless the caller holds the
 * elevated edit_completed / delete_completed permission. Mirrors the
 * single-op guard in updateService (which requires edit_completed for a
 * COMPLETED service) so bulk paths cannot bypass it. (#20)
 */
const PROTECTED_STATUSES: ServiceStatus[] = [ServiceStatus.COMPLETED, ServiceStatus.INVOICED];

/**
 * Bulk = fold of single (#16/#20): a bulk operation must enforce every guard
 * of the single-op path - auth, permission, OPERATOR ownership, the
 * completed/invoiced elevation, and the soft-delete filter.
 *
 * Returns the ids that exist and are not soft-deleted, plus an invariantWhere
 * fragment that re-asserts the guards inside the UPDATE itself (TOCTOU: a
 * service transitioning to COMPLETED/INVOICED - or being reassigned - between
 * the read and the write is excluded by the database, and the returned count
 * stays honest).
 *
 * Throws when the selection includes services the caller may not touch,
 * exactly like the single-op path refuses them.
 */
async function assertBulkServiceInvariants(
  serviceIds: string[],
  elevatedAction: 'edit_completed' | 'delete_completed',
  user: { id: string; role: UserRole }
): Promise<{ targetIds: string[]; invariantWhere: Prisma.ServiceWhereInput }> {
  const services = await prisma.service.findMany({
    where: { id: { in: serviceIds }, deletedAt: null },
    select: { id: true, status: true, createdById: true, assignedToId: true },
  });

  // OPERATOR is ownership-scoped exactly like requireServiceAccess (#16):
  // reject rather than silently filter, so the UI cannot lie about scope.
  if (user.role === UserRole.OPERATOR) {
    const notOwned = services.filter(
      (s) => s.createdById !== user.id && s.assignedToId !== user.id
    );
    if (notOwned.length > 0) {
      // Typed per the authz contract (review !16 R2-1): pages catch by
      // instanceof and must render access-denied, not crash to the boundary.
      throw new ForbiddenError('Forbidden: selection includes services you do not have access to');
    }
  }

  const elevated = await checkPermission('services', elevatedAction);
  const hasProtected = services.some((s) => PROTECTED_STATUSES.includes(s.status));
  if (hasProtected && !elevated) {
    throw new ForbiddenError(
      'Selection includes completed or invoiced services. ' +
        'You do not have permission to modify them.'
    );
  }

  // Re-asserted inside the mutation's WHERE (TOCTOU guard).
  const invariantWhere: Prisma.ServiceWhereInput = {
    deletedAt: null,
    ...(elevated ? {} : { status: { notIn: PROTECTED_STATUSES } }),
    ...(user.role === UserRole.OPERATOR
      ? { OR: [{ createdById: user.id }, { assignedToId: user.id }] }
      : {}),
  };

  return { targetIds: services.map((s) => s.id), invariantWhere };
}

/**
 * Bulk update services
 */
export async function bulkUpdateServices(
  serviceIds: string[],
  updates: { status?: ServiceStatus }
) {
  const session = await requireAuth();
  await requirePermission('services', 'edit');

  // Bulk = fold of single applies to the TRANSITION too (review !16 R2-2):
  // setting an elevated status in bulk demands the same dedicated permission
  // as the single-op action would - checked before touching any data.
  await requireElevatedStatusTransition(updates.status);

  // Enforce the same guards as the single-op path - including OPERATOR
  // ownership - and only operate on the ids that pass. (#16/#20)
  const { targetIds, invariantWhere } = await assertBulkServiceInvariants(
    serviceIds,
    'edit_completed',
    session.user
  );

  if (targetIds.length === 0) {
    return { success: true, count: 0 };
  }

  const result = await prisma.service.updateMany({
    where: { id: { in: targetIds }, ...invariantWhere },
    data: updates,
  });

  // Create audit log
  await createAuditLog({
    userId: session.user.id,
    action: 'UPDATE',
    tableName: 'services',
    recordId: targetIds.join(','),
    metadata: { bulk: true, updates, count: result.count },
  });

  revalidatePath('/services');

  return { success: true, count: result.count };
}

/**
 * Bulk delete services
 */
export async function bulkDeleteServices(serviceIds: string[]) {
  const session = await requireAuth();
  await requirePermission('services', 'delete');

  // Same invariants as single delete: OPERATOR ownership, never re-stamp
  // already-deleted rows, and refuse completed/invoiced services unless the
  // caller holds delete_completed. (#16/#20)
  const { targetIds, invariantWhere } = await assertBulkServiceInvariants(
    serviceIds,
    'delete_completed',
    session.user
  );

  if (targetIds.length === 0) {
    return { success: true, count: 0 };
  }

  const result = await prisma.service.updateMany({
    where: { id: { in: targetIds }, ...invariantWhere },
    data: { deletedAt: new Date() },
  });

  // Create audit log
  await createAuditLog({
    userId: session.user.id,
    action: 'DELETE',
    tableName: 'services',
    recordId: targetIds.join(','),
    metadata: { bulk: true, count: result.count },
  });

  revalidatePath('/services');

  return { success: true, count: result.count };
}

/**
 * Generate bulk loading orders
 */
export async function generateBulkLoadingOrders(serviceIds: string[]) {
  await requireAuth();
  await requirePermission('documents', 'create');

  // TODO: Implementation for generating loading orders.
  // MANDATORY when implemented (#16): every id must pass
  // requireServiceAccess('view', id) - per-service ownership - exactly like
  // generateLoadingOrder does on the single-service path. Do not ship an
  // implementation without that guard.
  // This would group services and create loading order documents.

  // Honest counts (review !16 R2-3): a stub must not claim success for work
  // it did not do - the UI would confidently lie on its behalf.
  return {
    success: false as const,
    error: 'Bulk loading-order generation is not implemented yet',
    count: 0,
  };
}
