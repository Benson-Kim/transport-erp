/**
 * Authorization Module
 *
 * Single-module unification of the permission matrix (what roles can do)
 * and the RBAC enforcement layer (session-aware guards). One import path,
 * one seam for tests.
 *
 * Historical note: was split across permissions.ts (matrix + pure checks)
 * and rbac.ts (session-aware guards). Merged for locality — all
 * authorization logic lives here.
 */

// Re-export everything from the matrix module (unchanged — too many importers)
export {
  RESOURCES,
  ACTIONS,
  PERMISSION_MATRIX,
  ROUTE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  getRolePermissions,
  hasPermission,
  canAccessRoute,
  getRoleDisplayName,
  getRoleBadgeColor,
} from '@/lib/permissions';

export type { Resource, Action, Permission } from '@/lib/permissions';

// Re-export everything from the enforcement module
export {
  checkPermission,
  requirePermission,
  checkRouteAccess,
  getCurrentUserPermissions,
  checkResourceOwnership,
  checkResourcePermission,
  auditPermissionCheck,
  getAccessibleResources,
  checkMultiplePermissions,
  withPermission,
  hasAnyPermission,
  hasAllPermissions,
} from '@/lib/rbac';
