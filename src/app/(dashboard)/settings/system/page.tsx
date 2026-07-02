// /app/(dashboard)/settings/system/page.tsx
import { redirect } from 'next/navigation';


import { getSystemSettings } from '@/actions/settings-actions';
import { SystemSettingsContent } from '@/components/features/settings/SystemSettings';
import { auth } from '@/lib/auth';
import { canAccessRoute } from '@/lib/permissions';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'System Settings',
  description: 'Manage system configuration and preferences',
};

export default async function SystemSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  // Route gate derived from the permission matrix: settings:manage (#17).
  if (!canAccessRoute(session.user.role, '/settings/system')) {
    redirect('/dashboard');
  }

  const settings = await getSystemSettings();

  return <SystemSettingsContent initialSettings={settings} />;
}
