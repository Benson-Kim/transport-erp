// /app/(dashboard)/settings/layout.tsx
import type { ReactNode } from 'react';
import { Suspense } from 'react';

import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Building2, Settings, Users } from 'lucide-react';

import { UserRole } from '@/app/generated/prisma';
import { PageHeader } from '@/components/ui';
import { auth } from '@/lib/auth';
import { canAccessRoute } from '@/lib/permissions';
import { cn } from '@/lib/utils/cn';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  description?: string;
}

// Visibility is derived from the RBAC matrix via canAccessRoute(href).
// Only routes that actually exist are listed (no dead affordances).
const navItems: NavItem[] = [
  {
    label: 'Company Information',
    href: '/settings/company',
    icon: Building2,
    description: 'Company details and branding',
  },
  {
    label: 'User Management',
    href: '/settings/users',
    icon: Users,
    description: 'Manage users and roles',
    badge: 'Admin',
  },
  {
    label: 'System Settings',
    href: '/settings/system',
    icon: Settings,
    description: 'System configuration',
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
  const accessibleNavItems = navItems.filter((item) => canAccessRoute(userRole, item.href));

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
export default async function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
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
