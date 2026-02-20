// /app/(dashboard)/clients/[id]/page.tsx
/**
 * Client Detail Page
 * Displays comprehensive client information
 */

import { Suspense } from 'react';

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { ChevronLeft } from 'lucide-react';

import { getClientById } from '@/actions/client-actions';
import { ClientDetail, ClientDetailSkeleton } from '@/components/features/clients/ClientDetail';
import { Alert } from '@/components/ui/Alert';
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
    title: `${result.data.name} | Clients`,
    description: `View and manage client: ${result.data.name}`,
  };
}

async function ClientDetailContent({ id }: { id: string }) {
  const session = await getServerAuth();

  if (!session?.user) {
    redirect('/login');
  }

  const canView = hasPermission(session.user.role, RESOURCES.CLIENTS, ACTIONS.VIEW);

  if (!canView) {
    redirect('/dashboard');
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

  const canEdit = hasPermission(session.user.role, RESOURCES.CLIENTS, ACTIONS.EDIT);
  const canDelete = hasPermission(session.user.role, RESOURCES.CLIENTS, ACTIONS.DELETE);

  return <ClientDetail client={result.data} canEdit={canEdit} canDelete={canDelete} />;
}

export default async function ClientDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb">
        <Link
          href="/clients"
          className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          Back to Clients
        </Link>
      </nav>

      {/* Content */}
      <Suspense fallback={<ClientDetailSkeleton />}>
        <ClientDetailContent id={id} />
      </Suspense>
    </div>
  );
}
