// /components/features/settings/PermissionMatrix.tsx
'use client';

import { UserRole } from '@/app/generated/prisma';
import {
  RESOURCES,
  // ACTIONS,
  PERMISSION_MATRIX,
  getRoleDisplayName,
  PERMISSION_DESCRIPTIONS,
} from '@/lib/permissions';
import { Check, X, Info } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/utils/cn';

/**
 * Permission Matrix Display Component
 */
export function PermissionMatrix() {
  const roles: UserRole[] = [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.ACCOUNTANT,
    UserRole.OPERATOR,
    UserRole.VIEWER,
  ];

  const resources = Object.values(RESOURCES);
  // const actions = Object.values(ACTIONS);

  /**
   * Check if a role has permission for resource:action
   */
  const hasPermission = (role: UserRole, resource: string, action: string): boolean => {
    if (role === UserRole.SUPER_ADMIN) return true;

    const resourcePermissions = PERMISSION_MATRIX[resource as keyof typeof PERMISSION_MATRIX];
    if (!resourcePermissions) return false;

    const allowedRoles = resourcePermissions[action as keyof typeof resourcePermissions];
    return allowedRoles?.includes(role) || false;
  };

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-success-100 rounded flex items-center justify-center">
            <Check className="h-4 w-4 text-success-600" />
          </div>
          <span>Has Permission</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-neutral-100 rounded flex items-center justify-center">
            <X className="h-4 w-4 text-neutral-400" />
          </div>
          <span>No Permission</span>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Resource</th>
              <th className="text-left p-2">Action</th>
              {roles.map((role) => (
                <th key={role} className="text-center p-2 min-w-[100px]">
                  <div className="font-medium">{getRoleDisplayName(role)}</div>
                  {role === UserRole.SUPER_ADMIN && (
                    <div className="text-xs text-neutral-500 font-normal">All Access</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resources.map((resource) => {
              const resourceActions = Object.keys(
                PERMISSION_MATRIX[resource as keyof typeof PERMISSION_MATRIX] || {}
              );

              return resourceActions.map((action, actionIndex) => (
                <tr
                  key={`${resource}-${action}`}
                  className={cn('border-b', actionIndex === 0 && 'border-t-2')}
                >
                  {actionIndex === 0 && (
                    <td rowSpan={resourceActions.length} className="p-2 font-medium bg-neutral-50">
                      <div className="flex items-center gap-2">
                        <span className="capitalize">{resource.replace(/_/g, ' ')}</span>
                        <Tooltip
                          content={
                            PERMISSION_DESCRIPTIONS[
                              resource as keyof typeof PERMISSION_DESCRIPTIONS
                            ]
                          }
                        >
                          <Info className="h-3 w-3 text-neutral-400" />
                        </Tooltip>
                      </div>
                    </td>
                  )}
                  <td className="p-2 capitalize">{action.replace(/_/g, ' ')}</td>
                  {roles.map((role) => (
                    <td key={role} className="text-center p-2">
                      {hasPermission(role, resource, action) ? (
                        <div className="inline-flex items-center justify-center w-6 h-6 bg-success-100 rounded">
                          <Check className="h-4 w-4 text-success-600" />
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-center w-6 h-6 bg-neutral-100 rounded">
                          <X className="h-4 w-4 text-neutral-400" />
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>

      {/* Notes */}
      <div className="bg-neutral-50 p-4 rounded-lg text-sm space-y-2">
        <p className="font-medium">Notes:</p>
        <ul className="space-y-1 text-neutral-600">
          <li>• Super Admins have unrestricted access to all system features</li>
          <li>• Operators can edit services only if they are not completed</li>
          <li>• Only users with delete permissions can permanently remove records</li>
          <li>• Audit logs track all user actions for security and compliance</li>
        </ul>
      </div>
    </div>
  );
}
