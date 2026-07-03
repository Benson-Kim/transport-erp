/**
 * Settings section navigation (#17, #36).
 *
 * The ONE list that the settings sidebar (layout.tsx) and the /settings
 * index redirect (page.tsx) both derive from, so nav visibility and the
 * index landing page cannot drift apart. Visibility derives from the
 * canonical permission matrix via canAccessRoute - no hardcoded role lists.
 * Only routes that exist are listed: the old profile/security/backup/audit/
 * permissions entries pointed at pages that were never built and are not
 * built this cycle either (#36 - deletion is the resolution).
 */

import type { ComponentType } from 'react';

import { Building2, Settings, Users } from 'lucide-react';

import type { UserRole } from '@/app/generated/prisma';
import { canAccessRoute } from '@/lib/permissions';

export interface SettingsNavEntry {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  badge?: string;
  description?: string;
}

export const SETTINGS_NAV_ITEMS: SettingsNavEntry[] = [
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
 * First settings sub-page the role may open, in sidebar order. Null when the
 * role has no accessible sub-page - callers fall back to /dashboard instead
 * of rendering an empty settings shell (#36).
 */
export function firstAccessibleSettingsRoute(role: UserRole): string | null {
  return SETTINGS_NAV_ITEMS.find((item) => canAccessRoute(role, item.href))?.href ?? null;
}
