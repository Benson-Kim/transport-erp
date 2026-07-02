/**
 * Role-Based Access Control Utilities
 * Helper functions for permission checking and enforcement
 */

import { AuditAction, UserRole } from '@/app/generated/prisma';
import { getServerAuth } from '@/lib/auth';
import type {
  Resource,
  Action,
  Permission} from '@/lib/permissions';
import {
  hasPermission,
  canAccessRoute,
  getRolePermissions,
} from '@/lib/permissions';
import prisma from '@/lib/prisma/prisma';

/**
 * Typed authorization errors (review !16 finding 5).
 *
 * The contract between rbac.ts and pages/actions: catch by instanceof and
 * rethrow everything else, so infrastructure failures (DB outages) are never
 * masked as authorization decisions. Adopt in all subsequent security work
 * items (#21, #22, #23).
 */
export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Check if current user has permission for an action
 */
export async function checkPermission(resource: Resource, action: Action): Promise<boolean> {
  const session = await getServerAuth();

  // Deactivated/revoked sessions (isActive:false, set by the jwt re-check,
  // #15) are treated as unauthenticated on every permission-gated path.
  if (!session?.user || session.user.isActive === false) {
    return false;
  }

  return hasPermission(session.user.role, resource, action);
}

/**
 * Require permission for an action (throws if not authorized)
 */
export async function requirePermission(resource: Resource, action: Action): Promise<void> {
  const hasAccess = await checkPermission(resource, action);

  if (!hasAccess) {
    throw new ForbiddenError(`Insufficient permissions: ${resource}:${action} required`);
  }
}

/**
 * Check if current user can access a route
 */
export async function checkRouteAccess(path: string): Promise<boolean> {
  const session = await getServerAuth();

  if (!session?.user || session.user.isActive === false) {
    return false;
  }

  return canAccessRoute(session.user.role, path);
}

/**
 * Get current user's permissions
 */
export async function getCurrentUserPermissions(): Promise<Permission[]> {
  const session = await getServerAuth();

  if (!session?.user) {
    return [];
  }

  return getRolePermissions(session.user.role);
}

/**
 * Check if user owns a resource
 */
export async function checkResourceOwnership(
  resource: Resource,
  resourceId: string,
  userId?: string
): Promise<boolean> {
  const session = await getServerAuth();

  if (!session?.user) {
    return false;
  }

  const targetUserId = userId || session.user.id;

  // Check based on resource type
  switch (resource) {
    case 'services': {
      const service = await prisma.service.findUnique({
        where: { id: resourceId },
        select: { createdById: true, assignedToId: true },
      });

      return service?.createdById === targetUserId || service?.assignedToId === targetUserId;
    }

    case 'invoices': {
      const invoice = await prisma.invoice.findUnique({
        where: { id: resourceId },
        select: { createdById: true },
      });

      return invoice?.createdById === targetUserId;
    }

    case 'loading_orders': {
      const loadingOrder = await prisma.loadingOrder.findUnique({
        where: { id: resourceId },
        select: { generatedById: true },
      });

      return loadingOrder?.generatedById === targetUserId;
    }

    default:
      return false;
  }
}

/**
 * Require auth + a services permission, and enforce object-level ownership
 * for OPERATOR (who may only touch services they created or are assigned to).
 * ADMIN / MANAGER / SUPER_ADMIN are not ownership-scoped per the matrix.
 *
 * Throws 'Unauthorized' when unauthenticated or revoked (#15), 'Forbidden'
 * otherwise. Centralizes the IDOR guard so every service action enforces it
 * uniformly. (#16)
 */
export async function requireServiceAccess(action: Action, serviceId: string): Promise<void> {
  const session = await getServerAuth();

  if (!session?.user || session.user.isActive === false) {
    throw new UnauthorizedError();
  }

  if (!hasPermission(session.user.role, 'services', action)) {
    throw new ForbiddenError(`Insufficient permissions: services:${action} required`);
  }

  // Only OPERATOR is ownership-scoped.
  if (session.user.role !== UserRole.OPERATOR) {
    return;
  }

  const owns = await checkResourceOwnership('services', serviceId, session.user.id);
  if (!owns) {
    throw new ForbiddenError('Forbidden: you do not have access to this service');
  }
}

/**
 * Check if user can perform action on specific resource
 */
export async function checkResourcePermission(
  resource: Resource,
  action: Action,
  resourceId?: string
): Promise<boolean> {
  const session = await getServerAuth();

  if (!session?.user) {
    return false;
  }

  // First check general permission
  const hasGeneralPermission = hasPermission(session.user.role, resource, action);

  if (!hasGeneralPermission) {
    return false;
  }

  // For certain actions, check ownership or special conditions
  if (resourceId && action === 'edit') {
    // Special case: Operators can only edit non-completed services
    if (session.user.role === UserRole.OPERATOR && resource === 'services') {
      const service = await prisma.service.findUnique({
        where: { id: resourceId },
        select: { status: true },
      });

      return service?.status !== 'COMPLETED' && service?.status !== 'INVOICED';
    }
  }

  return true;
}

/**
 * Log permission check for audit
 */
export async function auditPermissionCheck(
  resource: Resource,
  action: Action,
  allowed: boolean,
  details?: Record<string, any>
): Promise<void> {
  const session = await getServerAuth();

  if (!session?.user) {
    return;
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: AuditAction.PERMISSION_CHECK,
      tableName: 'permissions',
      recordId: `${resource}:${action}`,
      metadata: {
        resource,
        action,
        allowed,
        role: session.user.role,
        ...details,
      },
    },
  });
}

/**
 * Get resources accessible by a role
 */
export function getAccessibleResources(role: UserRole): Resource[] {
  const permissions = getRolePermissions(role);
  const resources = new Set<Resource>();

  permissions.forEach((permission) => {
    const [resource] = permission.split(':') as [Resource];
    resources.add(resource);
  });

  return Array.from(resources);
}

/**
 * Check multiple permissions at once
 */
export async function checkMultiplePermissions(
  checks: Array<{ resource: Resource; action: Action }>
): Promise<Record<string, boolean>> {
  const session = await getServerAuth();

  if (!session?.user) {
    return checks.reduce(
      (acc, check) => ({
        ...acc,
        [`${check.resource}:${check.action}`]: false,
      }),
      {}
    );
  }

  const results: Record<string, boolean> = {};

  for (const check of checks) {
    const key = `${check.resource}:${check.action}`;
    results[key] = hasPermission(session.user.role, check.resource, check.action);
  }

  return results;
}

/**
 * Permission enforcement wrapper for server actions
 */
export function withPermission<T extends (...args: any[]) => any>(
  resource: Resource,
  action: Action,
  handler: T
): T {
  return (async (...args: Parameters<T>) => {
    await requirePermission(resource, action);
    return handler(...args);
  }) as T;
}

/**
 * Check if user has any of the specified permissions
 */
export async function hasAnyPermission(
  permissions: Array<{ resource: Resource; action: Action }>
): Promise<boolean> {
  const session = await getServerAuth();

  if (!session?.user) {
    return false;
  }

  return permissions.some(({ resource, action }) =>
    hasPermission(session.user.role, resource, action)
  );
}

/**
 * Check if user has all of the specified permissions
 */
export async function hasAllPermissions(
  permissions: Array<{ resource: Resource; action: Action }>
): Promise<boolean> {
  const session = await getServerAuth();

  if (!session?.user) {
    return false;
  }

  return permissions.every(({ resource, action }) =>
    hasPermission(session.user.role, resource, action)
  );
}
