/**
 * Create Client Page
 * Form for creating a new client
 */

import { redirect } from 'next/navigation';

import { ClientForm } from '@/components/features/clients/ClientForm';
import { Breadcrumbs, PageHeader } from '@/components/ui';
import { getServerAuth } from '@/lib/auth';
import { hasPermission, RESOURCES, ACTIONS } from '@/lib/permissions';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New Client | Dashboard',
  description: 'Create a new client account',
};

export default async function NewClientPage() {
  const session = await getServerAuth();

  if (!session?.user) {
    redirect('/login');
  }

  const canCreate = hasPermission(session.user.role, RESOURCES.CLIENTS, ACTIONS.CREATE);

  if (!canCreate) {
    redirect('/clients');
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs />

      <PageHeader
        title="New Client"
        description="Create a new client account with their contact and billing information"
      />

      <ClientForm mode="create" />
    </div>
  );
}
