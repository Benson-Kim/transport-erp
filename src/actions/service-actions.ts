/**
 * Service Server Actions
 * CRUD operations for services
 */

'use server';

import { revalidatePath } from 'next/cache';

import type { Prisma } from '@/app/generated/prisma';
import { ServiceStatus, UserRole } from '@/app/generated/prisma';
import { requireAuth } from '@/lib/auth';
import { getServiceWithDetails } from '@/lib/data/service-data';
import type { Action } from '@/lib/permissions';
import {
  computeServicePricing,
  decimalToNumber,
  effectiveServiceAmounts,
  round2,
  toDecimal,
} from '@/lib/pricing';
import { createAuditLog, getPaginationParams, withTransaction } from '@/lib/prisma/db-helpers';
import { generateDocumentNumber } from '@/lib/prisma/numbering';
import prisma from '@/lib/prisma/prisma';
import {
  checkPermission,
  ForbiddenError,
  requirePermission,
  requireServiceAccess,
} from '@/lib/rbac';
import { assertTransition, legalSourceStatuses } from '@/lib/service-status';
import type { ServiceFormData } from '@/lib/validations/service-schema';
import { serviceSchema } from '@/lib/validations/service-schema';
import type { ServiceFiltersAPI } from '@/types/service';

/**
 * The reports aggregate recognized revenue over services (#33): any service
 * mutation can change a month's booked totals, so the report routes refresh
 * together with the services routes.
 */
function revalidateReportPaths(): void {
  revalidatePath('/reports/revenue');
  revalidatePath('/reports/margins');
}

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

  // Booked (original) figures: this feeds the edit form, which must always
  // show the stored amounts - including for CANCELLED services (#28).
  return {
    ...service,
    date: service.date.toISOString(),
    costAmount: decimalToNumber(service.costAmount),
    saleAmount: decimalToNumber(service.saleAmount),
    margin: decimalToNumber(service.margin),
    marginPercentage: decimalToNumber(service.marginPercentage),
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
    // #46: resolve matching client ids FIRST against the trgm-indexed
    // clients.name (bounded), then filter services by clientId. The
    // previous ILIKE-over-join ({ client: { name: contains } }) probed the
    // join per candidate row and could not use any index. Every leg below
    // is served by a pg_trgm GIN index (migration 20260705000001).
    const matchingClients = await prisma.client.findMany({
      where: { deletedAt: null, name: { contains: filters.search, mode: 'insensitive' } },
      select: { id: true },
      take: 100,
    });

    where.OR = [
      { serviceNumber: { contains: filters.search, mode: 'insensitive' } },
      { driverName: { contains: filters.search, mode: 'insensitive' } },
      { vehiclePlate: { contains: filters.search, mode: 'insensitive' } },
      ...(matchingClients.length > 0
        ? [{ clientId: { in: matchingClients.map((client) => client.id) } }]
        : []),
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

  // Pagination (#45): through the ONE shared helper, which enforces the
  // hard server-side cap (max 100, floor 1) that serviceFilterSchema
  // declares but this path bypassed - getServices({ pageSize: 1_000_000 })
  // must never stream the whole table. Default page size stays 50.
  const { skip, take } = getPaginationParams({
    page: filters.page ?? 1,
    limit: filters.pageSize ?? 50,
  });

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

  // Format services for frontend. Effective amounts (#25/#28): a CANCELLED
  // service lists as €0 derived from its status; the stored figures stay
  // intact so cancellation is reversible.
  const formattedServices = services.map((service) => {
    const amounts = effectiveServiceAmounts(service.status === ServiceStatus.CANCELLED, {
      costAmount: toDecimal(service.costAmount),
      saleAmount: toDecimal(service.saleAmount),
      margin: toDecimal(service.margin),
      marginPercentage: toDecimal(service.marginPercentage),
      costVatAmount: toDecimal(service.costVatAmount),
      saleVatAmount: toDecimal(service.saleVatAmount),
    });

    return {
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
      costAmount: decimalToNumber(amounts.costAmount),
      saleAmount: decimalToNumber(amounts.saleAmount),
      margin: decimalToNumber(amounts.margin),
      marginPercentage: decimalToNumber(amounts.marginPercentage),
      status: service.status,
    };
  });

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

  // Canonical pricing (#25): all money arithmetic in Decimal via pricing.ts.
  const pricing = computeServicePricing(validatedData);

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

  // Money-critical mutation (#27): number allocation, insert, initial status
  // history and the audit row commit - or roll back - together (race-free
  // numbering per #12; Serializable + retry-on-40001 from withTransaction).
  const service = await withTransaction(
    async (tx) => {
      const serviceNumber = await generateDocumentNumber(tx, 'SRV');

      const created = await tx.service.create({
        data: {
          ...(Object.fromEntries(
            Object.entries(saveData).filter(([_, v]) => v !== undefined)
          ) as any),
          serviceNumber,
          costAmount: round2(saveData.costAmount),
          saleAmount: round2(saveData.saleAmount),
          margin: pricing.margin,
          marginPercentage: pricing.marginPercentage,
          costVatAmount: pricing.costVatAmount,
          saleVatAmount: pricing.saleVatAmount,
          status: serviceStatus,
          createdById: session.user.id,
        },
      });

      // Services born into a non-default status record an initial history row.
      if (serviceStatus !== ServiceStatus.DRAFT) {
        await tx.serviceStatusHistory.create({
          data: {
            serviceId: created.id,
            fromStatus: null,
            toStatus: serviceStatus,
            changedBy: session.user.id,
          },
        });
      }

      await createAuditLog(
        {
          userId: session.user.id,
          action: 'CREATE',
          tableName: 'services',
          recordId: created.id,
          newValues: created,
        },
        tx
      );

      return created;
    },
    { isolationLevel: 'Serializable' }
  );

  revalidatePath('/services');
  revalidateReportPaths();

  return { success: true, service };
}

/**
 * Update service
 */
export async function updateService(serviceId: string, data: ServiceFormData) {
  const session = await requireAuth();
  await requireServiceAccess('edit', serviceId);

  const validatedData = serviceSchema.parse(data);

  // Permission facts are precomputed OUTSIDE the transaction (they depend
  // only on the caller, not on the row). The row itself is read INSIDE the
  // transaction below: asserting permissions or the state machine against a
  // read taken outside it is a stale snapshot under concurrency
  // (review !17 blocker 2).
  const canEditCompleted = await checkPermission('services', 'edit_completed');

  // Canonical pricing (#25) + non-destructive cancel (#28): the booked
  // cost/sale figures are ALWAYS stored and margins computed from them. The
  // €0 presentation for a CANCELLED service is derived from its status at
  // display boundaries (effectiveServiceAmounts), so reverting a
  // cancellation restores the original figures - nothing is destroyed.
  const { costAmount, saleAmount } = validatedData;

  const pricing = computeServicePricing({
    costAmount,
    saleAmount,
    costVatRate: validatedData.costVatRate,
    saleVatRate: validatedData.saleVatRate,
  });

  const { completed, cancelled, totalCost, sale, kilometers, pricePerKm, extras, ...dataToStore } =
    validatedData;

  // The explicitly requested destination status (undefined = keep current).
  let requestedStatus: ServiceStatus | undefined;
  if (cancelled) {
    requestedStatus = ServiceStatus.CANCELLED;
  } else if (completed) {
    requestedStatus = ServiceStatus.COMPLETED;
  } else {
    requestedStatus = dataToStore.status;
  }

  // The generic edit path may not perform an elevated transition the
  // dedicated action (markServiceComplete, archiveService, ...) would deny
  // (review !16 R2-2). The permission FACT depends only on the caller and is
  // precomputed here; whether a transition actually happens is decided
  // inside the transaction against the fresh row.
  const requestedElevatedAction = requestedStatus
    ? ELEVATED_STATUS_TRANSITIONS[requestedStatus]
    : undefined;
  const requestedElevatedGranted = requestedElevatedAction
    ? await checkPermission('services', requestedElevatedAction)
    : true;

  // Money-critical mutation (#27): the row is READ, the state machine
  // asserted, and the update + status-history + audit rows written inside
  // one Serializable transaction. A concurrent status change surfaces as a
  // serialization failure and retries the whole callback against fresh data
  // (review !17 blocker 2) - the stale-read race that made
  // INVOICED -> DRAFT reachable is closed at the database.
  const service = await withTransaction(
    async (tx) => {
      const currentService = await tx.service.findUnique({ where: { id: serviceId } });
      if (!currentService) throw new Error('Service not found');

      if (currentService.status === ServiceStatus.COMPLETED && !canEditCompleted) {
        throw new ForbiddenError('Insufficient permissions: services:edit_completed required');
      }

      const serviceStatus = requestedStatus ?? currentService.status;

      if (serviceStatus !== currentService.status) {
        if (requestedElevatedAction && !requestedElevatedGranted) {
          throw new ForbiddenError(
            `Insufficient permissions: services:${requestedElevatedAction} required`
          );
        }
        // Lifecycle state machine (#27): reject illegal moves before any
        // write (e.g. CANCELLED -> IN_PROGRESS, INVOICED -> DRAFT), against
        // the freshly read status.
        assertTransition(currentService.status, serviceStatus);
      }

      const timestamps: { completedAt?: Date; cancelledAt?: Date | null } = {};
      if (completed) timestamps.completedAt = new Date();
      if (cancelled) timestamps.cancelledAt = new Date();
      // Reactivating a cancelled service clears the cancellation timestamp -
      // cancel is a reversible state, not a destructive event (#28).
      if (
        !cancelled &&
        currentService.status === ServiceStatus.CANCELLED &&
        serviceStatus !== ServiceStatus.CANCELLED
      ) {
        timestamps.cancelledAt = null;
      }

      const updateData = {
        ...(Object.fromEntries(
          Object.entries(dataToStore).filter(([_, v]) => v !== undefined)
        ) as any),
        costAmount: round2(costAmount),
        saleAmount: round2(saleAmount),
        margin: pricing.margin,
        marginPercentage: pricing.marginPercentage,
        costVatAmount: pricing.costVatAmount,
        saleVatAmount: pricing.saleVatAmount,
        status: serviceStatus,
        ...timestamps,
      };

      const updated = await tx.service.update({
        where: { id: serviceId },
        data: updateData,
      });

      if (serviceStatus !== currentService.status) {
        await tx.serviceStatusHistory.create({
          data: {
            serviceId,
            fromStatus: currentService.status,
            toStatus: serviceStatus,
            changedBy: session.user.id,
          },
        });
      }

      await createAuditLog(
        {
          userId: session.user.id,
          action: 'UPDATE',
          tableName: 'services',
          recordId: serviceId,
          oldValues: currentService,
          newValues: updated,
        },
        tx
      );

      return updated;
    },
    { isolationLevel: 'Serializable' }
  );

  revalidatePath('/services');
  revalidatePath(`/services/${serviceId}`);
  revalidateReportPaths();

  return { success: true, service };
}

/**
 * Delete service (soft delete)
 */
export async function deleteService(serviceId: string) {
  const session = await requireAuth();
  await requireServiceAccess('delete', serviceId);

  // Soft delete and its audit row commit together (#27).
  await withTransaction(async (tx) => {
    await tx.service.update({
      where: { id: serviceId },
      data: { deletedAt: new Date() },
    });

    await createAuditLog(
      {
        userId: session.user.id,
        action: 'DELETE',
        tableName: 'services',
        recordId: serviceId,
      },
      tx
    );
  });

  revalidatePath('/services');
  revalidateReportPaths();

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

  // Read + state machine + write + history + audit in ONE Serializable
  // transaction (review !17 blocker 2): asserting the transition against a
  // row read outside the transaction is a stale snapshot under concurrency.
  const service = await withTransaction(
    async (tx) => {
      const currentService = await tx.service.findUnique({ where: { id: serviceId } });
      if (!currentService) throw new Error('Service not found');

      // Lifecycle state machine (#27), asserted against the fresh row.
      assertTransition(currentService.status, ServiceStatus.COMPLETED);

      const updated = await tx.service.update({
        where: { id: serviceId },
        data: {
          status: ServiceStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      if (currentService.status !== ServiceStatus.COMPLETED) {
        await tx.serviceStatusHistory.create({
          data: {
            serviceId,
            fromStatus: currentService.status,
            toStatus: ServiceStatus.COMPLETED,
            changedBy: session.user.id,
          },
        });
      }

      await createAuditLog(
        {
          userId: session.user.id,
          action: 'COMPLETE',
          tableName: 'services',
          recordId: serviceId,
          newValues: { status: ServiceStatus.COMPLETED },
        },
        tx
      );

      return updated;
    },
    { isolationLevel: 'Serializable' }
  );

  revalidatePath(`/services/${serviceId}`);
  revalidateReportPaths();

  return service;
}

/**
 * Archive service
 */
export async function archiveService(serviceId: string) {
  const session = await requireAuth();
  await requireServiceAccess('archive', serviceId);

  // Read + state machine + write + history + audit in ONE Serializable
  // transaction (review !17 blocker 2): asserting the transition against a
  // row read outside the transaction is a stale snapshot under concurrency.
  const service = await withTransaction(
    async (tx) => {
      const currentService = await tx.service.findUnique({ where: { id: serviceId } });
      if (!currentService) throw new Error('Service not found');

      // Lifecycle state machine (#27), asserted against the fresh row.
      assertTransition(currentService.status, ServiceStatus.ARCHIVED);

      const updated = await tx.service.update({
        where: { id: serviceId },
        data: {
          status: ServiceStatus.ARCHIVED,
          archivedAt: new Date(),
        },
      });

      if (currentService.status !== ServiceStatus.ARCHIVED) {
        await tx.serviceStatusHistory.create({
          data: {
            serviceId,
            fromStatus: currentService.status,
            toStatus: ServiceStatus.ARCHIVED,
            changedBy: session.user.id,
          },
        });
      }

      await createAuditLog(
        {
          userId: session.user.id,
          action: 'ARCHIVE',
          tableName: 'services',
          recordId: serviceId,
        },
        tx
      );

      return updated;
    },
    { isolationLevel: 'Serializable' }
  );

  revalidatePath(`/services/${serviceId}`);
  revalidateReportPaths();

  return service;
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

  const nextStatus = updates.status;

  // Bulk mutation, history and audit in one Serializable tx (#27). Rows are
  // re-read inside the transaction with the invariant WHERE so the history
  // rows describe exactly what the UPDATE touches, and lifecycle legality is
  // asserted per row - bulk = fold of single applies to the state machine
  // too.
  const result = await withTransaction(
    async (tx) => {
      const rows = await tx.service.findMany({
        where: { id: { in: targetIds }, ...invariantWhere },
        select: { id: true, status: true },
      });

      if (nextStatus) {
        for (const row of rows) {
          assertTransition(row.status, nextStatus);
        }
      }

      // The invariants and the state machine are re-asserted INSIDE the
      // UPDATE's WHERE (review !17 blocker 1 - the #20 TOCTOU guarantee): a
      // row that is soft-deleted, reassigned, or transitioned to a
      // protected/illegal source status between the read and the write is
      // excluded by the database itself. AND-composed so the two status
      // conditions cannot clobber each other.
      const updateResult = await tx.service.updateMany({
        where: {
          AND: [
            { id: { in: rows.map((row) => row.id) } },
            invariantWhere,
            ...(nextStatus ? [{ status: { in: legalSourceStatuses(nextStatus) } }] : []),
          ],
        },
        data: updates,
      });

      // Honest history: the rows read (which feed ServiceStatusHistory) must
      // be exactly the rows updated. Under Serializable a divergence
      // surfaces as a retried serialization failure; this guard rolls the
      // transaction back should any path ever let them diverge.
      if (updateResult.count !== rows.length) {
        throw new Error(
          `Bulk update aborted: read ${rows.length} rows but updated ${updateResult.count}`
        );
      }

      if (nextStatus) {
        const changed = rows.filter((row) => row.status !== nextStatus);
        if (changed.length > 0) {
          await tx.serviceStatusHistory.createMany({
            data: changed.map((row) => ({
              serviceId: row.id,
              fromStatus: row.status,
              toStatus: nextStatus,
              changedBy: session.user.id,
            })),
          });
        }
      }

      await createAuditLog(
        {
          userId: session.user.id,
          action: 'UPDATE',
          tableName: 'services',
          recordId: targetIds.join(','),
          metadata: { bulk: true, updates, count: updateResult.count },
        },
        tx
      );

      return updateResult;
    },
    { isolationLevel: 'Serializable' }
  );

  revalidatePath('/services');
  revalidateReportPaths();

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

  // Bulk soft delete and its audit row commit together (#27).
  const result = await withTransaction(async (tx) => {
    const deleteResult = await tx.service.updateMany({
      where: { id: { in: targetIds }, ...invariantWhere },
      data: { deletedAt: new Date() },
    });

    await createAuditLog(
      {
        userId: session.user.id,
        action: 'DELETE',
        tableName: 'services',
        recordId: targetIds.join(','),
        metadata: { bulk: true, count: deleteResult.count },
      },
      tx
    );

    return deleteResult;
  });

  revalidatePath('/services');
  revalidateReportPaths();

  return { success: true, count: result.count };
}

// Loading-order generation lives in src/actions/loading-order-actions.ts
// (#32): createLoadingOrder enforces per-member requireServiceAccess (the
// mandatory guard the deleted generateBulkLoadingOrders stub documented)
// and writes NO Document row until a real stored PDF exists (#34).
