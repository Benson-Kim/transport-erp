/**
 * DataTable Component
 * Advanced table with sorting, selection, pagination, and more
 */
'use client';

import { ReactNode, useState, useMemo, useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Download, Settings, Check, X, Search } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { exportToExcel, exportToCsv } from '@/lib/utils/export';
import { useTableSelection, useTableSort } from '@/hooks';

import {
  Button,
  Checkbox,
  DropdownMenu,
  EmptyState,
  Input,
  Skeleton,
  Pagination,
  Table,
} from '@/components/ui';

export interface Column<T> {
  key: string;
  header: string | ReactNode;
  accessor: (row: T) => ReactNode;
  sortable?: boolean;
  sortKey?: string;
  width?: string;
  minWidth?: string;
  align?: 'left' | 'center' | 'right';
  sticky?: boolean;
  hidden?: boolean;
  cellClassName?: string | ((row: T) => string);
}

export interface DataTableProps<T extends { id: string }> {
  data: T[];
  columns: Column<T>[];
  loading?: boolean;
  error?: Error | null;

  // Selection
  selectable?: boolean;
  selectedRows?: string[];
  onSelectionChange?: (selectedIds: string[]) => void;

  // Sorting
  sortable?: boolean;
  defaultSort?: { key: string; direction: 'asc' | 'desc' };
  onSort?: (key: string, direction: 'asc' | 'desc') => void;

  // Actions
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  bulkActions?: (selectedRows: T[]) => ReactNode;

  // Pagination
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
  };

  // Features
  searchable?: boolean;
  searchPlaceholder?: string;
  exportable?: boolean;
  columnToggle?: boolean;
  virtualScroll?: boolean;
  stickyHeader?: boolean;

  // States
  emptyState?: ReactNode;
  loadingRows?: number;

  // Styling
  className?: string;
  rowClassName?: string | ((row: T) => string);
  compact?: boolean;
  bordered?: boolean;
  striped?: boolean;
}

export function DataTable<T extends { id: string }>({
  data,
  columns: initialColumns,
  loading = false,
  error = null,

  selectable = false,
  selectedRows = [],
  onSelectionChange,

  // sortable = false,
  defaultSort,
  onSort,

  onRowClick,
  rowActions,
  bulkActions,

  pagination,

  searchable = false,
  searchPlaceholder = 'Search...',
  exportable = false,
  columnToggle = false,
  virtualScroll = false,
  stickyHeader = true,

  emptyState,
  loadingRows = 10,

  className,
  rowClassName,
  compact = false,
  bordered = false,
  striped = false,
}: Readonly<DataTableProps<T>>) {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(initialColumns.filter((col) => !col.hidden).map((col) => col.key))
  );

  // Refs
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  // Hooks
  const { sortKey, sortDirection, handleSort } = useTableSort({
    defaultSort,
    onSort,
  });

  const { selectedIds, isAllSelected, isIndeterminate, toggleAll, toggle, clear } =
    useTableSelection({
      data,
      selectedRows,
      onChange: onSelectionChange,
    });

  // Filter columns based on visibility
  const columns = useMemo(
    () => initialColumns.filter((col) => visibleColumns.has(col.key)),
    [initialColumns, visibleColumns]
  );

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!searchQuery) return data;

    return data.filter((row) => {
      const searchableText = columns
        .map((col) => {
          const value = col.accessor(row);
          return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
        })
        .join(' ')
        .toLowerCase();

      return searchableText.includes(searchQuery.toLowerCase());
    });
  }, [data, searchQuery, columns]);

  // Virtual scrolling
  const rowVirtualizer = useVirtualizer({
    count: filteredData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => (compact ? 36 : 48), [compact]),
    overscan: 5,
  });

  // Export handlers
  const handleExportExcel = useCallback(() => {
    const exportData = filteredData.map((row) => {
      const rowData: Record<string, any> = {};
      columns.forEach((col) => {
        rowData[typeof col.header === 'string' ? col.header : col.key] = col.accessor(row);
      });
      return rowData;
    });

    exportToExcel(exportData, 'data-export');
  }, [filteredData, columns]);

  const handleExportCsv = useCallback(() => {
    const exportData = filteredData.map((row) => {
      const rowData: Record<string, any> = {};
      columns.forEach((col) => {
        rowData[typeof col.header === 'string' ? col.header : col.key] = col.accessor(row);
      });
      return rowData;
    });

    exportToCsv(exportData, 'data-export');
  }, [filteredData, columns]);

  // Toggle column visibility
  const toggleColumnVisibility = useCallback((columnKey: string) => {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(columnKey)) {
        next.delete(columnKey);
      } else {
        next.add(columnKey);
      }
      return next;
    });
  }, []);

  // Get selected rows data
  const selectedRowsData = useMemo(
    () => data.filter((row) => selectedIds.has(row.id)),
    [data, selectedIds]
  );

  // Handle row click
  const handleRowClick = useCallback(
    (row: T, e: React.MouseEvent) => {
      // Don't trigger if clicking on checkbox or actions
      const target = e.target as HTMLElement;
      if (target.closest('[data-no-row-click]')) return;

      onRowClick?.(row);
    },
    [onRowClick]
  );

  // Render loading state
  if (loading && !data.length) {
    return (
      <div className={cn('w-full', className)}>
        <LoadingTable columns={columns} rows={loadingRows} compact={compact} />
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className={cn('w-full', className)}>
        <ErrorState error={error} onRetry={() => globalThis.location.reload()} />
      </div>
    );
  }

  // Render empty state
  if (!loading && filteredData.length === 0) {
    return (
      <div className={cn('w-full', className)}>
        {emptyState || (
          <EmptyState
            title={searchQuery ? 'No results found' : 'No data'}
            description={
              searchQuery ? 'Try adjusting your search terms' : 'There are no items to display'
            }
            icon={searchQuery ? <Search size={48} /> : undefined}
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn('w-full space-y-4', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {searchable && (
            <Input
              type="search"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              prefix={<Search size={16} />}
              className="w-64"
            />
          )}

          {bulkActions && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 pl-4 border-l">
              <span className="text-sm text-neutral-600">{selectedIds.size} selected</span>
              {bulkActions(selectedRowsData)}
              <Button variant="ghost" size="sm" onClick={clear}>
                Clear
              </Button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {columnToggle && (
            <DropdownMenu
              trigger={
                <Button variant="ghost" size="sm" icon={<Settings size={16} />}>
                  Columns
                </Button>
              }
              items={initialColumns.map((col) => ({
                id: col.key,
                label: (
                  <div className="flex items-center justify-between w-full">
                    <span>{typeof col.header === 'string' ? col.header : col.key}</span>
                    {visibleColumns.has(col.key) && <Check size={16} />}
                  </div>
                ),
                onClick: () => toggleColumnVisibility(col.key),
              }))}
            />
          )}

          {exportable && (
            <DropdownMenu
              trigger={
                <Button variant="ghost" size="sm" icon={<Download size={16} />}>
                  Export
                </Button>
              }
              items={[
                {
                  id: 'excel',
                  label: 'Export as Excel',
                  onClick: handleExportExcel,
                },
                {
                  id: 'csv',
                  label: 'Export as CSV',
                  onClick: handleExportCsv,
                },
              ]}
            />
          )}
        </div>
      </div>

      {/* Table */}
      <div
        ref={tableContainerRef}
        className={cn('overflow-auto rounded-lg', bordered && 'border border-neutral-200')}
      >
        <div ref={parentRef} className={virtualScroll ? 'h-[600px] overflow-auto' : undefined}>
          <Table fixed={virtualScroll}>
            <Table.Header sticky={stickyHeader}>
              <Table.Row>
                {selectable && (
                  <Table.HeaderCell className="w-12">
                    <div data-no-row-click>
                      <Checkbox
                        checked={isAllSelected}
                        indeterminate={isIndeterminate}
                        onChange={toggleAll}
                        aria-label="Select all rows"
                      />
                    </div>
                  </Table.HeaderCell>
                )}

                {columns.map((column) => (
                  <Table.HeaderCell
                    key={column.key}
                    sortable={!!column.sortable}
                    sorted={sortKey === (column.sortKey || column.key) ? sortDirection : false}
                    sticky={column.sticky || false}
                    style={{
                      width: column.width,
                      minWidth: column.minWidth,
                    }}
                    onClick={
                      column.sortable ? () => handleSort(column.sortKey || column.key) : undefined
                    }
                    className={cn(
                      column.align === 'center' && 'text-center',
                      column.align === 'right' && 'text-right'
                    )}
                  >
                    {column.header}
                  </Table.HeaderCell>
                ))}

                {rowActions && (
                  <Table.HeaderCell className="w-20" align="center">
                    Actions
                  </Table.HeaderCell>
                )}
              </Table.Row>
            </Table.Header>

            <Table.Body>
              {virtualScroll ? (
                <>
                  {rowVirtualizer
                    .getVirtualItems()
                    .map((virtualRow: { index: number; size: number; start: number }) => {
                      const row = filteredData[virtualRow.index];
                      if (!row) return null;
                      return (
                        <DataTableRow
                          key={row.id}
                          row={row}
                          columns={columns}
                          selectable={selectable}
                          isSelected={selectedIds.has(row.id)}
                          onToggle={() => toggle(row.id)}
                          onClick={(e: React.MouseEvent) => handleRowClick(row, e)}
                          {...(rowActions && { rowActions })}
                          {...(rowClassName && { rowClassName })}
                          compact={compact}
                          striped={striped && virtualRow.index % 2 === 1}
                          style={{
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        />
                      );
                    })}
                </>
              ) : (
                filteredData.map((row, index) => (
                  <DataTableRow
                    key={row.id}
                    row={row}
                    columns={columns}
                    selectable={selectable}
                    isSelected={selectedIds.has(row.id)}
                    onToggle={() => toggle(row.id)}
                    onClick={(e) => handleRowClick(row, e)}
                    {...(rowActions && { rowActions })}
                    {...(rowClassName && { rowClassName })}
                    compact={compact}
                    striped={striped && index % 2 === 1}
                  />
                ))
              )}
            </Table.Body>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {pagination && (
        <Pagination
          currentPage={pagination.page}
          totalPages={Math.ceil(pagination.total / pagination.pageSize)}
          onPageChange={pagination.onPageChange}
          showPageSize
          pageSize={pagination.pageSize}
          {...(pagination.onPageSizeChange && { onPageSizeChange: pagination.onPageSizeChange })}
          totalItems={pagination.total}
        />
      )}
    </div>
  );
}

// DataTable Row Component
interface DataTableRowProps<T extends { id: string }> {
  row: T;
  columns: Column<T>[];
  selectable?: boolean;
  isSelected: boolean;
  onToggle: () => void;
  onClick: (e: React.MouseEvent) => void;
  rowActions?: (row: T) => ReactNode;
  rowClassName?: string | ((row: T) => string);
  compact?: boolean;
  striped?: boolean;
  style?: React.CSSProperties;
}

function DataTableRow<T extends { id: string }>({
  row,
  columns,
  selectable,
  isSelected,
  onToggle,
  onClick,
  rowActions,
  rowClassName,
  compact,
  striped,
  style,
}: Readonly<DataTableRowProps<T>>) {
  const className = typeof rowClassName === 'function' ? rowClassName(row) : rowClassName;

  return (
    <Table.Row
      selected={isSelected}
      onClick={onClick}
      clickable={!!onClick}
      className={cn(compact && 'h-9', striped && 'bg-neutral-50', className)}
      style={style}
    >
      {selectable && (
        <Table.Cell className="w-12">
          <div data-no-row-click>
            <Checkbox
              checked={isSelected}
              onChange={onToggle}
              aria-label={`Select row ${row.id}`}
            />
          </div>
        </Table.Cell>
      )}

      {columns.map((column) => (
        <Table.Cell
          key={column.key}
          sticky={column.sticky || false}
          align={column.align ?? 'left'}
          className={
            typeof column.cellClassName === 'function'
              ? column.cellClassName(row)
              : column.cellClassName
          }
        >
          {column.accessor(row)}
        </Table.Cell>
      ))}

      {rowActions && (
        <Table.Cell align="center">
          <div data-no-row-click>{rowActions(row)}</div>
        </Table.Cell>
      )}
    </Table.Row>
  );
}

// Loading Table Component
function LoadingTable({
  columns,
  rows,
  compact,
}: Readonly<{
  columns: Column<any>[];
  rows: number;
  compact?: boolean;
}>) {
  return (
    <Table>
      <Table.Header>
        <Table.Row>
          {columns.map((col) => (
            <Table.HeaderCell key={col.key}>
              <Skeleton className="h-4 w-20" />
            </Table.HeaderCell>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {Array.from({ length: rows }).map((_, index) => (
          <Table.Row key={index}>
            {columns.map((col) => (
              <Table.Cell key={col.key}>
                <Skeleton className={cn('w-full', compact ? 'h-6' : 'h-8')} />
              </Table.Cell>
            ))}
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
}

// Error State Component
function ErrorState({ error, onRetry }: Readonly<{ error: Error; onRetry?: () => void }>) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="text-red-500 mb-4">
        <X size={48} />
      </div>
      <h3 className="text-lg font-medium text-neutral-900 mb-2">Error loading data</h3>
      <p className="text-sm text-neutral-600 mb-4">{error.message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="secondary">
          Try Again
        </Button>
      )}
    </div>
  );
}
