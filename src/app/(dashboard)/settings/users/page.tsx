// /app/(dashboard)/settings/users/page.tsx
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { UserRole } from '@/app/generated/prisma';
import { hasPermission, RESOURCES, ACTIONS } from '@/lib/permissions';
import { PageHeader } from '@/components/ui';
import prisma from '@/lib/prisma/prisma';
import { UserManagement } from '@/components/features/settings/UserManagement';

export const metadata: Metadata = {
  title: 'User Management | Transport Management System',
  description: 'Manage system users and permissions',
};

/**
 * User management page (admin only)
 */
export default async function UsersPage() {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  const userRole = session.user?.role ?? UserRole.VIEWER;

  // Check permission using centralized system
  if (!hasPermission(userRole, RESOURCES.USERS, ACTIONS.VIEW)) {
    redirect('/settings/profile');
  }

  // Fetch all users with stats (excluding soft deleted)
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      avatar: true,
      phone: true,
      department: true,
      lastLoginAt: true,
      createdAt: true,
      emailVerified: true,
      _count: {
        select: {
          services: true,
          auditLogs: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });

  return (
    <div className="space-y-6 -mt-2">
      <PageHeader
        title="User Management"
        description="Manage users, roles, and permissions"
      >

      </PageHeader>

      <UserManagement
        users={users}
        currentUserId={session.user.id}
        currentUserRole={userRole}
      />
    </div>
  );
}