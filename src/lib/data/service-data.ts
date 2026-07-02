/**
 * Service data access (server module, NOT a 'use server' action module).
 *
 * Reads live here so they can be wrapped in React cache() for per-request
 * deduplication and shared between a page and its generateMetadata without
 * double-fetching ('use server' modules may only export async functions, so
 * cache() cannot wrap an export there). Every read is gated with
 * requireServiceAccess so an ungated fetch cannot leak service data
 * (e.g. via <title>). (#16)
 */

import { cache } from 'react';

import prisma from '@/lib/prisma/prisma';
import { requireServiceAccess } from '@/lib/rbac';

/**
 * Get a service with all details. Auth + services:view + ownership enforced.
 * Cached per request so page + generateMetadata share one fetch.
 */
export const getServiceWithDetails = cache(async (serviceId: string) => {
  await requireServiceAccess('view', serviceId);

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
});

/** Full service payload returned by getServiceWithDetails. */
export type ServiceWithDetails = NonNullable<Awaited<ReturnType<typeof getServiceWithDetails>>>;
