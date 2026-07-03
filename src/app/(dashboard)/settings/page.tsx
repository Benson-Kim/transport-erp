import { redirect } from 'next/navigation';

import { UserRole } from '@/app/generated/prisma';
import { auth } from '@/lib/auth';

import { firstAccessibleSettingsRoute } from './settings-nav';

/**
 * /settings index (#36): not a page of its own. Sidebar and TopBar link
 * here, so it forwards to the first sub-page the caller may open (sidebar
 * order, derived from the permission matrix). A role with no accessible
 * sub-page falls back to /dashboard - this route can never be a dead
 * destination.
 */
export default async function SettingsPage() {
  const session = await auth();
  if (!session) {
    redirect('/login');
  }

  const userRole = session.user?.role ?? UserRole.VIEWER;
  redirect(firstAccessibleSettingsRoute(userRole) ?? '/dashboard');
}
