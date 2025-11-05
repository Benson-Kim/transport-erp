/**
 * User Management Page
 * Admin interface for managing system users
 */

import { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import { getUsers } from '@/actions/user-actions';
import { UsersList } from '@/components/features/users/users-list';
import { CreateUserDialog } from '@/components/features/users/create-user-dialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';

export const metadata: Metadata = {
  title: 'User Management | Settings',
  description: 'Manage system users and their permissions',
};

export default async function UsersPage() {
  // Require admin role
  await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
  
  // Fetch users
  const users = await getUsers();
  
  return (
    <div className="container py-6">
      <PageHeader
        title="User Management"
        description="Manage system users, roles, and permissions"
      >
        <CreateUserDialog />
      </PageHeader>
      
      <div className="mt-6 grid gap-6">
        {/* Statistics */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="p-6">
            <div className="text-2xl font-bold">{users.total}</div>
            <p className="text-sm text-muted-foreground">Total Users</p>
          </Card>
          
          <Card className="p-6">
            <div className="text-2xl font-bold">{users.active}</div>
            <p className="text-sm text-muted-foreground">Active Users</p>
          </Card>
          
          <Card className="p-6">
            <div className="text-2xl font-bold">{users.admins}</div>
            <p className="text-sm text-muted-foreground">Administrators</p>
          </Card>
          
          <Card className="p-6">
            <div className="text-2xl font-bold">{users.recentlyActive}</div>
            <p className="text-sm text-muted-foreground">Active Today</p>
          </Card>
        </div>
        
        {/* Users List */}
        <Card>
          <UsersList users={users.data} />
        </Card>
      </div>
    </div>
  );
}