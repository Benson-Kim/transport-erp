'use client';

/**
 * Clients Table Component
 */

import { useState, useCallback, useTransition } from 'react';

import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Eye,
  Loader2,
  Building2,
  FileSpreadsheet,
} from 'lucide-react';

import { deleteClient, bulkDeleteClients, exportClients } from '@/actions/client-actions';
import {
  Table,
  Button,
  Input,
  Select,
  Badge,
  Modal,
  Pagination,
  Alert,
  DropdownMenu,
  Skeleton,
} from '@/components/ui';
import type { DropdownMenuItem } from '@/components/ui';
import type { ClientListItem, PaginatedClients } from '@/types/client';

interface ClientsTableProps {
  data: PaginatedClients;
  countries: string[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
}

type SortField = 'name' | 'clientCode' | 'country' | 'servicesCount' | 'createdAt';

/**
 * Clients Table Loading Skeleton
 */
const SKELETON_ROW_IDS = [
  'skeleton-row-1',
  'skeleton-row-2',
  'skeleton-row-3',
  'skeleton-row-4',
  'skeleton-row-5',
  'skeleton-row-6',
  'skeleton-row-7',
  'skeleton-row-8',
  'skeleton-row-9',
  'skeleton-row-10',
] as const;

export function ClientsTableSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading clients">
      {/* Toolbar Skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <Skeleton className="h-10 w-full max-w-md rounded-md" />
          <Skeleton className="h-10 w-40 rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-24 rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      </div>

      {/* Table Skeleton */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th className="w-12">
                  <Skeleton className="w-4 h-4 rounded" />
                </th>
                <th>
                  <Skeleton className="h-4 w-20" />
                </th>
                <th>
                  <Skeleton className="h-4 w-16" />
                </th>
                <th>
                  <Skeleton className="h-4 w-24" />
                </th>
                <th>
                  <Skeleton className="h-4 w-32" />
                </th>
                <th>
                  <Skeleton className="h-4 w-20" />
                </th>
                <th>
                  <Skeleton className="h-4 w-24" />
                </th>
                <th>
                  <Skeleton className="h-4 w-16" />
                </th>
                <th>
                  <Skeleton className="h-4 w-16" />
                </th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {SKELETON_ROW_IDS.map((id) => (
                <tr key={id}>
                  <td>
                    <Skeleton className="w-4 h-4 rounded" />
                  </td>
                  <td>
                    <Skeleton className="h-5 w-32 mb-1" />
                    <Skeleton className="h-3 w-20" />
                  </td>
                  <td>
                    <Skeleton className="h-4 w-24" />
                  </td>
                  <td>
                    <Skeleton className="h-4 w-28" />
                  </td>
                  <td>
                    <Skeleton className="h-4 w-40" />
                  </td>
                  <td>
                    <Skeleton className="h-4 w-16" />
                  </td>
                  <td>
                    <Skeleton className="h-4 w-28" />
                  </td>
                  <td>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </td>
                  <td>
                    <Skeleton className="h-4 w-8" />
                  </td>
                  <td>
                    <Skeleton className="w-8 h-8 rounded-md" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function ClientsTable({
  data,
  countries,
  canCreate,
  canEdit,
  canDelete,
  canExport,
}: ClientsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Local state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [clientToDelete, setClientToDelete] = useState<ClientListItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Current filter/sort state from URL
  const currentSearch = searchParams.get('search') ?? '';
  const currentCountry = searchParams.get('country') ?? '';
  const currentStatus = searchParams.get('isActive') ?? '';
  const currentSort = (searchParams.get('sortBy') ?? 'name') as SortField;
  const currentOrder = (searchParams.get('sortOrder') ?? 'asc') as 'asc' | 'desc';
  const currentPage = Number(searchParams.get('page') ?? '1');
  const currentLimit = Number(searchParams.get('limit') ?? '50');

  /**
   * Update URL with new params
   */
  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === undefined || value === '') {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      // Reset to page 1 on filter changes
      if (!updates['page'] && Object.keys(updates).some((k) => k !== 'page' && k !== 'limit')) {
        params.set('page', '1');
      }

      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [searchParams, pathname, router]
  );

  /**
   * Handle sort column click
   */
  const handleSort = (field: SortField) => {
    const newOrder = currentSort === field && currentOrder === 'asc' ? 'desc' : 'asc';
    updateParams({ sortBy: field, sortOrder: newOrder });
  };

  /**
   * Handle search input
   */
  const handleSearch = (value: string) => {
    updateParams({ search: value || undefined });
  };

  /**
   * Handle page change
   */
  const handlePageChange = (page: number) => {
    updateParams({ page: String(page) });
  };

  /**
   * Handle page size change
   */
  const handlePageSizeChange = (size: number) => {
    updateParams({ limit: String(size), page: '1' });
  };

  /**
   * Handle row selection
   */
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  /**
   * Select/deselect all visible rows
   */
  const toggleSelectAll = () => {
    if (selectedIds.size === data.data.length && data.data.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data.data.map((c) => c.id)));
    }
  };

  /**
   * Handle single client delete
   */
  const handleDeleteClient = () => {
    void (async () => {
      if (!clientToDelete) return;

      const result = await deleteClient(clientToDelete.id);
      if (result.success) {
        setDeleteModalOpen(false);
        setClientToDelete(null);
        router.refresh();
      }
    })();
  };

  /**
   * Handle bulk delete
   */
  const handleBulkDelete = () => {
    void (async () => {
      const ids = Array.from(selectedIds);
      const result = await bulkDeleteClients(ids);
      if (result.success) {
        setSelectedIds(new Set());
        setBulkDeleteOpen(false);
        router.refresh();
      }
    })();
  };

  /**
   * Handle export
   */
  const handleExport = () => {
    void (async () => {
      setIsExporting(true);
      try {
        const result = await exportClients(Object.fromEntries(searchParams.entries()));
        if (result.success && result.data) {
          // Create download
          const blob = new Blob([result.data.csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = result.data.filename;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        }
      } finally {
        setIsExporting(false);
      }
    })();
  };

  /**
   * Build action menu items for a client
   */
  const getActionMenuItems = (client: ClientListItem): DropdownMenuItem[] => {
    const items: DropdownMenuItem[] = [
      {
        id: 'view',
        label: 'View Details',
        icon: <Eye className="w-4 h-4" />,
        onClick: () => router.push(`/clients/${client.id}`),
      },
    ];

    if (canEdit) {
      items.push({
        id: 'edit',
        label: 'Edit Client',
        icon: <Edit className="w-4 h-4" />,
        onClick: () => router.push(`/clients/${client.id}/edit`),
      });
    }

    if (canDelete) {
      items.push(
        { id: 'divider', divider: true },
        {
          id: 'delete',
          label: 'Delete Client',
          icon: <Trash2 className="w-4 h-4" />,
          danger: true,
          onClick: () => {
            setClientToDelete(client);
            setDeleteModalOpen(true);
          },
        }
      );
    }

    return items;
  };

  const countryOptions = [
    { value: '', label: 'All Countries' },
    ...countries.map((c) => ({ value: c, label: c })),
  ];

  const statusOptions = [
    { value: '', label: 'All Status' },
    { value: 'true', label: 'Active' },
    { value: 'false', label: 'Inactive' },
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search & Filters */}
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          {/* Search */}
          <Input
            type="search"
            placeholder="Search clients..."
            defaultValue={currentSearch}
            onChange={(e) => handleSearch(e.target.value)}
            prefix={<Search className="w-4 h-4 text-neutral-400" />}
            className="flex-1 max-w-md"
            aria-label="Search clients"
          />

          {/* Country Filter */}
          <Select
            value={currentCountry}
            onChange={(e) => updateParams({ country: e.target.value || undefined })}
            options={countryOptions}
            className="w-full sm:w-40"
            aria-label="Filter by country"
          />

          {/* Status Filter */}
          <Select
            value={currentStatus}
            onChange={(e) => updateParams({ isActive: e.target.value || undefined })}
            options={statusOptions}
            className="w-full sm:w-32"
            aria-label="Filter by status"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Bulk Actions */}
          {selectedIds.size > 0 && canDelete && (
            <Button
              variant="danger"
              onClick={() => setBulkDeleteOpen(true)}
              icon={<Trash2 className="w-4 h-4" />}
            >
              Delete ({selectedIds.size})
            </Button>
          )}

          {/* Export */}
          {canExport && (
            <Button
              variant="secondary"
              onClick={handleExport}
              loading={isExporting}
              loadingText="Exporting..."
              icon={!isExporting ? <FileSpreadsheet className="w-4 h-4" /> : undefined}
            >
              <span className="hidden sm:inline">Export</span>
            </Button>
          )}

          {/* New Client */}
          {canCreate && (
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} asChild>
              <Link href="/clients/new">New Client</Link>
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <Table>
        <Table.Header>
          <Table.Row>
            {canDelete && (
              <Table.HeaderCell className="w-12">
                <input
                  type="checkbox"
                  checked={selectedIds.size === data.data.length && data.data.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-neutral-300"
                  aria-label="Select all clients"
                />
              </Table.HeaderCell>
            )}
            <Table.HeaderCell
              sortable
              sorted={currentSort === 'name' ? currentOrder : false}
              onClick={() => handleSort('name')}
            >
              Name
            </Table.HeaderCell>
            <Table.HeaderCell
              sortable
              sorted={currentSort === 'clientCode' ? currentOrder : false}
              onClick={() => handleSort('clientCode')}
            >
              Code
            </Table.HeaderCell>
            <Table.HeaderCell>VAT Number</Table.HeaderCell>
            <Table.HeaderCell>Email</Table.HeaderCell>
            <Table.HeaderCell
              sortable
              sorted={currentSort === 'country' ? currentOrder : false}
              onClick={() => handleSort('country')}
            >
              Country
            </Table.HeaderCell>
            <Table.HeaderCell>Phone</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell
              sortable
              sorted={currentSort === 'servicesCount' ? currentOrder : false}
              onClick={() => handleSort('servicesCount')}
            >
              Services
            </Table.HeaderCell>
            <Table.HeaderCell className="w-12">
              <span className="sr-only">Actions</span>
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>

        <Table.Body>
          {isPending && (
            <Table.Row hoverable={false}>
              <Table.Cell colSpan={canDelete ? 10 : 9} className="text-center py-8">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
              </Table.Cell>
            </Table.Row>
          )}

          {!isPending && data.data.length === 0 && (
            <Table.Row hoverable={false}>
              <Table.Cell colSpan={canDelete ? 10 : 9} className="text-center py-12">
                <Building2 className="w-12 h-12 mx-auto text-neutral-300 mb-3" />
                <p className="text-neutral-500">No clients found</p>
                {canCreate && (
                  <Button
                    variant="primary"
                    icon={<Plus className="w-4 h-4" />}
                    className="mt-4"
                    asChild
                  >
                    <Link href="/clients/new">Add First Client</Link>
                  </Button>
                )}
              </Table.Cell>
            </Table.Row>
          )}

          {!isPending &&
            data.data.map((client) => (
              <Table.Row
                key={client.id}
                selected={selectedIds.has(client.id)}
                className={!client.isActive ? 'opacity-60' : ''}
              >
                {canDelete && (
                  <Table.Cell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(client.id)}
                      onChange={() => toggleSelection(client.id)}
                      className="w-4 h-4 rounded border-neutral-300"
                      aria-label={`Select ${client.name}`}
                    />
                  </Table.Cell>
                )}
                <Table.Cell>
                  <Link
                    href={`/clients/${client.id}`}
                    className="font-medium text-neutral-900 hover:text-primary"
                  >
                    {client.name}
                  </Link>
                  {client.tradeName && (
                    <p className="text-xs text-neutral-500 mt-0.5">{client.tradeName}</p>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <span className="font-mono text-sm">{client.clientCode}</span>
                </Table.Cell>
                <Table.Cell>
                  <span className="font-mono text-sm">{client.vatNumber ?? '—'}</span>
                </Table.Cell>
                <Table.Cell>
                  <a
                    href={`mailto:${client.billingEmail}`}
                    className="text-primary hover:underline"
                  >
                    {client.billingEmail}
                  </a>
                </Table.Cell>
                <Table.Cell>{client.country ?? '—'}</Table.Cell>
                <Table.Cell>{client.contactPhone ?? '—'}</Table.Cell>
                <Table.Cell>
                  <Badge variant={client.isActive ? 'active' : 'cancelled'} size="sm">
                    {client.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  <Link
                    href={`/clients/${client.id}?tab=services`}
                    className="text-primary hover:underline font-medium"
                  >
                    {client.servicesCount}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <DropdownMenu
                    trigger={
                      <span className="p-2 rounded-md hover:bg-neutral-100 inline-flex">
                        <MoreHorizontal className="w-4 h-4" />
                      </span>
                    }
                    items={getActionMenuItems(client)}
                    align="right"
                  />
                </Table.Cell>
              </Table.Row>
            ))}
        </Table.Body>
      </Table>

      {/* Pagination */}
      {data.pagination.totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={data.pagination.totalPages}
          totalItems={data.pagination.total}
          pageSize={currentLimit}
          onPageChange={handlePageChange}
          showPageSize
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={[10, 20, 50, 100]}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setClientToDelete(null);
        }}
        title="Delete Client"
        size="sm"
      >
        <Modal.Body>
          <Alert variant="warning">
            Are you sure you want to delete &quot;{clientToDelete?.name}&quot;? This action cannot
            be undone.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => {
              setDeleteModalOpen(false);
              setClientToDelete(null);
            }}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDeleteClient}>
            Delete Client
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Bulk Delete Modal */}
      <Modal
        isOpen={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        title="Delete Multiple Clients"
        size="sm"
      >
        <Modal.Body>
          <Alert variant="warning">
            Are you sure you want to delete {selectedIds.size} clients? This action cannot be
            undone.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setBulkDeleteOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleBulkDelete}>
            Delete All
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
