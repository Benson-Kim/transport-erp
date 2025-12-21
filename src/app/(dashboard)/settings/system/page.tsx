// /app/(dashboard)/settings/system/page.tsx
import { redirect } from 'next/navigation';


import { getSystemSettings } from '@/actions/settings-actions';
import { UserRole } from '@/app/generated/prisma';
import { SystemSettingsContent } from '@/components/features/settings/SystemSettings';
import { auth } from '@/lib/auth';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'System Settings',
  description: 'Manage system configuration and preferences',
};

export default async function SystemSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  // Check admin permission
  if (session.user.role !== UserRole.SUPER_ADMIN && session.user.role !== UserRole.ADMIN) {
    redirect('/dashboard');
  }

  const settings = await getSystemSettings();

  return <SystemSettingsContent initialSettings={settings} />;
}
