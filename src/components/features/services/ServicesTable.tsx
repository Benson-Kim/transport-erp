// components/features/services/ServicesTable.tsx
'use client';

import { useState, useCallback, useTransition, useMemo } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Truck,
  Plus,
  Eye,
  Edit,
  Copy,
  Trash2,
  FileText,
  MoreVertical,
  Receipt,
  Calendar,
  Users,
  Building2,
} from 'lucide-react';

import { deleteService } from '@/actions/service-actions';
import { ServiceStatus, type UserRole } from '@/app/generated/prisma';
import { Button, Tooltip, Card, DropdownMenu, Amount } from '@/components/ui';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { hasPermission } from '@/lib/permissions';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/date-formats';
import { formatCurrency, formatPercentage } from '@/lib/utils/formatting';
import type { ServiceData } from '@/types/service';

import { BulkActions } from './BulkActions';
import { ServiceStatusBadge } from './ServiceStatusBadge';

interface ServicesTableProps {
  services: ServiceData[];
  total: number;
  currentPage: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  userRole: UserRole;
  loading?: boolean;
  error?: Error | null;
  // onRefresh?: () => void;
}

export function ServicesTable({
  services,
  total,
  currentPage,
  pageSize,
  sortBy,
  sortOrder,
  userRole,
  loading = false,
  error = null,
  // onRefresh,
}: Readonly<ServicesTableProps>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalCost = services.reduce((sum, s) => sum + s.costAmount, 0);
    const totalSale = services.reduce((sum, s) => sum + s.saleAmount, 0);
    const totalMargin = totalSale - totalCost;
    const avgMarginPercent = totalSale > 0 ? (totalMargin / totalSale) * 100 : 0;
    return { totalCost, totalSale, totalMargin, avgMarginPercent };
  }, [services]);

  // Handle sorting
  const handleSort = useCallback(
    (key: string, direction: 'asc' | 'desc') => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('sortBy', key);
      params.set('sortOrder', direction);
      startTransition(() => router.push(`/services?${params.toString()}`));
    },
    [searchParams, router]
  );

  // Handle pagination
  const handlePageChange = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', page.toString());
      router.push(`/services?${params.toString()}`);
    },
    [searchParams, router]
  );

  const handlePageSizeChange = useCallback(
    (size: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('pageSize', size.toString());
      params.set('page', '1');
      router.push(`/services?${params.toString()}`);
    },
    [searchParams, router]
  );

  const columns = useMemo(() => getServiceColumns(), []);

  // Row actions
  const rowActions = useCallback(
    (service: ServiceData) => {
      const handleDelete = async () => {
        if (!confirm('Are you sure you want to delete this service?')) return;
        try {
          await deleteService(service.id);
          toast.success('Service deleted successfully');
          router.refresh();
        } catch {
          toast.error('Failed to delete service');
        }
      };

      const menuItems = [
        hasPermission(userRole, 'services', 'view') && {
          id: 'view',
          label: 'View Details',
          icon: <Eye className="h-4 w-4" />,
          onClick: () => router.push(`/services/${service.id}`),
        },
        hasPermission(userRole, 'services', 'edit') && {
          id: 'edit',
          label: 'Edit',
          icon: <Edit className="h-4 w-4" />,
          onClick: () => router.push(`/services/${service.id}/edit`),
        },
        {
          id: 'duplicate',
          label: 'Duplicate',
          icon: <Copy className="h-4 w-4" />,
          onClick: () => router.push(`/services/new?duplicate=${service.id}`),
        },
        { id: 'divider-1', divider: true },
        hasPermission(userRole, 'invoices', 'create') && {
          id: 'invoice',
          label: 'Generate Invoice',
          icon: <Receipt className="h-4 w-4" />,
          onClick: () => router.push(`/invoices/new?serviceId=${service.id}`),
          disabled: service.status !== ServiceStatus.COMPLETED,
        },
        hasPermission(userRole, 'loading_orders', 'create') && {
          id: 'loadingOrder',
          label: 'Generate Loading Order',
          icon: <FileText className="h-4 w-4" />,
          onClick: () => router.push(`/loading-orders/new?serviceId=${service.id}`),
        },
        hasPermission(userRole, 'services', 'delete') && { id: 'divider-2', divider: true },
        hasPermission(userRole, 'services', 'delete') && {
          id: 'delete',
          label: 'Delete',
          icon: <Trash2 className="h-4 w-4" />,
          onClick: handleDelete,
          danger: true,
        },
      ].filter(Boolean);

      return (
        <DropdownMenu
          trigger={
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          }
          align="right"
          items={menuItems as any}
        />
      );
    },
    [userRole, router]
  );

  return (
    <div className="space-y-4">
      {/* Table Stats Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-1">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Tooltip content="Total value of displayed services">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Sale Total:</span>
              <span className="font-semibold">{formatCurrency(stats.totalSale)}</span>
            </div>
          </Tooltip>
          <Tooltip content="Total cost of displayed services">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Cost Total:</span>
              <span className="font-semibold">{formatCurrency(stats.totalCost)}</span>
            </div>
          </Tooltip>
          <Tooltip content="Average profit margin">
            <div className="flex items-center gap-2">
              {stats.avgMarginPercent >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span className="text-muted-foreground">Avg Margin:</span>
              <span
                className={cn(
                  'font-semibold',
                  stats.avgMarginPercent >= 0 ? 'text-green-600' : 'text-red-600'
                )}
              >
                {formatPercentage(stats.avgMarginPercent)}
              </span>
            </div>
          </Tooltip>
        </div>
        <div className="text-sm text-muted-foreground">
          Showing <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> to{' '}
          <span className="font-medium">{Math.min(currentPage * pageSize, total)}</span> of{' '}
          <span className="font-medium">{total}</span> services
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <BulkActions
          selectedCount={selectedIds.length}
          selectedIds={selectedIds}
          onClear={() => setSelectedIds([])}
          userRole={userRole}
        />
      )}

      {/* DataTable */}
      <Card className="overflow-hidden">
        <DataTable
          data={services}
          columns={columns}
          loading={loading || isPending}
          error={error}
          selectable
          selectedRows={selectedIds}
          onSelectionChange={setSelectedIds}
          defaultSort={{ key: sortBy, direction: sortOrder }}
          onSort={handleSort}
          onRowClick={(service) => router.push(`/services/${service.id}`)}
          rowActions={rowActions}
          pagination={{
            page: currentPage,
            pageSize,
            total,
            onPageChange: handlePageChange,
            onPageSizeChange: handlePageSizeChange,
          }}
          striped
          stickyHeader
          emptyState={
            <div className="py-12">
              <Truck size={48} className="mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-center text-lg font-medium">No services found</h3>
              <p className="text-center text-sm text-muted-foreground mt-1">
                Try adjusting your filters or create a new service
              </p>
              <div className="flex justify-center mt-4">
                <Button onClick={() => router.push('/services/new')} icon={<Plus size={16} />}>
                  Create Service
                </Button>
              </div>
            </div>
          }
        />
      </Card>
    </div>
  );
}

// Loading skeleton - reuse from DataTable's built-in loading state
export function ServicesTableSkeleton() {
  return <DataTable data={[]} columns={[]} loading loadingRows={5} />;
}

// Define columns
const getServiceColumns = (): Column<ServiceData>[] => [
  {
    key: 'serviceNumber',
    header: 'Service #',
    sortable: true,
    sticky: true,
    width: '120px',
    accessor: (service) => (
      <Tooltip content={`View service ${service.serviceNumber}`}>
        <span className="font-medium text-primary hover:underline">{service.serviceNumber}</span>
      </Tooltip>
    ),
  },
  {
    key: 'date',
    header: 'Date',
    sortable: true,
    width: '100px',
    accessor: (service) => (
      <Tooltip content={formatDate.relative(service.date)}>
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <span className="text-sm">{formatDate.dayMonth(service.date)}</span>
        </div>
      </Tooltip>
    ),
  },
  {
    key: 'client',
    header: 'Client',
    sortable: true,
    minWidth: '150px',
    accessor: (service) => (
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <div>
          <div className="text-sm font-medium truncate max-w-[150px]">{service.clientName}</div>
          <div className="text-xs text-muted-foreground">{service.clientCode}</div>
        </div>
      </div>
    ),
  },
  {
    key: 'supplier',
    header: 'Supplier',
    sortable: true,
    minWidth: '150px',
    accessor: (service) => (
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <div>
          <div className="text-sm font-medium truncate max-w-[150px]">{service.supplierName}</div>
          <div className="text-xs text-muted-foreground">{service.supplierCode}</div>
        </div>
      </div>
    ),
  },
  {
    key: 'driver',
    header: 'Driver',
    sortable: true,
    width: '120px',
    accessor: (service) => (
      <div className="flex items-center gap-1.5">
        <Truck className="h-3 w-3 text-muted-foreground" />
        <span className="text-sm">
          {service.driverName ?? <span className="text-muted-foreground italic">Not assigned</span>}
        </span>
      </div>
    ),
  },
  {
    key: 'vehiclePlate',
    header: 'Registration',
    width: '100px',
    accessor: (service) => <span className="text-sm font-mono">{service.vehiclePlate ?? '-'}</span>,
  },
  {
    key: 'cost',
    header: 'Cost',
    sortable: true,
    align: 'right',
    width: '100px',
    accessor: (service) => (
      <Tooltip content="Service cost">
        <span className="text-sm font-medium tabular-nums">
          {formatCurrency(service.costAmount)}
        </span>
      </Tooltip>
    ),
  },
  {
    key: 'sale',
    header: 'Sale',
    sortable: true,
    align: 'right',
    width: '100px',
    accessor: (service) => (
      <Tooltip content="Sale price">
        <span className="text-sm font-medium tabular-nums">
          {formatCurrency(service.saleAmount)}
        </span>
      </Tooltip>
    ),
  },
  {
    key: 'margin',
    header: 'Margin',
    sortable: true,
    align: 'right',
    width: '120px',
    accessor: (service) => {
      const marginPercent =
        service.saleAmount > 0 ? (service.margin / service.saleAmount) * 100 : 0;
      return (
        <div className="flex flex-col items-end gap-0.5">
          <Amount value={service.margin} />
          <span
            className={cn(
              'text-xs tabular-nums',
              marginPercent >= 0 ? 'text-green-600/70' : 'text-red-600/70'
            )}
          >
            {formatPercentage(marginPercent)}
          </span>
        </div>
      );
    },
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    align: 'center',
    width: '120px',
    accessor: (service) => <ServiceStatusBadge status={service.status} size="sm" />,
  },
];
