/**
 * Loading Order Detail Page (#32)
 *
 * Static metadata by design: no gated fetch is shared with
 * generateMetadata, so the title path can never bypass the access gate
 * (the !16 metadata-leak lesson).
 */

import Link from 'next/link';

import { getLoadingOrderById } from '@/actions/loading-order-actions';
import { ServiceStatusBadge } from '@/components/features/services/ServiceStatusBadge';
import { Alert, Badge, Breadcrumbs, Card, CardBody, PageHeader } from '@/components/ui';
import { formatDate } from '@/lib/utils/date-formats';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Loading Order | Dashboard',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LoadingOrderDetailPage({ params }: PageProps) {
  const { id } = await params;
  const result = await getLoadingOrderById(id);

  if (!result.success || !result.data) {
    return (
      <div className="space-y-6">
        <Breadcrumbs />
        <Alert variant="error" title="Failed to load loading order">
          {result.error ?? 'An unexpected error occurred. Please try again later.'}
        </Alert>
      </div>
    );
  }

  const order = result.data;

  return (
    <div className="space-y-6">
      <Breadcrumbs />

      <PageHeader
        title={`Loading Order ${order.orderNumber}`}
        description={`Generated ${formatDate.dateTime(order.generatedAt)} by ${order.generatedByName}`}
      />

      {/* Honest PDF status (#32): no download control exists until a real
          stored PDF does - the server-side pipeline ships with #34. */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">PDF document</h3>
            {order.hasPdf ? (
              <Badge variant="completed">Available</Badge>
            ) : (
              <Badge>Not generated</Badge>
            )}
          </div>
          {!order.hasPdf && (
            <p className="mt-2 text-sm text-muted-foreground">
              PDF generation for loading orders is not available yet.
            </p>
          )}
        </CardBody>
      </Card>

      {order.notes && (
        <Card>
          <CardBody>
            <h3 className="font-semibold mb-2">Notes</h3>
            <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
          </CardBody>
        </Card>
      )}

      <Card className="overflow-hidden">
        <CardBody>
          <h3 className="font-semibold mb-4">Services ({order.services.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="p-3 w-12">
                    #
                  </th>
                  <th scope="col" className="p-3">
                    Service
                  </th>
                  <th scope="col" className="p-3">
                    Date
                  </th>
                  <th scope="col" className="p-3">
                    Client
                  </th>
                  <th scope="col" className="p-3">
                    Supplier
                  </th>
                  <th scope="col" className="p-3">
                    Route
                  </th>
                  <th scope="col" className="p-3">
                    Vehicle
                  </th>
                  <th scope="col" className="p-3">
                    Driver
                  </th>
                  <th scope="col" className="p-3">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {order.services.map((service) => (
                  <tr key={service.id} className="border-b">
                    <td className="p-3 tabular-nums">{service.position}</td>
                    <td className="p-3 font-medium">
                      <Link
                        href={`/services/${service.id}`}
                        className="text-primary hover:underline"
                      >
                        {service.serviceNumber}
                      </Link>
                    </td>
                    <td className="p-3">{formatDate.dayMonth(service.date)}</td>
                    <td className="p-3">{service.clientName}</td>
                    <td className="p-3">{service.supplierName}</td>
                    <td className="p-3">
                      {service.origin} → {service.destination}
                    </td>
                    <td className="p-3 font-mono">{service.vehiclePlate ?? '-'}</td>
                    <td className="p-3">{service.driverName ?? '-'}</td>
                    <td className="p-3">
                      <ServiceStatusBadge status={service.status} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
