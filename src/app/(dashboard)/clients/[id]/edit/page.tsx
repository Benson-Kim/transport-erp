// /app/(dashboard)/clients/[id]/edit/page.tsx
/**
 * Edit Client Page
 * Form for editing an existing client
 */

import { Suspense } from 'react';

import { notFound, redirect } from 'next/navigation';

import { getClientById } from '@/actions/client-actions';
import { ClientForm, ClientFormSkeleton } from '@/components/features/clients/ClientForm';
import { Alert, Breadcrumbs, PageHeader } from '@/components/ui';
import { getServerAuth } from '@/lib/auth';
import { hasPermission, RESOURCES, ACTIONS } from '@/lib/permissions';

import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const result = await getClientById(id);

  if (!result.success || !result.data) {
    return { title: 'Client Not Found | Dashboard' };
  }

  return {
    title: `Edit ${result.data.name} | Clients`,
    description: `Edit client information for: ${result.data.name}`,
  };
}

async function EditClientContent({ id }: { id: string }) {
  const session = await getServerAuth();

  if (!session?.user) {
    redirect('/login');
  }

  const canEdit = hasPermission(session.user.role, RESOURCES.CLIENTS, ACTIONS.EDIT);

  if (!canEdit) {
    redirect(`/clients/${id}`);
  }

  const result = await getClientById(id);

  if (!result.success) {
    if (result.error === 'Client not found') {
      notFound();
    }
    return (
      <Alert variant="error" title="Failed to load client">
        {result.error ?? 'An unexpected error occurred. Please try again later.'}
      </Alert>
    );
  }

  if (!result.data) {
    notFound();
  }

  return <ClientForm client={result.data} mode="edit" />;
}

export default async function EditClientPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <Breadcrumbs />

      <PageHeader title="Edit Client" description="Update client information and settings" />

      <Suspense fallback={<ClientFormSkeleton />}>
        <EditClientContent id={id} />
      </Suspense>
    </div>
  );
}
