/**
 * Invoices List Page (#30, ADR 0001)
 *
 * Paginated, filterable list of SALES and PURCHASE invoices.
 * Suspense streaming + skeleton; pure server component (zero client JS).
 * force-dynamic: invoice status and paidAmount must never be stale.
 */

import { Suspense } from 'react';

import { getInvoices } from '@/actions/invoice-actions';
import {
  InvoicesTable,
  InvoicesTableSkeleton,
} from '@/components/features/invoices/InvoicesTable';
import { Alert, Breadcrumbs, PageHeader } from '@/components/ui';
import { getServerAuth } from '@/lib/auth';
import { hasPermission, RESOURCES, ACTIONS } from '@/lib/permissions';

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Invoices | Dashboard',
  description: 'Sales invoices issued to clients and purchase invoices received from suppliers',
};

interface PageProps {
  searchParams: Promise<{
    search?: string;
    direction?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: string;
  }>;
}

async function InvoicesContent({ searchParams }: PageProps) {
  const params = await searchParams;
  const session = await getServerAuth();
  const userRole = session?.user?.role;

  const canCreate = hasPermission(userRole, RESOURCES.INVOICES, ACTIONS.CREATE);
  const canDelete = hasPermission(userRole, RESOURCES.INVOICES, ACTIONS.DELETE);

  const result = await getInvoices({
    search: params.search,
    direction: params.direction,
    status: params.status,
    sortBy: params.sortBy ?? 'invoiceDate',
    sortOrder: params.sortOrder ?? 'desc',
    page: params.page ? parseInt(params.page, 10) : 1,
    limit: 50,
  });

  if (!result.success || !result.data) {
    return (
      <Alert variant="error" title="Failed to load invoices">
        {result.error ?? 'An unexpected error occurred. Please try again later.'}
      </Alert>
    );
  }

  return (
    <InvoicesTable
      data={result.data}
      canCreate={canCreate}
      canDelete={canDelete}
    />
  );
}

export default function InvoicesPage(props: PageProps) {
  return (
    <div className="space-y-6">
      <Breadcrumbs />

      <PageHeader
        title="Invoices"
        description="Sales invoices issued to clients (INV) and purchase invoices received from suppliers (RINV)"
      />

      <Suspense fallback={<InvoicesTableSkeleton />}>
        <InvoicesContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
