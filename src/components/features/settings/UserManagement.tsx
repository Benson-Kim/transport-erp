// /components/features/settings/UserManagement.tsx
'use client';

import { useState, useMemo, useCallback } from 'react';

import { useRouter } from 'next/navigation';

import { format } from 'date-fns';
import {
  UserPlus,
  MoreVertical,
  Edit,
  UserX,
  Trash2,
  Shield,
  Search,
  User as UserIcon,
  AlertTriangle,
} from 'lucide-react';

import {
  deleteUser,
  toggleUserStatus,
  bulkDeactivateUsers,
  bulkDeleteUsers,
} from '@/actions/user-actions';
import { UserRole } from '@/app/generated/prisma';
import {
  Button,
  Badge,
  Modal,
  DropdownMenu,
  Input,
  Select,
  DataTable,
  type Column,
} from '@/components/ui';
import { usePermissions } from '@/hooks';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils/cn';

import { PermissionMatrix } from './PermissionMatrix';
import { UserForm } from './UserForm';

interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  avatar?: string | null;
  lastLoginAt?: Date | null;
  createdAt: Date;
  _count: {
    services: number;
  };
}

interface UserManagementProps {
  users: User[];
  currentUserId: string;
  currentUserRole: UserRole;
}

/**
 * Simple Avatar component using initials
 */
function UserAvatar({
  name,
  src,
  size = 'md',
}: {
  name: string;
  src?: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  };

  if (src) {
    return (
      <img src={src} alt={name} className={cn('rounded-full object-cover', sizeClasses[size])} />
    );
  }

  return (
    <div
      className={cn(
        'rounded-full bg-primary/10 text-primary font-medium flex items-center justify-center',
        sizeClasses[size]
      )}
    >
      {initials || <UserIcon className="w-4 h-4" />}
    </div>
  );
}

/**
 * Confirmation Dialog using Modal
 */
function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger' | 'warning';
}) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={title} size="sm">
      <Modal.Body>
        {variant === 'danger' && (
          <div className="flex items-start gap-3 mb-4">
            <div className="shrink-0 w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-danger" />
            </div>
            <div className="flex-1">
              <p className="text-sm text-neutral-600"> {description} </p>
            </div>
          </div>
        )}
        {variant !== 'danger' && <p className="text-sm text-neutral-600 mb-4"> {description} </p>}
      </Modal.Body>
      <Modal.Footer>
        <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
          {cancelText}
        </Button>
        <Button
          type="button"
          variant={variant === 'danger' ? 'danger' : 'primary'}
          onClick={handleConfirm}
          loading={loading}
        >
          {confirmText}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

/**
 * User management table with CRUD operations
 */
export function UserManagement({ users, currentUserId, currentUserRole }: UserManagementProps) {
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPermissions, setShowPermissions] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<'deactivate' | 'delete' | null>(null);
  const router = useRouter();

  // Filter users to only show Admin, Manager, Operator roles
  const relevantRoles = [
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.OPERATOR,
    UserRole.ACCOUNTANT,
    UserRole.VIEWER,
  ];
  const filteredByRole = users.filter(
    (user) => relevantRoles.includes(user.role) || user.role === UserRole.SUPER_ADMIN
  );

  /**
   * Apply search and filters
   */
  const filteredUsers = useMemo(() => {
    let result = filteredByRole;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (user) =>
          user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)
      );
    }

    // Role filter
    if (roleFilter !== 'all') {
      result = result.filter((user) => {
        if (roleFilter === 'admin')
          return user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
        if (roleFilter === 'manager') return user.role === UserRole.MANAGER;
        if (roleFilter === 'operator') return user.role === UserRole.OPERATOR;
        return true;
      });
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((user) => {
        if (statusFilter === 'active') return user.isActive;
        if (statusFilter === 'inactive') return !user.isActive;
        return true;
      });
    }

    return result;
  }, [filteredByRole, searchQuery, roleFilter, statusFilter]);

  /**
   * Table columns configuration
   */
  const columns: Column<User>[] = useMemo(
    () => [
      {
        key: 'avatar',
        header: '',
        accessor: (row) => <UserAvatar name={row.name} src={row.avatar} size="sm" />,
        width: '50px',
      },
      {
        key: 'name',
        header: 'Name',
        accessor: (row) => (
          <div>
            <div className="font-medium">{row.name}</div>
            {row.id === currentUserId && <span className="text-xs text-neutral-500">(You)</span>}
          </div>
        ),
        sortable: true,
      },
      {
        key: 'email',
        header: 'Email',
        accessor: (row) => row.email,
        sortable: true,
      },
      {
        key: 'role',
        header: 'Role',
        accessor: (row) => {
          const roleDisplay =
            row.role === UserRole.SUPER_ADMIN
              ? 'Admin'
              : row.role === UserRole.ADMIN
                ? 'Admin'
                : row.role === UserRole.MANAGER
                  ? 'Manager'
                  : row.role === UserRole.OPERATOR
                    ? 'Operator'
                    : row.role;

          const variant =
            row.role === UserRole.SUPER_ADMIN || row.role === UserRole.ADMIN
              ? 'active'
              : row.role === UserRole.MANAGER
                ? 'billed'
                : 'default';

          return <Badge variant={variant}>{roleDisplay}</Badge>;
        },
      },
      {
        key: 'status',
        header: 'Status',
        accessor: (row) => (
          <Badge variant={row.isActive ? 'completed' : 'cancelled'}>
            {row.isActive ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
      {
        key: 'lastLogin',
        header: 'Last Login',
        accessor: (row) =>
          row.lastLoginAt ? format(row.lastLoginAt, 'dd/MM/yyyy HH:mm') : 'Never',
        sortable: true,
        sortKey: 'lastLoginAt',
      },
    ],
    [currentUserId]
  );

  /**
   * Handle user deactivation
   */
  const handleDeactivate = useCallback(
    async (user: User) => {
      try {
        const result = await toggleUserStatus(user.id);
        if (result.success) {
          toast.success(
            user.isActive ? 'User deactivated' : 'User activated',
            `${user.name} has been ${user.isActive ? 'deactivated' : 'activated'}`
          );
          router.refresh();
        }
      } catch (error) {
        toast.error('Error', error instanceof Error ? error.message : 'Operation failed');
      }
    },
    [router]
  );

  /**
   * Handle user deletion
   */
  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;

    // Check for dependencies
    if (deleteConfirm._count.services > 0) {
      toast.error(
        'Cannot delete user',
        `${deleteConfirm.name} has ${deleteConfirm._count.services} associated services`
      );
      setDeleteConfirm(null);
      return;
    }

    try {
      const result = await deleteUser(deleteConfirm.id);
      if (result.success) {
        toast.success('User deleted', `${deleteConfirm.name} has been deleted`);
        router.refresh();
      }
    } catch (error) {
      toast.error('Error', error instanceof Error ? error.message : 'Failed to delete user');
    } finally {
      setDeleteConfirm(null);
    }
  }, [deleteConfirm, router]);

  /**
   * Handle bulk deactivation
   */
  const handleBulkDeactivate = useCallback(async () => {
    const usersToDeactivate = selectedUsers.filter(
      (id) => id !== currentUserId && filteredUsers.find((u) => u.id === id && u.isActive)
    );

    if (usersToDeactivate.length === 0) {
      toast.warning('No users to deactivate', 'Select active users to deactivate');
      return;
    }

    try {
      await bulkDeactivateUsers(usersToDeactivate);
      toast.success('Users deactivated', `${usersToDeactivate.length} users have been deactivated`);
      router.refresh();
      setSelectedUsers([]);
    } catch (error) {
      toast.error('Error', 'Failed to deactivate some users');
    }
  }, [selectedUsers, currentUserId, filteredUsers, router]);

  /**
   * Handle bulk deletion
   */
  const handleBulkDelete = useCallback(async () => {
    const usersToDelete = selectedUsers.filter((id) => id !== currentUserId);

    if (usersToDelete.length === 0) {
      toast.warning('No users to delete', 'Select users to delete');
      return;
    }

    try {
      await bulkDeleteUsers(usersToDelete);
      toast.success('Users deleted', `${usersToDelete.length} users have been deleted`);
      router.refresh();
      setSelectedUsers([]);
      setBulkAction(null);
    } catch (error) {
      toast.error('Error', 'Failed to delete some users');
    }
  }, [selectedUsers, currentUserId, router]);

  const isAdmin = currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.SUPER_ADMIN;
  /**
   * Row actions dropdown
   */
  const rowActions = useCallback(
    (user: User) => {
      const permissions = usePermissions();
      const isSelf = user.id === currentUserId;

      if (!isAdmin || isSelf) return null;

      const actions = [
        {
          id: 'edit',
          label: 'Edit',
          icon: <Edit className="h-4 w-4" />,
          onClick: () => {
            setEditingUser(user);
            setUserFormOpen(true);
          },
          show: permissions.can('users', 'create'),
        },
        {
          id: 'deactivate',
          label: user.isActive ? 'Deactivate' : 'Activate',
          icon: <UserX className="h-4 w-4" />,
          onClick: () => handleDeactivate(user),
          show: permissions.can('users', 'manage'),
        },
        { id: 'divider', divider: true },
        {
          id: 'delete',
          label: 'Delete',
          icon: <Trash2 className="h-4 w-4" />,
          onClick: () => setDeleteConfirm(user),
          danger: true,
          show: permissions.can('users', 'delete'),
        },
      ]
        .filter((a) => a.show)
        .map(({ show, ...rest }) => rest);

      if (actions.length === 0) return null;

      console.log(actions);

      return (
        <DropdownMenu
          position="left"
          trigger={<Button variant="ghost" size="sm" icon={<MoreVertical className="h-4 w-4" />} />}
          items={[
            {
              id: 'edit',
              label: 'Edit',
              icon: <Edit className="h-4 w-4" />,
              onClick: () => {
                setEditingUser(user);
                setUserFormOpen(true);
              },
            },
            {
              id: 'deactivate',
              label: user.isActive ? 'Deactivate' : 'Activate',
              icon: <UserX className="h-4 w-4" />,
              onClick: () => handleDeactivate(user),
            },
            { id: 'divider', divider: true },
            {
              id: 'delete',
              label: 'Delete',
              icon: <Trash2 className="h-4 w-4" />,
              onClick: () => setDeleteConfirm(user),
              danger: true,
            },
          ]}
          align="right"
        />
      );
    },
    [currentUserId, currentUserRole, handleDeactivate]
  );

  return (
    <>
      {/* Search and Filters Bar */}
      <div className="card p-4 mb-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <Input
              type="search"
              placeholder="Search users (name, email)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              prefix={<Search className="h-4 w-4" />}
            />
          </div>

          <div className="flex gap-2">
            <Select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Roles' },
                { value: 'admin', label: 'Admin' },
                { value: 'manager', label: 'Manager' },
                { value: 'operator', label: 'Operator' },
              ]}
              renderCustom={false}
            />

            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              renderCustom={false}
            />

            {isAdmin && (
              <Button
                icon={<UserPlus className="h-4 w-4" />}
                onClick={() => {
                  setEditingUser(null);
                  setUserFormOpen(true);
                }}
              >
                Add User
              </Button>
            )}
          </div>
        </div>

        {/* Bulk Actions */}
        {isAdmin && selectedUsers.length > 0 && (
          <div className="flex items-center gap-4 mt-4 pt-4 border-t">
            <span className="text-sm text-neutral-600">
              {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} selected
            </span>
            <Button variant="secondary" size="sm" onClick={handleBulkDeactivate}>
              Deactivate Selected
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setBulkAction('delete')}
              className="text-danger"
            >
              Delete Selected
            </Button>
          </div>
        )}
      </div>

      {/* Users Table */}
      <DataTable
        data={filteredUsers}
        columns={columns}
        selectable={isAdmin}
        selectedRows={selectedUsers}
        onSelectionChange={setSelectedUsers}
        rowActions={rowActions}
        defaultSort={{ key: 'name', direction: 'asc' }}
        rowClassName={(row) =>
          cn(row.id === currentUserId && 'bg-neutral-50', !row.isActive && 'opacity-60')
        }
      />

      {/* Permission Matrix Button */}
      <div className="mt-4">
        <Button
          variant="secondary"
          icon={<Shield className="h-4 w-4" />}
          onClick={() => setShowPermissions(true)}
        >
          View Permission Matrix
        </Button>
      </div>

      {/* User Form Modal */}
      <Modal
        isOpen={userFormOpen}
        onClose={() => {
          setUserFormOpen(false);
          setEditingUser(null);
        }}
        title={editingUser ? 'Edit User' : 'Add User'}
        size="lg"
      >
        <Modal.Body>
          <UserForm
            user={editingUser}
            onSuccess={() => {
              setUserFormOpen(false);
              setEditingUser(null);
              router.refresh();
            }}
            onCancel={() => {
              setUserFormOpen(false);
              setEditingUser(null);
            }}
          />
        </Modal.Body>
      </Modal>

      {/* Permission Matrix Modal */}
      <Modal
        isOpen={showPermissions}
        onClose={() => setShowPermissions(false)}
        title="Permission Matrix"
        description="Role-based access control for system features"
        size="lg"
      >
        <Modal.Body>
          <PermissionMatrix />
        </Modal.Body>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={confirmDelete}
        title="Delete User"
        description={
          deleteConfirm?._count.services
            ? `Cannot delete ${deleteConfirm.name}. User has ${deleteConfirm._count.services} associated services.`
            : `Are you sure you want to delete ${deleteConfirm?.name}? This action cannot be undone.`
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={bulkAction === 'delete'}
        onClose={() => setBulkAction(null)}
        onConfirm={handleBulkDelete}
        title="Delete Users"
        description={`Are you sure you want to delete ${selectedUsers.length} users? This action cannot be undone.`}
        confirmText="Delete All"
        cancelText="Cancel"
        variant="danger"
      />
    </>
  );
}
