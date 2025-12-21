// components/features/services/ServicesTable.tsx
'use client';

import { useState, useCallback, useTransition, useMemo, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserRole } from '@/app/generated/prisma';
import {
  ChevronUp,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Truck,
  Plus,
} from 'lucide-react';
import {
  Checkbox,
  Pagination,
  Button,
  Tooltip,
  Card,
  CardBody,
  EmptyState,
  Skeleton,
  Alert,
} from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { ServiceData } from '@/types/service';
import { formatCurrency, formatPercentage } from '@/lib/utils/formatting';
import { BulkActions } from './BulkActions';
import { ServiceRow } from './ServiceRow';
// import { hasPermission } from '@/lib/permissions';

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
  onRefresh?: () => void;
}

// Column configuration
const COLUMNS = [
  { key: 'serviceNumber', label: 'Service #', sortable: true, sticky: true, width: '120px' },
  { key: 'date', label: 'Date', sortable: true, width: '100px' },
  { key: 'client', label: 'Client', sortable: true, minWidth: '150px' },
  { key: 'supplier', label: 'Supplier', sortable: true, minWidth: '150px' },
  { key: 'driver', label: 'Driver', sortable: true, width: '120px' },
  { key: 'vehiclePlate', label: 'Registration', sortable: false, width: '100px' },
  { key: 'cost', label: 'Cost', sortable: true, align: 'right' as const, width: '100px' },
  { key: 'sale', label: 'Sale', sortable: true, align: 'right' as const, width: '100px' },
  { key: 'margin', label: 'Margin', sortable: true, align: 'right' as const, width: '120px' },
  { key: 'status', label: 'Status', sortable: true, align: 'center' as const, width: '120px' },
];

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
  onRefresh,
}: ServicesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Selection state
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Refs
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Calculate stats
  const stats = useMemo(() => {
    const visibleServices = services;
    const totalCost = visibleServices.reduce((sum, s) => sum + s.costAmount, 0);
    const totalSale = visibleServices.reduce((sum, s) => sum + s.saleAmount, 0);
    const totalMargin = totalSale - totalCost;
    const avgMarginPercent = totalSale > 0 ? (totalMargin / totalSale) * 100 : 0;

    return {
      totalCost,
      totalSale,
      totalMargin,
      avgMarginPercent,
      count: visibleServices.length,
    };
  }, [services]);

  // Handle sorting
  const handleSort = useCallback(
    (column: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (sortBy === column) {
        params.set('sortOrder', sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        params.set('sortBy', column);
        params.set('sortOrder', 'desc');
      }

      startTransition(() => {
        router.push(`/services?${params.toString()}`);
      });
    },
    [sortBy, sortOrder, searchParams, router]
  );

  // Handle selection
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedServices(new Set(services.map((s) => s.id)));
      } else {
        setSelectedServices(new Set());
      }
    },
    [services]
  );

  const handleSelectService = useCallback(
    (serviceId: string, index: number, event: React.MouseEvent) => {
      const newSelected = new Set(selectedServices);

      if (event.shiftKey && lastSelectedIndex !== null) {
        // Range selection
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);

        for (let i = start; i <= end; i++) {
          const service = services[i];
          if (service) newSelected.add(service.id);
        }
      } else if (event.ctrlKey || event.metaKey) {
        // Toggle selection
        if (newSelected.has(serviceId)) {
          newSelected.delete(serviceId);
        } else {
          newSelected.add(serviceId);
        }
      } else {
        // Single selection
        if (newSelected.has(serviceId)) {
          newSelected.delete(serviceId);
        } else {
          newSelected.add(serviceId);
        }
      }

      setSelectedServices(newSelected);
      setLastSelectedIndex(index);
    },
    [selectedServices, lastSelectedIndex, services]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Select all: Ctrl/Cmd + A
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        handleSelectAll(true);
      }
      // Clear selection: Escape
      if (e.key === 'Escape') {
        setSelectedServices(new Set());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSelectAll]);

  // Loading state
  if (loading && services.length === 0) {
    return <ServicesTableSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardBody>
          <Alert variant="error">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Failed to load services</p>
                <p className="text-sm mt-1">{error.message}</p>
              </div>
              {onRefresh && (
                <Button variant="secondary" size="sm" onClick={onRefresh}>
                  Retry
                </Button>
              )}
            </div>
          </Alert>
        </CardBody>
      </Card>
    );
  }

  // Empty state
  if (!loading && services.length === 0) {
    return (
      <Card>
        <CardBody className="py-12">
          <EmptyState
            icon={<Truck size={48} />}
            title="No services found"
            description="Try adjusting your filters or create a new service"
            action={{
              label: 'Create Service',
              onClick: () => router.push('/services/new'),
              icon: <Plus size={16} />,
            }}
          />
        </CardBody>
      </Card>
    );
  }

  // Pagination info
  const startIndex = (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, total);
  const totalPages = Math.ceil(total / pageSize);

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
          Showing <span className="font-medium">{startIndex}</span> to{' '}
          <span className="font-medium">{endIndex}</span> of{' '}
          <span className="font-medium">{total}</span> services
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedServices.size > 0 && (
        <BulkActions
          selectedCount={selectedServices.size}
          selectedIds={Array.from(selectedServices)}
          onClear={() => setSelectedServices(new Set())}
          userRole={userRole}
        />
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <div ref={tableContainerRef} className="relative overflow-auto max-h-[600px]">
          <table className="w-full">
            <thead className="sticky top-0 z-20">
              <tr className="bg-white dark:bg-neutral-950 border-b">
                {/* Checkbox Column - Sticky */}
                <th className="sticky left-0 z-30 bg-white dark:bg-neutral-950 p-3 w-12">
                  <Checkbox
                    checked={selectedServices.size === services.length && services.length > 0}
                    indeterminate={
                      selectedServices.size > 0 && selectedServices.size < services.length
                    }
                    onCheckedChange={handleSelectAll}
                    aria-label="Select all services"
                  />
                </th>

                {/* Service Number Column - Sticky */}
                <th className="sticky left-12 z-25 bg-white dark:bg-neutral-950 p-3 min-w-[120px] text-left">
                  <button
                    onClick={() => handleSort('serviceNumber')}
                    disabled={isPending}
                    className="inline-flex items-center gap-1 hover:text-foreground transition-colors font-medium text-sm text-muted-foreground"
                  >
                    <span>Service #</span>
                    <div className="flex flex-col -space-y-1">
                      <ChevronUp
                        className={cn(
                          'h-3 w-3 transition-colors',
                          sortBy === 'serviceNumber' && sortOrder === 'asc'
                            ? 'text-primary'
                            : 'text-muted-foreground/30'
                        )}
                      />
                      <ChevronDown
                        className={cn(
                          'h-3 w-3 transition-colors',
                          sortBy === 'serviceNumber' && sortOrder === 'desc'
                            ? 'text-primary'
                            : 'text-muted-foreground/30'
                        )}
                      />
                    </div>
                  </button>
                </th>

                {/* Regular Columns */}
                {COLUMNS.filter((col) => col.key !== 'serviceNumber').map((column) => (
                  <th
                    key={column.key}
                    className={cn(
                      'p-3 bg-white dark:bg-neutral-950',
                      'font-medium text-sm text-muted-foreground',
                      column.align === 'center' && 'text-center',
                      column.align === 'right' && 'text-right'
                    )}
                    style={{
                      width: column.width,
                      minWidth: column.minWidth,
                    }}
                  >
                    {column.sortable ? (
                      <button
                        onClick={() => handleSort(column.key)}
                        disabled={isPending}
                        className={cn(
                          'inline-flex items-center gap-1 hover:text-foreground transition-colors w-full',
                          column.align === 'right' && 'justify-end',
                          column.align === 'center' && 'justify-center'
                        )}
                      >
                        <span>{column.label}</span>
                        <div className="flex flex-col -space-y-1">
                          <ChevronUp
                            className={cn(
                              'h-3 w-3 transition-colors',
                              sortBy === column.key && sortOrder === 'asc'
                                ? 'text-primary'
                                : 'text-muted-foreground/30'
                            )}
                          />
                          <ChevronDown
                            className={cn(
                              'h-3 w-3 transition-colors',
                              sortBy === column.key && sortOrder === 'desc'
                                ? 'text-primary'
                                : 'text-muted-foreground/30'
                            )}
                          />
                        </div>
                      </button>
                    ) : (
                      <span>{column.label}</span>
                    )}
                  </th>
                ))}

                {/* Actions Column */}
                <th className="p-3 bg-white dark:bg-neutral-950 text-center font-medium text-sm text-muted-foreground w-20">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {services.map((service, index) => (
                <ServiceRow
                  key={service.id}
                  service={service}
                  index={index}
                  isSelected={selectedServices.has(service.id)}
                  isHovered={hoveredRow === service.id}
                  isExpanded={expandedRows.has(service.id)}
                  onSelect={(event) => handleSelectService(service.id, index, event)}
                  onMouseEnter={() => setHoveredRow(service.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  onToggleExpand={() => {
                    const newExpanded = new Set(expandedRows);
                    if (newExpanded.has(service.id)) {
                      newExpanded.delete(service.id);
                    } else {
                      newExpanded.add(service.id);
                    }
                    setExpandedRows(newExpanded);
                  }}
                  userRole={userRole}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Pagination */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={total}
          showPageSize
          pageSizeOptions={[20, 50, 100]}
          onPageChange={(page) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set('page', page.toString());
            router.push(`/services?${params.toString()}`);
          }}
          onPageSizeChange={(size) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set('pageSize', size.toString());
            params.set('page', '1');
            router.push(`/services?${params.toString()}`);
          }}
        />
      </div>
    </div>
  );
}

// Loading skeleton
export function ServicesTableSkeleton() {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-neutral-50">
              {Array.from({ length: 12 }).map((_, i) => (
                <th key={i} className="p-3">
                  <Skeleton className="h-4 w-full" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b">
                {Array.from({ length: 12 }).map((_, j) => (
                  <td key={j} className="p-3">
                    <Skeleton className="h-4 w-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
