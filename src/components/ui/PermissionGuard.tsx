/**
 * Permission Guard Component
 * Conditionally renders children based on user permissions
 */

'use client';

import { ReactNode } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { Resource, Action } from '@/lib/permissions';
import { UserRole } from '@/app/generated/prisma';

interface PermissionGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
  resource?: Resource;
  action?: Action;
  resources?: Array<{ resource: Resource; action: Action }>;
  requireAll?: boolean;
  roles?: UserRole[];
  customCheck?: () => boolean;
  showMessage?: boolean;
}

/**
 * Component-level permission guard
 */
export function PermissionGuard({
  children,
  fallback = null,
  resource,
  action,
  resources,
  requireAll = false,
  roles,
  customCheck,
  showMessage = false,
}: PermissionGuardProps) {
  const { can, canAll, canAny, hasAnyRole, isLoading } = usePermissions();
  
  // Don't render anything while loading
  if (isLoading) {
    return null;
  }
  
  let hasPermission = false;
  
  // Custom check takes priority
  if (customCheck) {
    hasPermission = customCheck();
  }
  // Check roles
  else if (roles && roles.length > 0) {
    hasPermission = hasAnyRole(roles);
  }
  // Check multiple resources
  else if (resources && resources.length > 0) {
    hasPermission = requireAll
      ? canAll(resources)
      : canAny(resources);
  }
  // Check single resource/action
  else if (resource && action) {
    hasPermission = can(resource, action);
  }
  // Default to true if no checks specified
  else {
    hasPermission = true;
  }
  
  if (hasPermission) {
    return <>{children}</>;
  }
  
  if (showMessage) {
    return (
      <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200">
        You don&apos;t have permission to view this content.
      </div>
    );
  }
  
  return <>{fallback}</>;
}

/**
 * Button wrapper that disables based on permissions
 */
interface PermissionButtonProps {
  children: ReactNode;
  resource: Resource;
  action: Action;
  onClick?: () => void;
  className?: string;
  showTooltip?: boolean;
}

export function PermissionButton({
  children,
  resource,
  action,
  onClick,
  className,
  showTooltip = true,
}: PermissionButtonProps) {
  const { can } = usePermissions();
  const hasPermission = can(resource, action);
  
  return (
    <button
      onClick={hasPermission ? onClick : undefined}
      disabled={!hasPermission}
      className={className}
      title={
        !hasPermission && showTooltip
          ? `You don't have permission to ${action} ${resource}`
          : undefined
      }
    >
      {children}
    </button>
  );
}

/**
 * Show/hide content based on permissions
 */
export function Show({
  when,
  children,
  fallback,
}: {
  when: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return when ? <>{children}</> : <>{fallback}</>;
}

/**
 * Hide content based on permissions
 */
export function Hide({
  when,
  children,
}: {
  when: boolean;
  children: ReactNode;
}) {
  return when ? null : <>{children}</>;
}