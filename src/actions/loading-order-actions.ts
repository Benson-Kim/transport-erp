/**
 * Loading Order Server Actions (#32)
 *
 * The loading order (orden de carga) is the carrier instruction: a grouped,
 * ordered set of services. Deliberately NO pricing fields cross this
 * boundary - the artifact is carrier-facing.
 *
 * PDF generation is NOT implemented here (it ships with #34); pdfPath stays
 * null until a real stored file exists. This module never writes a Document
 * row without a backing file.
 */

'use server';

import { revalidatePath } from 'next/cache';

import type { Prisma } from '@/app/generated/prisma';
import { UserRole } from '@/app/generated/prisma';
import { getServerAuth } from '@/lib/auth';
import {
  createLoadingOrderRecords,
  deriveClientId,
  normalizeServiceIds,
} from '@/lib/loading-orders';
import { RESOURCES, ACTIONS } from '@/lib/permissions';
import {
  createAuditLog,
  createPaginatedResponse,
  getPaginationParams,
  withTransaction,
} from '@/lib/prisma/db-helpers';
import prisma from '@/lib/prisma/prisma';
import {
  checkResourceOwnership,
  ForbiddenError,
  requirePermission,
  requireServiceAccess,
  UnauthorizedError,
} from '@/lib/rbac';
import {
  createLoadingOrderSchema,
  loadingOrderFilterSchema,
} from '@/lib/validations/loading-order-schema';
// ActionResult is defined with the clients vertical (the reference
// template); consolidating the duplicated result types is #57's scope.
import type { ActionResult } from '@/types/client';
import type {
  LoadingOrderCandidateService,
  LoadingOrderDetail,
  LoadingOrderListItem,
  PaginatedLoadingOrders,
} from '@/types/loading-order';

/**
 * Grouping authz (#32, per the !16 bulk doctrine): access must hold for
 * EVERY member service - reject rather than silently filter, so a grouped
 * order can never leak another operator's route data.
 */
async function requireAccessToAllServices(serviceIds: readonly string[]): Promise<void> {
  for (const serviceId of serviceIds) {
    // Sequential by design: requireServiceAccess throws on the first denial.
    // eslint-disable-next-line no-await-in-loop -- fail-fast member guard
    await requireServiceAccess('view', serviceId);
  }
}

/**
 * Typed authz errors surface as honest ActionResult errors (server-action
 * throws are masked in production); everything else is logged and reported
 * with the fallback message. The rbac.ts instanceof contract is preserved
 * here, at the boundary.
 */
function toActionError(error: unknown, fallback: string): { success: false; error: string } {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return { success: false, error: error.message };
  }
  console.error(fallback, error);
  return { success: false, error: error instanceof Error ? error.message : fallback };
}

/**
 * Create a loading order grouping one or more services.
 */
export async function createLoadingOrder(
  data: unknown
): Promise<ActionResult<{ id: string; orderNumber: string }>> {
  try {
    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    await requirePermission(RESOURCES.LOADING_ORDERS, ACTIONS.CREATE);

    const validated = createLoadingOrderSchema.parse(data);
    const serviceIds = normalizeServiceIds(validated.serviceIds);

    await requireAccessToAllServices(serviceIds);

    // Re-asserted inside the transaction's read (TOCTOU, the #20 doctrine):
    // a member soft-deleted or reassigned between the guard above and the
    // write is caught by the count check below - the whole group is
    // rejected, never silently thinned.
    const memberWhere: Prisma.ServiceWhereInput = {
      id: { in: serviceIds },
      deletedAt: null,
      ...(session.user.role === UserRole.OPERATOR
        ? { OR: [{ createdById: session.user.id }, { assignedToId: session.user.id }] }
        : {}),
    };

    const created = await withTransaction(
      async (tx) => {
        const members = await tx.service.findMany({
          where: memberWhere,
          select: { id: true, clientId: true },
        });

        if (members.length !== serviceIds.length) {
          throw new ForbiddenError(
            'One or more selected services no longer exist or are not accessible'
          );
        }

        const order = await createLoadingOrderRecords(tx, {
          serviceIds,
          clientId: deriveClientId(members.map((member) => member.clientId)),
          notes: validated.notes ? validated.notes : null,
          generatedById: session.user.id,
        });

        // Audit row commits with the mutation it records (#27).
        await createAuditLog(
          {
            userId: session.user.id,
            action: 'CREATE',
            tableName: 'loading_orders',
            recordId: order.id,
            newValues: { orderNumber: order.orderNumber, serviceIds },
            metadata: { serviceCount: serviceIds.length },
          },
          tx
        );

        return order;
      },
      { isolationLevel: 'Serializable' }
    );

    revalidatePath('/documents/loading-orders');
    for (const serviceId of serviceIds) {
      revalidatePath(`/services/${serviceId}`);
    }

    return { success: true, data: created };
  } catch (error) {
    return toActionError(error, 'Failed to create loading order');
  }
}

/**
 * Gated selection review for the create page: the same per-member guards as
 * createLoadingOrder, returning carrier-facing display rows in input order.
 */
export async function getServicesForLoadingOrder(
  serviceIds: string[]
): Promise<ActionResult<LoadingOrderCandidateService[]>> {
  try {
    await requirePermission(RESOURCES.LOADING_ORDERS, ACTIONS.CREATE);

    const { serviceIds: validatedIds } = createLoadingOrderSchema
      .pick({ serviceIds: true })
      .parse({ serviceIds });
    const ids = normalizeServiceIds(validatedIds);

    await requireAccessToAllServices(ids);

    const services = await prisma.service.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        serviceNumber: true,
        date: true,
        origin: true,
        destination: true,
        status: true,
        client: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    });

    if (services.length !== ids.length) {
      return { success: false, error: 'One or more selected services no longer exist' };
    }

    // findMany does not preserve `in` order; the selection order defines
    // the proposed loading positions.
    const byId = new Map(services.map((service) => [service.id, service]));
    const data: LoadingOrderCandidateService[] = [];
    for (const id of ids) {
      const service = byId.get(id);
      if (!service) continue;
      data.push({
        id: service.id,
        serviceNumber: service.serviceNumber,
        date: service.date,
        origin: service.origin,
        destination: service.destination,
        status: service.status,
        clientName: service.client.name,
        supplierName: service.supplier.name,
      });
    }

    return { success: true, data };
  } catch (error) {
    return toActionError(error, 'Failed to load services for the loading order');
  }
}

/**
 * Paginated loading-order list.
 */
export async function getLoadingOrders(
  params: Record<string, unknown>
): Promise<ActionResult<PaginatedLoadingOrders>> {
  try {
    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    await requirePermission(RESOURCES.LOADING_ORDERS, ACTIONS.VIEW);

    const { search, page, limit, sortBy, sortOrder } = loadingOrderFilterSchema.parse(params);

    const where: Prisma.LoadingOrderWhereInput = {
      deletedAt: null,
      // OPERATOR is ownership-scoped through generatedById - the same authz
      // path checkResourceOwnership('loading_orders') uses (src/lib/rbac.ts);
      // no parallel check invented.
      ...(session.user.role === UserRole.OPERATOR ? { generatedById: session.user.id } : {}),
      ...(search ? { orderNumber: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const { skip, take } = getPaginationParams({ page, limit });

    const [rows, total] = await Promise.all([
      prisma.loadingOrder.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
        include: {
          generatedBy: { select: { name: true } },
          _count: { select: { services: true } },
        },
      }),
      prisma.loadingOrder.count({ where }),
    ]);

    const data: LoadingOrderListItem[] = rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      generatedAt: row.generatedAt,
      generatedByName: row.generatedBy.name,
      servicesCount: row._count.services,
      hasPdf: row.pdfPath !== null,
      notes: row.notes,
    }));

    return { success: true, data: createPaginatedResponse(data, total, { page, limit }) };
  } catch (error) {
    return toActionError(error, 'Failed to fetch loading orders');
  }
}

/**
 * Loading-order detail with member services in position order.
 */
export async function getLoadingOrderById(id: string): Promise<ActionResult<LoadingOrderDetail>> {
  try {
    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    await requirePermission(RESOURCES.LOADING_ORDERS, ACTIONS.VIEW);

    if (session.user.role === UserRole.OPERATOR) {
      const owns = await checkResourceOwnership('loading_orders', id);
      if (!owns) {
        return {
          success: false,
          error: 'Forbidden: you do not have access to this loading order',
        };
      }
    }

    const order = await prisma.loadingOrder.findFirst({
      where: { id, deletedAt: null },
      include: {
        generatedBy: { select: { name: true } },
        services: {
          orderBy: { position: 'asc' },
          include: {
            service: {
              select: {
                id: true,
                serviceNumber: true,
                date: true,
                origin: true,
                destination: true,
                vehiclePlate: true,
                driverName: true,
                status: true,
                client: { select: { name: true } },
                supplier: { select: { name: true } },
              },
            },
          },
        },
      },
    });

    if (!order) {
      return { success: false, error: 'Loading order not found' };
    }

    const detail: LoadingOrderDetail = {
      id: order.id,
      orderNumber: order.orderNumber,
      generatedAt: order.generatedAt,
      generatedByName: order.generatedBy.name,
      notes: order.notes,
      hasPdf: order.pdfPath !== null,
      services: order.services.map((link) => ({
        position: link.position,
        id: link.service.id,
        serviceNumber: link.service.serviceNumber,
        date: link.service.date,
        origin: link.service.origin,
        destination: link.service.destination,
        vehiclePlate: link.service.vehiclePlate,
        driverName: link.service.driverName,
        status: link.service.status,
        clientName: link.service.client.name,
        supplierName: link.service.supplier.name,
      })),
    };

    return { success: true, data: detail };
  } catch (error) {
    return toActionError(error, 'Failed to fetch loading order');
  }
}
