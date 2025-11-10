/**
 * Permission System Configuration
 * Defines all permissions and role mappings for the application
 */

import { UserRole } from '@/app/generated/prisma';

/**
 * Resource types in the system
 */
export const RESOURCES = {
  DASHBOARD: 'dashboard',
  USERS: 'users',
  COMPANIES: 'companies',
  CLIENTS: 'clients',
  SUPPLIERS: 'suppliers',
  SERVICES: 'services',
  LOADING_ORDERS: 'loading_orders',
  INVOICES: 'invoices',
  REPORTS: 'reports',
  SETTINGS: 'settings',
  AUDIT_LOGS: 'audit_logs',
  DOCUMENTS: 'documents',
  PAYMENTS: 'payments',
  NOTIFICATIONS: 'notifications',
} as const;

/**
 * Action types for resources
 */
export const ACTIONS = {
  VIEW: 'view',
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete',
  CANCEL: 'cancel',
  EXPORT: 'export',
  IMPORT: 'import',
  ARCHIVE: 'archive',
  APPROVE: 'approve',
  SEND: 'send',
  MARK_COMPLETED: 'mark_completed',
  MARK_BILLED: 'mark_billed',
  EDIT_COMPLETED: 'edit_completed',
  DELETE_COMPLETED: 'delete_completed',
  MANAGE: 'manage',
} as const;

export type Resource = (typeof RESOURCES)[keyof typeof RESOURCES];
export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];
export type Permission = `${Resource}:${Action}`;

/**
 * Permission Matrix
 * Defines which roles have access to which resource-action combinations
 */
export const PERMISSION_MATRIX: Record<
  Resource,
  Record<Action, UserRole[]>
> = {
  [RESOURCES.DASHBOARD]: {
    [ACTIONS.VIEW]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR, UserRole.VIEWER],
  },

  [RESOURCES.USERS]: {
    [ACTIONS.VIEW]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    [ACTIONS.CREATE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    [ACTIONS.EDIT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    [ACTIONS.DELETE]: [UserRole.SUPER_ADMIN],
    [ACTIONS.MANAGE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },

  [RESOURCES.COMPANIES]: {
    [ACTIONS.VIEW]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.CREATE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    [ACTIONS.EDIT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    [ACTIONS.DELETE]: [UserRole.SUPER_ADMIN],
    [ACTIONS.MANAGE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },

  [RESOURCES.CLIENTS]: {
    [ACTIONS.VIEW]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR, UserRole.VIEWER],
    [ACTIONS.CREATE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.EDIT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.DELETE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    [ACTIONS.EXPORT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.IMPORT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },

  [RESOURCES.SUPPLIERS]: {
    [ACTIONS.VIEW]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR, UserRole.VIEWER],
    [ACTIONS.CREATE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.EDIT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.DELETE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    [ACTIONS.EXPORT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.IMPORT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },

  [RESOURCES.SERVICES]: {
    [ACTIONS.VIEW]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR, UserRole.VIEWER],
    [ACTIONS.CREATE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR],
    [ACTIONS.EDIT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR],
    [ACTIONS.DELETE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.CANCEL]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.MARK_COMPLETED]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.MARK_BILLED]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.EDIT_COMPLETED]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    [ACTIONS.DELETE_COMPLETED]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    [ACTIONS.EXPORT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.APPROVE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.ARCHIVE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
  },

  [RESOURCES.LOADING_ORDERS]: {
    [ACTIONS.VIEW]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR, UserRole.VIEWER],
    [ACTIONS.CREATE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR],
    [ACTIONS.EDIT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.DELETE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    [ACTIONS.SEND]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.EXPORT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
  },

  [RESOURCES.INVOICES]: {
    [ACTIONS.VIEW]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.VIEWER],
    [ACTIONS.CREATE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT],
    [ACTIONS.EDIT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT],
    [ACTIONS.DELETE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    [ACTIONS.APPROVE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.SEND]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT],
    [ACTIONS.EXPORT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT],
  },

  [RESOURCES.REPORTS]: {
    [ACTIONS.VIEW]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.VIEWER],
    [ACTIONS.CREATE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.EXPORT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT],
  },

  [RESOURCES.SETTINGS]: {
    [ACTIONS.VIEW]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.EDIT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    [ACTIONS.MANAGE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },

  [RESOURCES.AUDIT_LOGS]: {
    [ACTIONS.VIEW]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    [ACTIONS.EXPORT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  },

  [RESOURCES.DOCUMENTS]: {
    [ACTIONS.VIEW]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR, UserRole.VIEWER],
    [ACTIONS.CREATE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR],
    [ACTIONS.DELETE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
    [ACTIONS.SEND]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
  },

  [RESOURCES.PAYMENTS]: {
    [ACTIONS.VIEW]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT],
    [ACTIONS.CREATE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT],
    [ACTIONS.EDIT]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTANT],
    [ACTIONS.DELETE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    [ACTIONS.APPROVE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
  },

  [RESOURCES.NOTIFICATIONS]: {
    [ACTIONS.VIEW]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.OPERATOR, UserRole.VIEWER],
    [ACTIONS.MANAGE]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.OPERATOR, UserRole.VIEWER],
  },
} as const;

/**
 * Route access configuration
 */
export const ROUTE_PERMISSIONS: Record<string, UserRole[]> = {
  '/dashboard': [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.OPERATOR, UserRole.VIEWER],
  '/services': [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR, UserRole.VIEWER],
  '/clients': [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR, UserRole.VIEWER],
  '/suppliers': [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.OPERATOR, UserRole.VIEWER],
  '/invoices': [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.VIEWER],
  '/reports': [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT, UserRole.VIEWER],
  '/settings': [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER],
  '/settings/users': [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  '/settings/company': [UserRole.SUPER_ADMIN, UserRole.ADMIN],
  '/audit-logs': [UserRole.SUPER_ADMIN, UserRole.ADMIN],
};

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: UserRole): Permission[] {
  const permissions: Permission[] = [];

  Object.entries(PERMISSION_MATRIX).forEach(([resource, actions]) => {
    Object.entries(actions).forEach(([action, allowedRoles]) => {
      if (allowedRoles.includes(role)) {
        permissions.push(`${resource}:${action}` as Permission);
      }
    });
  });

  return permissions;
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(
  userRole: UserRole | undefined,
  resource: Resource,
  action: Action
): boolean {
  if (!userRole) return false;

  // Super admin has all permissions
  if (userRole === UserRole.SUPER_ADMIN) return true;

  const resourcePermissions = PERMISSION_MATRIX[resource];
  if (!resourcePermissions) return false;

  const allowedRoles = resourcePermissions[action];
  if (!allowedRoles) return false;

  return allowedRoles.includes(userRole);
}

/**
 * Check if a role can access a route
 */
export function canAccessRoute(
  userRole: UserRole | undefined,
  path: string
): boolean {
  if (!userRole) return false;

  // Super admin can access all routes
  if (userRole === UserRole.SUPER_ADMIN) return true;

  // Find the matching route pattern
  const matchingRoute = Object.entries(ROUTE_PERMISSIONS).find(
    ([route]) => path.startsWith(route)
  );

  if (!matchingRoute) return false;

  const [, allowedRoles] = matchingRoute;
  return allowedRoles.includes(userRole);
}

/**
 * Get display name for a role
 */
export function getRoleDisplayName(role: UserRole): string {
  const displayNames: Record<UserRole, string> = {
    [UserRole.SUPER_ADMIN]: 'Super Admin',
    [UserRole.ADMIN]: 'Administrator',
    [UserRole.MANAGER]: 'Manager',
    [UserRole.ACCOUNTANT]: 'Accountant',
    [UserRole.OPERATOR]: 'Operator',
    [UserRole.VIEWER]: 'Viewer',
  };

  return displayNames[role] || role;
}

/**
 * Get role badge color
 */
export function getRoleBadgeColor(role: UserRole): string {
  const colors: Record<UserRole, string> = {
    [UserRole.SUPER_ADMIN]: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    [UserRole.ADMIN]: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    [UserRole.MANAGER]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    [UserRole.ACCOUNTANT]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    [UserRole.OPERATOR]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    [UserRole.VIEWER]: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  };

  return colors[role] || 'bg-gray-100 text-gray-800';
}

/**
 * Permission descriptions for UI
 */
export const PERMISSION_DESCRIPTIONS: Record<Resource, string> = {
  [RESOURCES.DASHBOARD]: 'Access to main dashboard and analytics',
  [RESOURCES.USERS]: 'Manage system users and their permissions',
  [RESOURCES.COMPANIES]: 'Manage company settings and information',
  [RESOURCES.CLIENTS]: 'Manage client accounts and information',
  [RESOURCES.SUPPLIERS]: 'Manage supplier accounts and information',
  [RESOURCES.SERVICES]: 'Manage transport and logistics services',
  [RESOURCES.LOADING_ORDERS]: 'Create and manage loading orders',
  [RESOURCES.INVOICES]: 'Manage invoices and billing',
  [RESOURCES.REPORTS]: 'View and generate reports',
  [RESOURCES.SETTINGS]: 'Access system settings',
  [RESOURCES.AUDIT_LOGS]: 'View system audit logs',
  [RESOURCES.DOCUMENTS]: 'Manage documents and files',
  [RESOURCES.PAYMENTS]: 'Process and manage payments',
  [RESOURCES.NOTIFICATIONS]: 'View and manage notifications',
};