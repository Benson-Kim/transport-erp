// /app/(dashboard)/settings/layout.tsx
import type { ReactNode } from 'react';
import { Suspense } from 'react';

import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Activity, Building2, Database, Lock, Settings, Shield, User, Users } from 'lucide-react';

import { UserRole } from '@/app/generated/prisma';
import { PageHeader } from '@/components/ui';
import { auth } from '@/lib/auth';
import { canAccessRoute } from '@/lib/permissions';
import { cn } from '@/lib/utils/cn';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
  badge?: string;
  description?: string;
}

const navItems: NavItem[] = [
  {
    label: 'My Profile',
    href: '/settings/profile',
    icon: User,
    roles: [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.ACCOUNTANT,
      UserRole.OPERATOR,
      UserRole.VIEWER,
    ],
    description: 'Personal information and preferences',
  },
  {
    label: 'Security',
    href: '/settings/security',
    icon: Lock,
    roles: [
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.MANAGER,
      UserRole.ACCOUNTANT,
      UserRole.OPERATOR,
      UserRole.VIEWER,
    ],
    description: 'Password and authentication',
  },
  {
    label: 'Company Information',
    href: '/settings/company',
    icon: Building2,
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.ACCOUNTANT],
    description: 'Company details and branding',
  },
  {
    label: 'User Management',
    href: '/settings/users',
    icon: Users,
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    description: 'Manage users and roles',
    badge: 'Admin',
  },
  {
    label: 'System Settings',
    href: '/settings/system',
    icon: Settings,
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    description: 'System configuration',
    badge: 'Admin',
  },
  {
    label: 'Backup & Restore',
    href: '/settings/backup',
    icon: Database,
    roles: [UserRole.SUPER_ADMIN],
    description: 'Data backup settings',
    badge: 'Super Admin',
  },
  {
    label: 'Audit Log',
    href: '/settings/audit',
    icon: Activity,
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    description: 'System activity logs',
    badge: 'Admin',
  },
  {
    label: 'Permissions',
    href: '/settings/permissions',
    icon: Shield,
    roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN],
    description: 'Role permissions matrix',
    badge: 'Admin',
  },
];

/**
 * Navigation item for the settings sidebar.
 */
const SettingsNavItem = ({
  href,
  label,
  icon: Icon,
  pathname,
  description,
  badge,
}: NavItem & { pathname: string }) => {
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={cn(
        'nav-item group relative transition-all duration-150',
        isActive && 'nav-item-active'
      )}
      title={description}
    >
      <Icon className="icon-sm shrink-0" aria-hidden="true" />
      <span className="font-medium flex-1">{label}</span>
      {badge && <span className="badge badge-active text-xs ml-auto">{badge}</span>}
    </Link>
  );
};

/**
 * Sidebar for the settings section.
 */
const SettingsSidebar = ({ userRole, pathname }: { userRole: UserRole; pathname: string }) => {
  const accessibleNavItems = navItems.filter((item) => item.roles.includes(userRole));

  return (
    <aside className="w-full md:w-64 md:shrink-0">
      <nav className="flex flex-col space-y-2 p-4 md:p-0">
        {accessibleNavItems.map((item) => (
          <SettingsNavItem key={item.href} {...item} pathname={pathname} />
        ))}
      </nav>
    </aside>
  );
};

/**
 * Layout for all settings pages, providing a sidebar and main content area.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  const userRole = session.user?.role ?? UserRole.VIEWER;
  const pathname = (await headers()).get('x-pathname') || '';

  if (!canAccessRoute(userRole, '/settings')) {
    redirect('/dashboard');
  }

  return (
    <div className="mx-auto">
      {/* <h1 className="text-2xl font-bold mb-6">Settings</h1> */}
      <PageHeader title="Settings" className="mb-4" />
      <div className="flex flex-col md:flex-row gap-6">
        <SettingsSidebar userRole={userRole} pathname={pathname} />
        <main className="flex-1 min-w-0 -mt-12">
          <Suspense fallback={<div className="skeleton h-96 w-full" />}>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
