'use client';

/**
 * Suppliers Table Component (#29)
 * URL-param driven (shareable filters, SSR data); every control is wired to
 * a real action and renders only when permitted - no dead affordances.
 */

import { useState, useTransition } from 'react';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { deleteSupplier, exportSuppliers } from '@/actions/supplier-actions';
import { Alert, Input, Skeleton } from '@/components/ui';
import type { PaginatedSuppliers } from '@/types/supplier';

interface SuppliersTableProps {
  data: PaginatedSuppliers;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
}

const SKELETON_ROW_IDS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const;

export function SuppliersTableSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading suppliers">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-full max-w-md rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
      <div className="card overflow-hidden p-4 space-y-3">
        {SKELETON_ROW_IDS.map((id) => (
          <Skeleton key={id} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// eslint-disable-next-line max-lines-per-function
export function SuppliersTable({
  data,
  canCreate,
  canEdit,
  canDelete,
  canExport,
}: SuppliersTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: suppliers, pagination } = data;

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === '') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    if (key !== 'page') {
      params.delete('page');
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleExport = () => {
    setError(null);
    startTransition(async () => {
      const result = await exportSuppliers({
        search: searchParams.get('search') ?? undefined,
        isActive:
          searchParams.get('isActive') === null
            ? undefined
            : searchParams.get('isActive') === 'true',
      });
      if (result.success && result.data) {
        downloadCsv(result.data.csv, result.data.filename);
      } else {
        setError(result.error ?? 'Export failed');
      }
    });
  };

  const handleDelete = (id: string) => {
    setError(null);
    startTransition(async () => {
      const result = await deleteSupplier(id);
      setConfirmDeleteId(null);
      if (!result.success) {
        setError(result.error ?? 'Delete failed');
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="error" title="Action failed">
          {error}
        </Alert>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            type="search"
            placeholder="Search by name, VAT, email, code…"
            aria-label="Search suppliers"
            defaultValue={searchParams.get('search') ?? ''}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setParam('search', (event.target as HTMLInputElement).value);
              }
            }}
            className="max-w-md"
          />
          <select
            className="input w-40"
            aria-label="Filter by status"
            value={searchParams.get('isActive') ?? ''}
            onChange={(event) => setParam('isActive', event.target.value || null)}
          >
            <option value="">All statuses</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <button
              type="button"
              className="button button-secondary"
              onClick={handleExport}
              disabled={isPending}
            >
              Export CSV
            </button>
          )}
          {canCreate && (
            <Link href="/suppliers/new" className="button button-primary">
              New supplier
            </Link>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Name</th>
                <th scope="col">VAT</th>
                <th scope="col">Email</th>
                <th scope="col">City</th>
                <th scope="col">Country</th>
                <th scope="col">Services</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-500">
                    No suppliers found.
                  </td>
                </tr>
              )}
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td>
                    <Link
                      href={`/suppliers/${supplier.id}`}
                      className="font-medium text-primary-600 hover:underline"
                    >
                      {supplier.supplierCode}
                    </Link>
                  </td>
                  <td>
                    <div className="font-medium">{supplier.name}</div>
                    {supplier.tradeName && (
                      <div className="text-sm text-gray-500">{supplier.tradeName}</div>
                    )}
                  </td>
                  <td>{supplier.vatNumber ?? '—'}</td>
                  <td>{supplier.email}</td>
                  <td>{supplier.city}</td>
                  <td>{supplier.country}</td>
                  <td>{supplier.servicesCount}</td>
                  <td>
                    <span className={`badge ${supplier.isActive ? 'badge-success' : 'badge-gray'}`}>
                      {supplier.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/suppliers/${supplier.id}`}
                        className="text-sm text-primary-600 hover:underline"
                      >
                        View
                      </Link>
                      {canEdit && (
                        <Link
                          href={`/suppliers/${supplier.id}/edit`}
                          className="text-sm text-primary-600 hover:underline"
                        >
                          Edit
                        </Link>
                      )}
                      {canDelete &&
                        (confirmDeleteId === supplier.id ? (
                          <button
                            type="button"
                            className="text-sm font-semibold text-red-600 hover:underline"
                            onClick={() => handleDelete(supplier.id)}
                            disabled={isPending}
                          >
                            Confirm delete?
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-sm text-red-600 hover:underline"
                            onClick={() => setConfirmDeleteId(supplier.id)}
                            disabled={isPending}
                          >
                            Delete
                          </button>
                        ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Page {pagination.page} of {Math.max(1, pagination.totalPages)} · {pagination.total}{' '}
          suppliers
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setParam('page', String(pagination.page - 1))}
            disabled={pagination.page <= 1 || isPending}
          >
            Previous
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setParam('page', String(pagination.page + 1))}
            disabled={!pagination.hasMore || isPending}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
