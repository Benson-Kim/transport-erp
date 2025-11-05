/**
 * Users List Component
 * Display and manage users in a table
 */

'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import {
  MoreVertical,
  Key,
  Shield,
  Mail,
  Activity,
} from 'lucide-react';
import { getRoleDisplayName, getRoleBadgeColor } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { UserRole } from '@prisma/client';

interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department?: string | null;
  isActive: boolean;
  emailVerified: Date | null;
  twoFactorEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

interface UsersListProps {
  users: User[];
}

export function UsersList({ users }: UsersListProps) {
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const toggleAllUsers = () => {
    setSelectedUsers((prev) =>
      prev.length === users.length ? [] : users.map((u) => u.id)
    );
  };

  return (
    <div className="overflow-hidden">
      <table className="w-full">
        <thead className="border-b bg-neutral-50 dark:bg-neutral-900">
          <tr>
            <th className="p-4">
              <input
                type="checkbox"
                checked={selectedUsers.length === users.length}
                onChange={toggleAllUsers}
                className="rounded border-neutral-300"
              />
            </th>
            <th className="p-4 text-left text-sm font-medium text-neutral-900 dark:text-neutral-100">
              User
            </th>
            <th className="p-4 text-left text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Role
            </th>
            <th className="p-4 text-left text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Department
            </th>
            <th className="p-4 text-left text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Status
            </th>
            <th className="p-4 text-left text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Last Active
            </th>
            <th className="p-4 text-left text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {users.map((user) => (
            <tr
              key={user.id}
              className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
            >
              <td className="p-4">
                <input
                  type="checkbox"
                  checked={selectedUsers.includes(user.id)}
                  onChange={() => toggleUserSelection(user.id)}
                  className="rounded border-neutral-300"
                />
              </td>
              <td className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-400">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">
                      {user.name}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-neutral-500">
                      <Mail className="h-3 w-3" />
                      {user.email}
                    </div>
                  </div>
                </div>
              </td>
              <td className="p-4">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                    getRoleBadgeColor(user.role)
                  )}
                >
                  {getRoleDisplayName(user.role)}
                </span>
              </td>
              <td className="p-4 text-sm text-neutral-600 dark:text-neutral-400">
                {user.department || '-'}
              </td>
              <td className="p-4">
                <div className="flex items-center gap-2">
                  {user.isActive ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="destructive">Inactive</Badge>
                  )}
                  {user.emailVerified && (
                    <Shield className="h-4 w-4 text-success-600" title="Email Verified" />
                  )}
                  {user.twoFactorEnabled && (
                    <Key className="h-4 w-4 text-primary-600" title="2FA Enabled" />
                  )}
                </div>
              </td>
              <td className="p-4">
                {user.lastLoginAt ? (
                  <div className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
                    <Activity className="h-3 w-3" />
                    {format(new Date(user.lastLoginAt), 'MMM d, h:mm a')}
                  </div>
                ) : (
                  <span className="text-sm text-neutral-400">Never</span>
                )}
              </td>
              <td className="p-4">
                <Button size="icon-sm" variant="ghost">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}