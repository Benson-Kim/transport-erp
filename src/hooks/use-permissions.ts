/**
 * Permission Checking Hook
 * Client-side hook for checking user permissions
 */

'use client';

import { useSession } from 'next-auth/react';
import { useMemo, useCallback } from 'react';
import {
  hasPermission,
  canAccessRoute,
  getRolePermissions,
  Resource,
  Action,
  Permission,
} from '@/lib/permissions';
import { UserRole } from '@/app/generated/prisma';

/**
 * Hook for checking permissions
 */
export function usePermissions() {
  const { data: session, status } = useSession();
  const userRole = session?.user?.role as UserRole | undefined;

  /**
   * Check if user has a specific permission
   */
  const can = useCallback(
    (resource: Resource, action: Action): boolean => {
      if (!userRole) return false;
      return hasPermission(userRole, resource, action);
    },
    [userRole]
  );

  /**
   * Check if user cannot perform an action
   */
  const cannot = useCallback(
    (resource: Resource, action: Action): boolean => {
      return !can(resource, action);
    },
    [can]
  );

  /**
   * Check if user can access a route
   */
  const canAccess = useCallback(
    (path: string): boolean => {
      if (!userRole) return false;
      return canAccessRoute(userRole, path);
    },
    [userRole]
  );

  /**
   * Check multiple permissions at once
   */
  const canAny = useCallback(
    (checks: Array<{ resource: Resource; action: Action }>): boolean => {
      return checks.some(({ resource, action }) => can(resource, action));
    },
    [can]
  );

  /**
   * Check if user has all permissions
   */
  const canAll = useCallback(
    (checks: Array<{ resource: Resource; action: Action }>): boolean => {
      return checks.every(({ resource, action }) => can(resource, action));
    },
    [can]
  );

  /**
   * Get all permissions for current user
   */
  const permissions = useMemo((): Permission[] => {
    if (!userRole) return [];
    return getRolePermissions(userRole);
  }, [userRole]);

  /**
   * Check if user is authenticated
   */
  const isAuthenticated = status === 'authenticated';

  /**
   * Check if user has a specific role
   */
  const hasRole = useCallback(
    (role: UserRole): boolean => {
      return userRole === role;
    },
    [userRole]
  );

  /**
   * Check if user has any of the specified roles
   */
  const hasAnyRole = useCallback(
    (roles: UserRole[]): boolean => {
      if (!userRole) return false;
      return roles.includes(userRole);
    },
    [userRole]
  );

  /**
   * Check if user is admin (SUPER_ADMIN or ADMIN)
   */
  const isAdmin = useMemo(() => {
    return hasAnyRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
  }, [hasAnyRole]);

  /**
   * Check if user is manager or above
   */
  const isManager = useMemo(() => {
    return hasAnyRole([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]);
  }, [hasAnyRole]);

  return {
    // Permission checks
    can,
    cannot,
    canAccess,
    canAny,
    canAll,

    // Role checks
    hasRole,
    hasAnyRole,
    isAdmin,
    isManager,

    // User info
    userRole,
    permissions,
    isAuthenticated,
    isLoading: status === 'loading',

    // Specific common checks (convenience methods)
    canViewUsers: can('users', 'view'),
    canEditUsers: can('users', 'edit'),
    canDeleteUsers: can('users', 'delete'),
    canViewClients: can('clients', 'view'),
    canEditClients: can('clients', 'edit'),
    canDeleteClients: can('clients', 'delete'),
    canViewServices: can('services', 'view'),
    canEditServices: can('services', 'edit'),
    canDeleteServices: can('services', 'delete'),
    canEditCompletedServices: can('services', 'edit_completed'),
    canMarkServicesCompleted: can('services', 'mark_completed'),
    canViewInvoices: can('invoices', 'view'),
    canCreateInvoices: can('invoices', 'create'),
    canViewReports: can('reports', 'view'),
    canViewSettings: can('settings', 'view'),
    canViewAuditLogs: can('audit_logs', 'view'),
  };
}

/**
 * Hook for checking a single permission
 */
export function usePermission(resource: Resource, action: Action): boolean {
  const { can } = usePermissions();
  return can(resource, action);
}

/**
 * Hook for checking route access
 */
export function useRouteAccess(path: string): boolean {
  const { canAccess } = usePermissions();
  return canAccess(path);
}
