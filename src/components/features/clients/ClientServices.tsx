'use client';

/**
 * Displays services related to a client with filtering
 */

import { useState, useEffect, useTransition } from 'react';

import Link from 'next/link';

import { format } from 'date-fns';
import { Loader2, Plus, ExternalLink, FileText } from 'lucide-react';
import { Controller, FormProvider, useForm } from 'react-hook-form';

import { getClientServices } from '@/actions/client-actions';
import { ServiceStatus } from '@/app/generated/prisma';
import { Badge, Button, Card, FormField, Pagination, Select, Table } from '@/components/ui';
import { getStatusIcon, getStatusLabel, getStatusVariant } from '@/lib/service-helpers';
import { formatCurrency } from '@/lib/utils/formatting';
import type { ClientService } from '@/types/client';

interface ClientServicesProps {
  clientId: string;
}

interface FilterFormData {
  status: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Status' },
  ...Object.values(ServiceStatus).map((status) => ({
    value: status,
    label: getStatusLabel(status),
  })),
];

export function ClientServices({ clientId }: ClientServicesProps) {
  const [isPending, startTransition] = useTransition();
  const [services, setServices] = useState<ClientService[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const methods = useForm<FilterFormData>({
    defaultValues: {
      status: 'all',
    },
  });

  const { control, watch } = methods;
  const selectedStatus = watch('status');

  useEffect(() => {
    startTransition(async () => {
      const result = await getClientServices(clientId, {
        page,
        limit: pageSize,
        status: selectedStatus,
      });
      if (result.success && result.data) {
        setServices(result.data.data);
        setTotal(result.data.total);
      }
    });
  }, [clientId, page, pageSize, selectedStatus]);

  useEffect(() => {
    setPage(1);
  }, [selectedStatus, pageSize]);

  const totalPages = Math.ceil(total / pageSize);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setPage(1);
  };

  return (
    <FormProvider {...methods}>
      <Card padding="none">
        <Card.Header
          title={`Services (${total})`}
          action={
            <div className="flex items-center gap-3">
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <FormField>
                    <Select
                      {...field}
                      className="w-full sm:w-40"
                      aria-label="Filter by status"
                      options={STATUS_OPTIONS}
                    />
                  </FormField>
                )}
              />

              <Button variant="primary" size="md" icon={<Plus className="w-4 h-4" />} asChild>
                <Link href={`/services/new?clientId=${clientId}`}>
                  <span className="hidden sm:inline">New Service</span>
                </Link>
              </Button>
            </div>
          }
        />

        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Service #</Table.HeaderCell>
              <Table.HeaderCell>Date</Table.HeaderCell>
              <Table.HeaderCell className="hidden md:table-cell">Route</Table.HeaderCell>
              <Table.HeaderCell className="hidden lg:table-cell">Supplier</Table.HeaderCell>
              <Table.HeaderCell align="right">Cost</Table.HeaderCell>
              <Table.HeaderCell align="right">Sale</Table.HeaderCell>
              <Table.HeaderCell align="right" className="hidden sm:table-cell">
                Margin
              </Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell className="w-12">
                <span className="sr-only">Actions</span>
              </Table.HeaderCell>
            </Table.Row>
          </Table.Header>

          <Table.Body>
            {isPending && (
              <Table.Row hoverable={false}>
                <Table.Cell colSpan={9} className="text-center py-8">
                  <Loader2
                    className="w-6 h-6 animate-spin mx-auto text-primary"
                    aria-label="Loading services"
                  />
                </Table.Cell>
              </Table.Row>
            )}

            {!isPending && services.length === 0 && (
              <Table.Row hoverable={false}>
                <Table.Cell colSpan={9} className="text-center py-12">
                  <FileText
                    className="w-12 h-12 mx-auto text-neutral-300 mb-3"
                    aria-hidden="true"
                  />
                  <p className="text-neutral-500">No services found</p>
                  <Button
                    variant="primary"
                    size="md"
                    icon={<Plus className="w-4 h-4" />}
                    className="mt-4"
                    asChild
                  >
                    <Link href={`/services/new?clientId=${clientId}`}>Create First Service</Link>
                  </Button>
                </Table.Cell>
              </Table.Row>
            )}

            {!isPending &&
              services.map((service) => (
                <Table.Row key={service.id} hoverable clickable>
                  <Table.Cell>
                    <Link
                      href={`/services/${service.id}`}
                      className="font-mono font-semibold text-primary hover:underline"
                    >
                      {service.serviceNumber}
                    </Link>
                  </Table.Cell>
                  <Table.Cell>{format(new Date(service.date), 'dd/MM/yyyy')}</Table.Cell>
                  <Table.Cell className="hidden md:table-cell">
                    <span className="text-sm">
                      {service.origin} → {service.destination}
                    </span>
                  </Table.Cell>
                  <Table.Cell className="hidden lg:table-cell">
                    <Link
                      href={`/suppliers/${service.supplier.id}`}
                      className="text-primary hover:underline"
                    >
                      {service.supplier.name}
                    </Link>
                  </Table.Cell>
                  <Table.Cell align="right" className="font-mono">
                    {formatCurrency(service.costAmount)}
                  </Table.Cell>
                  <Table.Cell align="right" className="font-mono">
                    {formatCurrency(service.saleAmount)}
                  </Table.Cell>
                  <Table.Cell align="right" className="hidden sm:table-cell">
                    <span
                      className={`font-mono ${
                        service.margin >= 0 ? 'text-financial-positive' : 'text-financial-negative'
                      }`}
                    >
                      {formatCurrency(service.margin)}
                    </span>
                    <span className="text-xs text-neutral-500 ml-1">
                      ({service.marginPercentage.toFixed(1)}%)
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge
                      variant={getStatusVariant(service.status)}
                      size="sm"
                      icon={getStatusIcon(service.status)}
                      pulse={service.status === ServiceStatus.IN_PROGRESS}
                    >
                      {getStatusLabel(service.status)}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <Link
                      href={`/services/${service.id}`}
                      className="p-2 rounded-md hover:bg-neutral-100 inline-flex"
                      title="View service"
                    >
                      <ExternalLink className="w-4 h-4 text-neutral-500" aria-hidden="true" />
                      <span className="sr-only">View service {service.serviceNumber}</span>
                    </Link>
                  </Table.Cell>
                </Table.Row>
              ))}
          </Table.Body>
        </Table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-neutral-200">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={pageSize}
              onPageChange={handlePageChange}
              showPageSize
              onPageSizeChange={handlePageSizeChange}
              pageSizeOptions={[10, 20, 50]}
            />
          </div>
        )}
      </Card>
    </FormProvider>
  );
}
