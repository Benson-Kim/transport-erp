/**
 * Loading Orders List Page (#32)
 */

import { Suspense } from 'react';

import { getLoadingOrders } from '@/actions/loading-order-actions';
import {
  LoadingOrdersTable,
  LoadingOrdersTableSkeleton,
} from '@/components/features/loading-orders/LoadingOrdersTable';
import { Alert, Breadcrumbs, PageHeader } from '@/components/ui';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Loading Orders | Dashboard',
  description: 'Carrier loading orders grouped from services',
};

interface PageProps {
  searchParams: Promise<{
    search?: string;
    page?: string;
  }>;
}

async function LoadingOrdersContent({ searchParams }: PageProps) {
  const params = await searchParams;

  const result = await getLoadingOrders({
    search: params.search,
    page: params.page ? parseInt(params.page, 10) : 1,
    limit: 50,
  });

  if (!result.success || !result.data) {
    return (
      <Alert variant="error" title="Failed to load loading orders">
        {result.error ?? 'An unexpected error occurred. Please try again later.'}
      </Alert>
    );
  }

  return <LoadingOrdersTable data={result.data} />;
}

export default function LoadingOrdersPage(props: PageProps) {
  return (
    <div className="space-y-6">
      <Breadcrumbs />

      <PageHeader
        title="Loading Orders"
        description="Carrier instructions grouped from services. Create them from the Services list."
      />

      <Suspense fallback={<LoadingOrdersTableSkeleton />}>
        <LoadingOrdersContent searchParams={props.searchParams} />
      </Suspense>
    </div>
  );
}
