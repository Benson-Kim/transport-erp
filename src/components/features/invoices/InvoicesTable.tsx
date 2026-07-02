'use client';

/**
 * Invoices Table (#30) - URL-param driven; direction filter maps to the
 * indexed enum column, never FK-null-ness (ADR 0001 convention).
 */

import { useTransition } from 'react';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Input, Skeleton } from '@/components/ui';
import { formatCurrency } from '@/lib/utils/formatting';
import type { PaginatedInvoices } from '@/types/invoice';

interface InvoicesTableProps {
  data: PaginatedInvoices;
  canCreate: boolean;
}

const SKELETON_ROW_IDS = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8'] as const;

export function InvoicesTableSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading invoices">
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

const PAYMENT_STATUS_BADGES: Record<string, string> = {
  PENDING: 'badge-gray',
  PROCESSING: 'badge-warning',
  COMPLETED: 'badge-success',
  FAILED: 'badge-error',
  REFUNDED: 'badge-gray',
};

// eslint-disable-next-line max-lines-per-function
export function InvoicesTable({ data, canCreate }: InvoicesTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const { data: invoices, pagination } = data;

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

  const direction = searchParams.get('direction') ?? '';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            type="search"
            placeholder="Search number, reference, party…"
            aria-label="Search invoices"
            defaultValue={searchParams.get('search') ?? ''}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                setParam('search', (event.target as HTMLInputElement).value);
              }
            }}
            className="max-w-md"
          />
          <select
            className="input w-44"
            aria-label="Filter by direction"
            value={direction}
            onChange={(event) => setParam('direction', event.target.value || null)}
          >
            <option value="">All directions</option>
            <option value="SALES">Sales (issued)</option>
            <option value="PURCHASE">Purchase (received)</option>
          </select>
          <select
            className="input w-40"
            aria-label="Filter by payment status"
            value={searchParams.get('paymentStatus') ?? ''}
            onChange={(event) => setParam('paymentStatus', event.target.value || null)}
          >
            <option value="">All payment states</option>
            <option value="PENDING">Unpaid</option>
            <option value="PROCESSING">Partially paid</option>
            <option value="COMPLETED">Paid</option>
          </select>
        </div>
        {canCreate && (
          <Link href="/invoices/new" className="button button-primary">
            New invoice
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Number</th>
                <th scope="col">Direction</th>
                <th scope="col">Party</th>
                <th scope="col">Date</th>
                <th scope="col">Due</th>
                <th scope="col">Total</th>
                <th scope="col">Paid</th>
                <th scope="col">Payment</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-gray-500">
                    No invoices found.
                  </td>
                </tr>
              )}
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="font-medium text-primary-600 hover:underline"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                    {invoice.externalReference && (
                      <div className="text-xs text-gray-500">
                        Ref: {invoice.externalReference}
                      </div>
                    )}
                  </td>
                  <td>
                    <span
                      className={`badge ${invoice.direction === 'SALES' ? 'badge-success' : 'badge-info'}`}
                    >
                      {invoice.direction === 'SALES' ? 'Sales' : 'Purchase'}
                    </span>
                  </td>
                  <td>{invoice.partyName}</td>
                  <td>{invoice.invoiceDate.toLocaleDateString('es-ES')}</td>
                  <td>{invoice.dueDate.toLocaleDateString('es-ES')}</td>
                  <td>{formatCurrency(invoice.totalAmount)}</td>
                  <td>{formatCurrency(invoice.paidAmount)}</td>
                  <td>
                    <span
                      className={`badge ${PAYMENT_STATUS_BADGES[invoice.paymentStatus] ?? 'badge-gray'}`}
                    >
                      {invoice.paymentStatus}
                    </span>
                  </td>
                  <td>
                    <span className="badge">{invoice.status}</span>
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
          invoices
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
