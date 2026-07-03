/**
 * New Loading Order Page (#32)
 *
 * Driven by the services selection (?serviceIds=a,b,c) from the Services
 * list. A paginated, searchable service selector is #47's scope; until
 * then creation starts from the Services list selection.
 */

import Link from 'next/link';

import { getServicesForLoadingOrder } from '@/actions/loading-order-actions';
import { NewLoadingOrderForm } from '@/components/features/loading-orders/NewLoadingOrderForm';
import { Alert, Breadcrumbs, PageHeader } from '@/components/ui';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New Loading Order | Dashboard',
};

interface PageProps {
  searchParams: Promise<{ serviceIds?: string }>;
}

export default async function NewLoadingOrderPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const serviceIds = (params.serviceIds ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (serviceIds.length === 0) {
    return (
      <div className="space-y-6">
        <Breadcrumbs />
        <PageHeader
          title="New Loading Order"
          description="Group services into a carrier loading order"
        />
        <Alert variant="info" title="Select services first">
          Loading orders are created from a services selection. Open the{' '}
          <Link href="/services" className="text-primary underline">
            Services list
          </Link>
          , select one or more services, and choose Create Loading Order.
        </Alert>
      </div>
    );
  }

  // Access-denied and not-found render as an error state, not a crash to
  // the boundary (the !16 authz contract - typed errors are converted at
  // the action boundary).
  const result = await getServicesForLoadingOrder(serviceIds);

  if (!result.success || !result.data) {
    return (
      <div className="space-y-6">
        <Breadcrumbs />
        <PageHeader
          title="New Loading Order"
          description="Group services into a carrier loading order"
        />
        <Alert variant="error" title="Cannot create loading order">
          {result.error ?? 'An unexpected error occurred. Please try again later.'}
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs />
      <PageHeader
        title="New Loading Order"
        description="Review the grouped services, set their loading positions, and create the order"
      />
      <NewLoadingOrderForm services={result.data} />
    </div>
  );
}
