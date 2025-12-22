/**
 * Clients List Page
 * Displays paginated, filterable list of clients
 */

import { Suspense } from 'react';

import { getClients, getClientCountries } from '@/actions/client-actions';
import { ClientsTable, ClientsTableSkeleton } from '@/components/features/clients/ClientsTable';
import { Alert, Breadcrumbs, PageHeader } from '@/components/ui';
import { getServerAuth } from '@/lib/auth';
import { hasPermission, RESOURCES, ACTIONS } from '@/lib/permissions';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Clients | Dashboard',
  description: 'Manage your clients and their information',
};

interface PageProps {
  searchParams: Promise<{
    search?: string;
    country?: string;
    isActive?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: string;
  }>;
}

function parseIsActiveFilter(value: string | undefined): boolean | undefined {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return undefined;
}

async function ClientsContent({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await getServerAuth();
  const userRole = session?.user?.role;

  // Check permissions
  const canCreate = hasPermission(userRole, RESOURCES.CLIENTS, ACTIONS.CREATE);
  const canEdit = hasPermission(userRole, RESOURCES.CLIENTS, ACTIONS.EDIT);
  const canDelete = hasPermission(userRole, RESOURCES.CLIENTS, ACTIONS.DELETE);
  const canExport = hasPermission(userRole, RESOURCES.CLIENTS, ACTIONS.EXPORT);

  // Fetch data in parallel
  const [clientsResult, countriesResult] = await Promise.all([
    getClients({
      search: params.search,
      country: params.country,
      isActive: parseIsActiveFilter(params.isActive),
      sortBy: params.sortBy ?? 'name',
      sortOrder: params.sortOrder ?? 'asc',
      page: params.page ? parseInt(params.page, 10) : 1,
      limit: 50,
    }),
    getClientCountries(),
  ]);

  if (!clientsResult.success || !clientsResult.data) {
    return (
      <Alert variant="error" title="Failed to load clients">
        {clientsResult.error ?? 'An unexpected error occurred. Please try again later.'}
      </Alert>
    );
  }

  const countries = countriesResult.success ? (countriesResult.data ?? []) : [];

  return (
    <ClientsTable
      data={clientsResult.data}
      countries={countries}
      canCreate={canCreate}
      canEdit={canEdit}
      canDelete={canDelete}
      canExport={canExport}
    />
  );
}

export default function ClientsPage(props: PageProps) {
  return (
    <div className="space-y-6">
      <Breadcrumbs />

      <PageHeader title="Clients" description="Manage your client accounts and information" />

      {/* Table */}
      <Suspense fallback={<ClientsTableSkeleton />}>
        <ClientsContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
