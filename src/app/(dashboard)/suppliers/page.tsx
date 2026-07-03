/**
 * Suppliers List Page (#29)
 * Paginated, filterable list of suppliers - the cost side of the brokerage.
 */

import { Suspense } from 'react';

import { getSuppliers } from '@/actions/supplier-actions';
import {
  SuppliersTable,
  SuppliersTableSkeleton,
} from '@/components/features/suppliers/SuppliersTable';
import { Alert, Breadcrumbs, PageHeader } from '@/components/ui';
import { getServerAuth } from '@/lib/auth';
import { hasPermission, RESOURCES, ACTIONS } from '@/lib/permissions';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Suppliers | Dashboard',
  description: 'Manage your suppliers and their information',
};

interface PageProps {
  searchParams: Promise<{
    search?: string;
    isActive?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: string;
  }>;
}

function parseIsActiveFilter(value: string | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

async function SuppliersContent({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await getServerAuth();
  const userRole = session?.user?.role;

  const canCreate = hasPermission(userRole, RESOURCES.SUPPLIERS, ACTIONS.CREATE);
  const canEdit = hasPermission(userRole, RESOURCES.SUPPLIERS, ACTIONS.EDIT);
  const canDelete = hasPermission(userRole, RESOURCES.SUPPLIERS, ACTIONS.DELETE);
  const canExport = hasPermission(userRole, RESOURCES.SUPPLIERS, ACTIONS.EXPORT);

  const suppliersResult = await getSuppliers({
    search: params.search,
    isActive: parseIsActiveFilter(params.isActive),
    sortBy: params.sortBy ?? 'name',
    sortOrder: params.sortOrder ?? 'asc',
    page: params.page ? parseInt(params.page, 10) : 1,
    limit: 50,
  });

  if (!suppliersResult.success || !suppliersResult.data) {
    return (
      <Alert variant="error" title="Failed to load suppliers">
        {suppliersResult.error ?? 'An unexpected error occurred. Please try again later.'}
      </Alert>
    );
  }

  return (
    <SuppliersTable
      data={suppliersResult.data}
      canCreate={canCreate}
      canEdit={canEdit}
      canDelete={canDelete}
      canExport={canExport}
    />
  );
}

export default function SuppliersPage(props: PageProps) {
  return (
    <div className="space-y-6">
      <Breadcrumbs />

      <PageHeader title="Suppliers" description="Manage your supplier accounts and cost side" />

      <Suspense fallback={<SuppliersTableSkeleton />}>
        <SuppliersContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
