/**
 * Services Filters Component
 * Comprehensive filtering controls for services list
 */

'use client';

import { useState, useCallback, useTransition, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Search,
  X,
  Download,
  Filter,
  Calendar,
  Users,
  Building2,
  Clock,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Truck,
  Zap,
  Edit,
  Trash2,
  FileStack,
} from 'lucide-react';
import {
  Badge,
  Button,
  DateRangePicker,
  Input,
  Select,
  Card,
  CardBody,
  Tooltip,
  DropdownMenu,
  Checkbox,
} from '@/components/ui';
import { ServiceStatus } from '@/app/generated/prisma';
import { format, subDays, startOfWeek, startOfMonth } from 'date-fns';
import { useDebounce } from '@/hooks';
import { toast } from '@/lib/toast';
import { exportToExcel } from '@/lib/utils/export';
import { cn } from '@/lib/utils/cn';
import { ServiceStatusBadge } from './ServiceStatusBadge';
import {
  bulkUpdateServices,
  bulkDeleteServices,
  generateBulkLoadingOrders,
} from '@/actions/service-actions';
import { getStatusLabel, SERVICE_STATUS_CONFIG, STATUS_URL_MAP } from '@/lib/service-helpers';
import { ServicesFiltersProps } from '@/types/service';

export function ServicesFilters({
  clients,
  suppliers,
  currentFilters,
  activeCount,
  totalCount = 0,
  filteredCount = 0,
  selectedServices = [],
  onSelectionChange,
  onBulkAction,
  // onSaveFilter,
  savedFilters = [],
}: Readonly<ServicesFiltersProps>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [bulkActionLoading, setBulkActionLoading] = useState<string | null>(null);

  // Local search state for debouncing
  const [searchValue, setSearchValue] = useState(currentFilters.search);
  const debouncedSearch = useDebounce(searchValue, 300);

  // Update URL when debounced search changes
  useEffect(() => {
    if (debouncedSearch !== currentFilters.search) {
      updateFilter('search', debouncedSearch);
    }
  }, [debouncedSearch]);

  // Update filter in URL
  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());

      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }

      // Reset to page 1 when filters change
      if (key !== 'page') {
        params.set('page', '1');
      }

      startTransition(() => {
        router.push(`/services?${params.toString()}`);
      });
    },
    [searchParams, router]
  );

  // Batch update multiple filters
  const updateFilters = useCallback(
    (filters: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(filters).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });

      params.set('page', '1');

      startTransition(() => {
        router.push(`/services?${params.toString()}`);
      });
    },
    [searchParams, router]
  );

  // Clear all filters
  const clearFilters = useCallback(() => {
    setSearchValue('');
    startTransition(() => {
      router.push('/services');
    });
  }, [router]);

  // Handle bulk actions
  const handleBulkAction = useCallback(
    async (action: string, data?: any) => {
      if (!selectedServices.length) {
        toast.error('No services selected');
        return;
      }

      setBulkActionLoading(action);

      try {
        switch (action) {
          case 'updateStatus':
            await bulkUpdateServices(selectedServices, { status: data.status });
            toast.success(`Updated ${selectedServices.length} services`);
            break;

          case 'delete':
            if (confirm(`Delete ${selectedServices.length} services?`)) {
              await bulkDeleteServices(selectedServices);
              toast.success(`Deleted ${selectedServices.length} services`);
            }
            break;

          case 'loadingOrder': {
            const result = await generateBulkLoadingOrders(selectedServices);
            toast.success(`Generated ${result.count} loading orders`);
            break;
          }
        }

        onBulkAction?.(action as any, data);
        onSelectionChange?.([]);
        router.refresh();
      } catch (error) {
        console.error('Bulk action failed:', error);
        toast.error('Operation failed');
      } finally {
        setBulkActionLoading(null);
      }
    },
    [selectedServices, onBulkAction, onSelectionChange, router]
  );

  // Quick filter groups using status config
  const quickStatusGroups = useMemo(
    () => [
      {
        label: 'Active',
        url: 'confirmed',
        icon: Zap,
        color: 'text-blue-600 dark:text-blue-400',
        statuses: ['confirmed', 'in_progress'],
        count: 0, // Would be populated from actual data
      },
      {
        label: 'Pending',
        url: 'draft',
        icon: Clock,
        color: 'text-yellow-600 dark:text-yellow-400',
        statuses: ['draft'],
        count: 0,
      },
      {
        label: 'Complete',
        url: 'completed',
        icon: CheckCircle,
        color: 'text-green-600 dark:text-green-400',
        statuses: ['completed', 'invoiced'],
        count: 0,
      },
    ],
    []
  );

  // Preset date ranges
  const datePresets = useMemo(
    () => [
      {
        label: 'Today',
        value: 'today',
        icon: <Clock className="h-3 w-3" />,
        action: () => {
          const today = new Date();
          updateFilters({
            dateFrom: format(today, 'yyyy-MM-dd'),
            dateTo: format(today, 'yyyy-MM-dd'),
          });
        },
      },
      {
        label: 'This Week',
        value: 'week',
        icon: <Calendar className="h-3 w-3" />,
        action: () => {
          const start = startOfWeek(new Date(), { weekStartsOn: 1 });
          const end = new Date();
          updateFilters({
            dateFrom: format(start, 'yyyy-MM-dd'),
            dateTo: format(end, 'yyyy-MM-dd'),
          });
        },
      },
      {
        label: 'This Month',
        value: 'month',
        icon: <Calendar className="h-3 w-3" />,
        action: () => {
          const start = startOfMonth(new Date());
          const end = new Date();
          updateFilters({
            dateFrom: format(start, 'yyyy-MM-dd'),
            dateTo: format(end, 'yyyy-MM-dd'),
          });
        },
      },
      {
        label: 'Last 30 Days',
        value: '30days',
        icon: <Clock className="h-3 w-3" />,
        action: () => {
          const end = new Date();
          const start = subDays(end, 30);
          updateFilters({
            dateFrom: format(start, 'yyyy-MM-dd'),
            dateTo: format(end, 'yyyy-MM-dd'),
          });
        },
      },
    ],
    [updateFilters]
  );

  // Export to Excel
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportProgress(0);

    try {
      const params = new URLSearchParams();
      Object.entries(currentFilters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });

      setExportProgress(20);

      const response = await fetch(`/api/services/export?${params.toString()}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      setExportProgress(50);

      if (!response.ok) {
        throw new Error('Failed to fetch data for export');
      }

      const data = await response.json();
      setExportProgress(80);

      // Export using the generic utility
      await exportToExcel(
        data.services || [],
        `services_export_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`,
        'Services',
        {
          headers: [
            'Service Number',
            'Date',
            'Client',
            'Supplier',
            'Driver',
            'Vehicle',
            'Origin',
            'Destination',
            'Cost',
            'Sale',
            'Margin',
            'Status',
          ],
          transformRow: (row: any) => ({
            'Service Number': row.serviceNumber,
            Date: row.date ? format(new Date(row.date), 'yyyy-MM-dd') : '',
            Client: row.clientName || '',
            Supplier: row.supplierName || '',
            Driver: row.driverName || '-',
            Vehicle: row.vehiclePlate || '-',
            Origin: row.origin || '',
            Destination: row.destination || '',
            Cost: row.costAmount || 0,
            Sale: row.saleAmount || 0,
            Margin: row.margin || 0,
            Status: row.status || '',
          }),
          onProgress: (progress) => {
            setExportProgress(80 + progress * 0.2);
          },
        }
      );

      toast.success(`Successfully exported ${data.services?.length || 0} services`);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Failed to export services');
    } finally {
      setIsExporting(false);
      setExportProgress(0);
    }
  }, [currentFilters]);

  // Active filter badges
  const activeFilters = useMemo(() => {
    const filters = [];

    if (currentFilters.search) {
      filters.push({
        key: 'search',
        label: `Search: ${currentFilters.search}`,
        icon: <Search className="h-3 w-3" />,
      });
    }
    if (currentFilters.dateFrom || currentFilters.dateTo) {
      filters.push({
        key: 'date',
        label: `Date: ${currentFilters.dateFrom ? format(new Date(currentFilters.dateFrom), 'MMM d') : '...'} - ${currentFilters.dateTo ? format(new Date(currentFilters.dateTo), 'MMM d') : '...'}`,
        icon: <Calendar className="h-3 w-3" />,
      });
    }
    if (currentFilters.status) {
      const enumVal = STATUS_URL_MAP[currentFilters.status];
      if (enumVal !== undefined) {
        filters.push({
          key: 'status',
          label: getStatusLabel(enumVal),
          icon: <ServiceStatusBadge status={enumVal} size="sm" />,
        });
      }
    }
    if (currentFilters.clientId) {
      const client = clients.find((c) => c.id === currentFilters.clientId);
      filters.push({
        key: 'clientId',
        label: `Client: ${client?.name || 'Unknown'}`,
        icon: <Users className="h-3 w-3" />,
      });
    }
    if (currentFilters.supplierId) {
      const supplier = suppliers.find((s) => s.id === currentFilters.supplierId);
      filters.push({
        key: 'supplierId',
        label: `Supplier: ${supplier?.name || 'Unknown'}`,
        icon: <Building2 className="h-3 w-3" />,
      });
    }
    if (currentFilters.driver) {
      filters.push({
        key: 'driver',
        label: `Driver: ${currentFilters.driver}`,
        icon: <Truck className="h-3 w-3" />,
      });
    }

    return filters;
  }, [currentFilters, clients, suppliers]);

  return (
    <div className="space-y-4">
      {/* Filter Header with Stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters</span>
            {activeCount > 0 && (
              <Badge variant="active" size="sm">
                {activeCount} active
              </Badge>
            )}
          </div>

          {totalCount > 0 && (
            <div className="text-sm text-muted-foreground">
              Showing <span className="font-medium">{filteredCount}</span> of{' '}
              <span className="font-medium">{totalCount}</span> services
            </div>
          )}

          {selectedServices.length > 0 && (
            <>
              <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={selectedServices.length === filteredCount}
                  indeterminate={
                    selectedServices.length > 0 && selectedServices.length < filteredCount
                  }
                  onChange={(e) => {
                    if (e.target.checked) {
                      // Select all logic
                    } else {
                      onSelectionChange?.([]);
                    }
                  }}
                />
                <span className="text-sm font-medium">{selectedServices.length} selected</span>
              </div>
            </>
          )}
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          {/* Bulk Actions */}
          {selectedServices.length > 0 && (
            <DropdownMenu
              trigger={
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={bulkActionLoading !== null}
                  icon={<Edit className="h-4 w-4 mr-1" />}
                  loading={bulkActionLoading !== null}
                >
                  Bulk Actions
                </Button>
              }
              items={[
                {
                  id: 'status-header',
                  label: (
                    <div className="text-xs font-medium text-muted-foreground">Update Status</div>
                  ),
                  disabled: true,
                },
                ...Object.entries(SERVICE_STATUS_CONFIG).map(([status]) => {
                  const enumVal = status as ServiceStatus;
                  return {
                    id: `status-${status}`,
                    label: <ServiceStatusBadge status={enumVal} size="sm" showIcon />,
                    onClick: () => handleBulkAction('updateStatus', { status: enumVal }),
                  };
                }),

                { id: 'divider-1', divider: true },
                {
                  id: 'loadingOrder',
                  label: (
                    <div className="flex items-center gap-2">
                      <FileStack className="h-3 w-3" />
                      Generate Loading Orders
                    </div>
                  ),
                  onClick: () => {
                    handleBulkAction('loadingOrder');
                  },
                },
                { id: 'divider-2', divider: true },
                {
                  id: 'delete',
                  label: (
                    <div className="flex items-center gap-2 text-red-600">
                      <Trash2 className="h-3 w-3" />
                      Delete Selected
                    </div>
                  ),
                  onClick: () => {
                    handleBulkAction('delete');
                  },
                  danger: true,
                },
              ]}
            />
          )}

          {/* Saved Filters */}
          {savedFilters.length > 0 && (
            <DropdownMenu
              trigger={
                <Button variant="ghost" size="sm" icon={<Sparkles className="h-4 w-4 mr-1" />}>
                  Saved
                </Button>
              }
              items={savedFilters.map((filter) => ({
                id: filter.id,
                label: filter.name,
                onClick: () => updateFilters(filter.filters),
              }))}
            />
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            icon={
              showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
            }
          >
            Advanced
          </Button>
        </div>
      </div>

      {/* Main Filters */}
      <Card variant="bordered" className="overflow-visible">
        <CardBody className="p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                placeholder="Search service#, client, driver..."
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="pl-9"
                disabled={isPending}
              />
              {searchValue && (
                <button
                  onClick={() => setSearchValue('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Status Quick Filters */}
            <div className="flex items-center gap-2">
              {quickStatusGroups.map((group) => {
                const isActive = group.statuses.includes(currentFilters.status);
                return (
                  <Tooltip key={group.url} content={`Filter by ${group.label} services`}>
                    <Button
                      variant={isActive ? 'primary' : 'ghost'}
                      size="sm"
                      icon={<group.icon className="h-4 w-4 mr-1" />}
                      onClick={() => {
                        if (isActive) {
                          updateFilter('status', '');
                        } else if (group.statuses[0]) {
                          updateFilter('status', group.statuses[0]);
                        }
                      }}
                      className={cn('gap-1', !isActive && group.color)}
                    >
                      <span>{group.label}</span>
                      {group.count > 0 && (
                        <Badge variant="active" size="sm" className="ml-1">
                          {group.count}
                        </Badge>
                      )}
                    </Button>
                  </Tooltip>
                );
              })}

              {/* All Status Dropdown */}
              <DropdownMenu
                trigger={
                  <Button variant="ghost" size="sm" icon={<ChevronDown className="h-4 w-4 mr-1" />}>
                    All Status
                  </Button>
                }
                items={Object.entries(SERVICE_STATUS_CONFIG).map(([status]) => {
                  const enumVal = status as ServiceStatus;
                  const urlValue = Object.entries(STATUS_URL_MAP).find(
                    ([, v]) => v === enumVal
                  )?.[0];
                  return {
                    id: status,
                    label: <ServiceStatusBadge status={enumVal} size="sm" />,
                    onClick: () => updateFilter('status', urlValue ?? ''),
                  };
                })}
              />
            </div>

            {/* Date Range */}
            <DropdownMenu
              trigger={
                <Button variant="secondary" size="sm" icon={<Calendar className="h-4 w-4 mr-1" />}>
                  Date
                  {(currentFilters.dateFrom || currentFilters.dateTo) && (
                    <Badge variant="active" size="sm" className="ml-2">
                      1
                    </Badge>
                  )}
                </Button>
              }
              items={datePresets.map((preset) => ({
                id: preset.value,
                label: (
                  <div className="flex items-center gap-2">
                    {preset.icon}
                    {preset.label}
                  </div>
                ),
                onClick: preset.action,
              }))}
            />

            {/* Actions */}
            <div className="flex items-center gap-2">
              {activeCount > 0 && (
                <Tooltip content="Clear all filters">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    disabled={isPending}
                    icon={<X className="h-4 w-4" />}
                  >
                    Clear Filters
                  </Button>
                </Tooltip>
              )}

              <Tooltip content="Export filtered results">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleExport}
                  icon={<Download className="h-4 w-4" />}
                  disabled={isExporting}
                  loading={isExporting}
                  loadingText={
                    exportProgress > 0 ? `${Math.round(exportProgress)}%` : 'Processing...'
                  }
                >
                  Export
                </Button>
              </Tooltip>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Advanced Filters */}
      {showAdvanced && (
        <Card variant="bordered" className="animate-in slide-in-from-top-2">
          <CardBody className="p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Client */}
              <div>
                <label htmlFor="clientSelect" className="text-sm font-medium mb-1 block">
                  Client
                </label>
                <Select
                  id="clientSelect"
                  value={currentFilters.clientId}
                  onChange={(e) => updateFilter('clientId', e.target.value)}
                  options={[
                    { value: '', label: 'All Clients' },
                    ...clients.map((client) => ({
                      value: client.id,
                      label: client.name,
                      description: client.clientCode,
                    })),
                  ]}
                  placeholder="Select client"
                  searchable
                  className="w-full"
                />
              </div>

              {/* Supplier */}
              <div>
                <label htmlFor="supplierSelect" className="text-sm font-medium mb-1 block">
                  Supplier
                </label>
                <Select
                  id="supplierSelect"
                  value={currentFilters.supplierId}
                  onChange={(e) => updateFilter('supplierId', e.target.value)}
                  options={[
                    { value: '', label: 'All Suppliers' },
                    ...suppliers.map((supplier) => ({
                      value: supplier.id,
                      label: supplier.name,
                      description: supplier.supplierCode,
                    })),
                  ]}
                  placeholder="Select supplier"
                  searchable
                  className="w-full"
                />
              </div>

              {/* Driver */}
              <div>
                <label htmlFor="driverName" className="text-sm font-medium mb-1 block">
                  Driver
                </label>
                <Input
                  id="driverName"
                  value={currentFilters.driver}
                  onChange={(e) => updateFilter('driver', e.target.value)}
                  placeholder="Driver name..."
                  className="w-full"
                />
              </div>

              {/* Date Range Picker */}
              <div>
                <label htmlFor="dateRange" className="text-sm font-medium mb-1 block">
                  Custom Date Range
                </label>
                <DateRangePicker
                  id="dateRange"
                  from={currentFilters.dateFrom}
                  to={currentFilters.dateTo}
                  onSelect={(range) => {
                    updateFilter('dateFrom', range.from || '');
                    updateFilter('dateTo', range.to || '');
                  }}
                />
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Active Filter Badges */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((filter) => (
            <Badge
              key={filter.key}
              variant="active"
              // size="sm"
              className="gap-1 py-2.5 px-2"
              icon={filter.icon}
            >
              {/* <span>{filter.label}</span> */}
              <button
                onClick={() => {
                  if (filter.key === 'date') {
                    updateFilters({ dateFrom: '', dateTo: '' });
                  } else if (filter.key === 'search') {
                    setSearchValue('');
                  } else {
                    updateFilter(filter.key, '');
                  }
                }}
                className="ml-1 hover:bg-white/20 rounded p-0.5 transition-colors"
                aria-label={`Remove ${filter.label} filter`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
