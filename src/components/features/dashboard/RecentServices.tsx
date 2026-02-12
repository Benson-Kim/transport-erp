/**
 * Recent Services Component
 * Table showing recent service activity
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataTable,
  EmptyState,
  ErrorState,
  Column,
  Tooltip,
} from '@/components/ui';
import {
  ArrowRight,
  Truck,
  Clock,
  CheckCircle,
  RefreshCw,
  Plus,
  Eye,
  FileText,
  TrendingUp,
  Download,
  // Filter,
  Calendar,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ServiceStatus } from '@/app/generated/prisma';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/formatting';
import { getStatusDescription, getStatusIcon, getStatusVariant } from '@/lib/service-helpers';
import { formatDate } from '@/lib/utils/date-formats';

interface Service {
  id: string;
  serviceNumber: string;
  date: string;
  clientName: string;
  origin: string;
  destination: string;
  status: ServiceStatus;
  amount: number;
  currency: string;
}

interface RecentServicesProps {
  services?: Service[];
  loading?: boolean;
  error?: Error | null;
  onRefresh?: () => Promise<void>;
  showPagination?: boolean;
  pageSize?: number;
  onCreateNew?: () => void;
  onImport?: () => void;
  advanced?: boolean;
}

export function RecentServices({
  services = [],
  loading = false,
  error = null,
  onRefresh,
  showPagination = true,
  pageSize = 10,
  onCreateNew,
  onImport,
  advanced = false,
}: RecentServicesProps) {
  const router = useRouter();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPageSize, setSelectedPageSize] = useState(pageSize);
  const [selectedTab, setSelectedTab] = useState<'all' | 'active' | 'completed'>('all');
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'quarter' | 'year'>('month');

  // Filter services based on selected tab
  const filteredServices = useMemo(() => {
    let filtered = services;

    // Filter by status
    switch (selectedTab) {
      case 'active':
        filtered = services.filter((s) =>
          ([ServiceStatus.CONFIRMED, ServiceStatus.IN_PROGRESS] as ServiceStatus[]).includes(
            s.status
          )
        );
        break;
      case 'completed':
        filtered = services.filter((s) =>
          ([ServiceStatus.COMPLETED, ServiceStatus.INVOICED] as ServiceStatus[]).includes(s.status)
        );
        break;
    }

    // Filter by date range
    const now = new Date();
    const cutoffDate = new Date();

    switch (dateRange) {
      case 'week':
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        cutoffDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        cutoffDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        cutoffDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    return filtered.filter((s) => new Date(s.date) >= cutoffDate);
  }, [services, selectedTab, dateRange]);

  services = advanced ? filteredServices : services;

  // Calculate stats
  const stats = useMemo(() => {
    if (!services || services.length === 0) {
      return {
        total: 0,
        active: 0,
        completed: 0,
        totalValue: 0,
        avgValue: 0,
      };
    }

    const active = services.filter((s) =>
      ([ServiceStatus.CONFIRMED, ServiceStatus.IN_PROGRESS] as ServiceStatus[]).includes(s.status)
    ).length;
    const completed = services.filter((s) => s.status === ServiceStatus.COMPLETED).length;
    const totalValue = services.reduce((sum, s) => sum + s.amount, 0);
    const avgValue = totalValue / services.length;

    return {
      total: services.length,
      active,
      completed,
      totalValue,
      avgValue,
    };
  }, [services]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        // Default refresh behavior
        window.location.reload();
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [onRefresh]);

  // Define columns for DataTable
  const columns: Column<Service>[] = useMemo(
    () => [
      {
        key: 'serviceNumber',
        header: 'Service #',
        accessor: (row) => (
          <Tooltip content="View service details" position="top">
            <Link
              href={`/services/${row.id}`}
              className="font-medium text-sm hover:text-primary transition-colors inline-flex items-center gap-1 group"
            >
              {row.serviceNumber}
              <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          </Tooltip>
        ),
        sortable: true,
        width: '150px',
      },
      {
        key: 'date',
        header: (
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>Date</span>
          </div>
        ),
        accessor: (row) => (
          <Tooltip content={formatDate.full(row.date)} position="top">
            <span className="text-sm text-muted-foreground cursor-help">
              {formatDate.short(row.date)}
            </span>
          </Tooltip>
        ),
        sortable: true,
        width: '120px',
      },
      {
        key: 'clientName',
        header: 'Client',
        accessor: (row) => <div className="text-sm font-medium">{row.clientName}</div>,
        sortable: true,
        minWidth: '150px',
      },
      {
        key: 'route',
        header: 'Route',
        accessor: (row) => (
          <div className="text-sm text-muted-foreground flex items-center gap-1.5">
            <span className="font-medium">{row.origin}</span>
            <ArrowRight className="h-3 w-3 text-neutral-400" />
            <span className="font-medium">{row.destination}</span>
          </div>
        ),
        minWidth: '200px',
      },
      {
        key: 'status',
        header: 'Status',
        accessor: (row) => (
          <Tooltip content={getStatusDescription(row.status)} position="top">
            <div className="inline-block">
              <Badge
                variant={getStatusVariant(row.status)}
                icon={getStatusIcon(row.status)}
                size="sm"
                pulse={row.status === ServiceStatus.IN_PROGRESS}
              >
                {row.status.replace('_', ' ')}
              </Badge>
            </div>
          </Tooltip>
        ),
        sortable: true,
        width: '140px',
      },
      {
        key: 'amount',
        header: 'Amount',
        accessor: (row) => (
          <Tooltip
            content={`${row.currency} ${row.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            position="top"
          >
            <span className="text-sm font-semibold tabular-nums cursor-help">
              {row.currency === 'EUR' ? '€' : row.currency}
              {row.amount.toLocaleString()}
            </span>
          </Tooltip>
        ),
        sortable: true,
        sortKey: 'amount',
        align: 'right',
        width: '120px',
      },
    ],
    []
  );

  // Row actions
  const rowActions = useCallback(
    (row: Service) => (
      <div className="flex items-center gap-1">
        <Tooltip content="View details" position="left">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/services/${row.id}`)}
            className="h-7 w-7 p-0"
            iconPosition="center"
            icon={<Eye className="h-3.5 w-3.5" />}
          />
        </Tooltip>
      </div>
    ),
    [router]
  );

  // Bulk actions
  const bulkActions = useCallback((selectedRows: Service[]) => {
    const totalValue = selectedRows.reduce((sum, row) => sum + row.amount, 0);

    return (
      <>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{selectedRows.length} selected</span>
          <span>•</span>
          <span> {formatCurrency(totalValue)} total</span>
        </div>
        <Tooltip content="Download data as CSV file" position="bottom">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              console.log('Export selected:', selectedRows);
            }}
            icon={<Download className="h-3 w-3" />}
          >
            Export
          </Button>
        </Tooltip>
      </>
    );
  }, []);

  // Calculate pagination
  const paginationConfig = showPagination
    ? {
        page: currentPage,
        pageSize: selectedPageSize,
        total: services.length,
        onPageChange: setCurrentPage,
        onPageSizeChange: setSelectedPageSize,
      }
    : undefined;

  // Header action
  const headerAction = (
    <div className="flex items-center gap-3">
      {/* Stats */}
      {services.length > 0 && (
        <>
          <div className="flex items-center gap-3 text-sm">
            <Tooltip content="Total services in the list" position="bottom">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg cursor-help">
                <Truck className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="font-semibold text-blue-900 dark:text-blue-200">
                  {stats.total}
                </span>
              </div>
            </Tooltip>

            <Tooltip content="Services in progress or confirmed" position="bottom">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg cursor-help">
                <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                <span className="font-semibold text-yellow-900 dark:text-yellow-200">
                  {stats.active}
                </span>
              </div>
            </Tooltip>

            <Tooltip content={`Total value: ${formatCurrency(stats.totalValue)}`} position="bottom">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/20 rounded-lg cursor-help">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="font-semibold text-green-900 dark:text-green-200">
                  {formatCurrency(stats.avgValue)}
                  <span className="text-xs font-normal opacity-75 ml-1">avg</span>
                </span>
              </div>
            </Tooltip>
          </div>

          <div className="h-8 w-px bg-neutral-200 dark:bg-neutral-700" />
        </>
      )}

      {/* Actions */}
      <Button
        size="sm"
        variant="secondary"
        onClick={handleRefresh}
        disabled={isRefreshing}
        loading={isRefreshing}
        loadingText="Refreshing..."
        icon={<RefreshCw className="h-3.5 w-3.5" />}
      >
        Refresh
      </Button>

      {onCreateNew && (
        <Button
          size="sm"
          variant="primary"
          onClick={onCreateNew}
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          New Service
        </Button>
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={() => router.push('/services')}
        icon={<ArrowRight className="h-3.5 w-3.5" />}
        iconPosition="right"
      >
        View All
      </Button>
    </div>
  );

  // Handle error state
  if (!loading && error) {
    const errorStateProps: Parameters<typeof ErrorState>[0] = {
      error,
      title: 'Failed to load services',
      description:
        "We couldn't fetch your recent services. Please check your connection and try again.",
      variant: 'card' as const,
    };

    if (onRefresh) {
      errorStateProps.onRetry = handleRefresh;
    }

    return (
      <Card variant="elevated" padding="none">
        <CardHeader title="Recent Services" subtitle="Your latest service activity" />
        <CardBody>
          <ErrorState {...errorStateProps} />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {advanced && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardBody className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Services</p>
                    <p className="text-2xl font-bold">{stats.total}</p>
                    <p className="text-xs text-muted-foreground mt-1">This {dateRange}</p>
                  </div>
                  <Truck className="h-8 w-8 text-primary/20" />
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Active</p>
                    <p className="text-2xl font-bold text-yellow-600">{stats.active}</p>
                    <p className="text-xs text-muted-foreground mt-1">In progress</p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-500/20" />
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
                    <p className="text-xs text-muted-foreground mt-1">Successfully</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500/20" />
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Value</p>
                    <p className="text-2xl font-bold"> {formatCurrency(stats.totalValue)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Revenue</p>
                  </div>
                  <FileText className="h-8 w-8 text-blue-500/20" />
                </div>
              </CardBody>
            </Card>
          </div>

          {/* Filters */}
          <div className="flex items-center justify-between">
            {/* Status Tabs */}
            <div className="flex gap-2">
              {(['all', 'active', 'completed'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSelectedTab(tab)}
                  className={cn(
                    'cursor-pointer px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-[2px]',
                    selectedTab === tab
                      ? 'text-primary border-primary'
                      : 'text-muted-foreground border-transparent hover:text-foreground'
                  )}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  <span className="ml-2 text-xs opacity-60">
                    (
                    {tab === 'all'
                      ? services.length
                      : tab === 'active'
                        ? services.filter((s) =>
                            (
                              [
                                ServiceStatus.CONFIRMED,
                                ServiceStatus.IN_PROGRESS,
                              ] as ServiceStatus[]
                            ).includes(s.status)
                          ).length
                        : services.filter((s) => s.status === ServiceStatus.COMPLETED).length}
                    )
                  </span>
                </button>
              ))}
            </div>

            {/* Date Range Filter */}
            <div className="flex gap-1 p-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg">
              {(['week', 'month', 'quarter', 'year'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={cn(
                    'px-3 py-1 text-xs font-medium rounded transition-colors',
                    dateRange === range
                      ? 'bg-white dark:bg-neutral-900 shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <Card variant="elevated" padding="none">
        <CardHeader
          title="Recent Services"
          subtitle="Your latest service activity and status"
          action={headerAction}
        />

        <CardBody className="p-0">
          <DataTable
            data={services}
            columns={columns}
            loading={loading}
            error={error}
            // Selection
            selectable={true}
            // Sorting
            sortable={true}
            defaultSort={{ key: 'date', direction: 'desc' }}
            // Actions
            onRowClick={(row) => router.push(`/services/${row.id}`)}
            rowActions={rowActions}
            bulkActions={bulkActions}
            // Pagination
            {...(paginationConfig && { pagination: paginationConfig })}
            // Features
            searchable={true}
            searchPlaceholder="Search by service number, client, or route..."
            exportable={true}
            columnToggle={true}
            stickyHeader={true}
            // Empty state
            emptyState={
              <EmptyState
                variant="custom"
                icon={<Truck size={48} />}
                title="No services yet"
                description="Start managing your transportation services"
                action={
                  onCreateNew
                    ? {
                        label: 'Create Service',
                        onClick: onCreateNew,
                        icon: <Plus size={16} />,
                      }
                    : {
                        label: 'Refresh',
                        onClick: handleRefresh,
                        icon: <RefreshCw size={16} />,
                      }
                }
                secondaryAction={
                  onImport
                    ? {
                        label: 'Import Services',
                        onClick: onImport,
                      }
                    : undefined
                }
              />
            }
            // Loading
            loadingRows={5}
            // Styling
            compact={true}
            bordered={false}
            striped={true}
          />
        </CardBody>
      </Card>
    </div>
  );
}
