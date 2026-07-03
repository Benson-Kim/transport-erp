'use client';

/**
 * Invoices table (#30, ADR 0001).
 *
 * URL-param-driven search/direction/status filters (shareable, SSR).
 * Direction badge distinguishes SALES (revenue) from PURCHASE (cost).
 * No pricing fields in the list DTO are sensitive per the #21 registry;
 * totalAmount/paidAmount are display-only numbers at this boundary.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useTransition } from 'react';

import { InvoiceDirection, InvoiceStatus } from '@/app/generated/prisma';
import { deleteInvoice } from '@/actions/invoice-actions';
import { Alert, Badge, Button, Pagination } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { InvoiceListItem, PaginatedInvoices } from '@/types/invoice';

const DIRECTION_LABELS: Record<InvoiceDirection, string> = {
  [InvoiceDirection.SALES]: 'Sales',
  [InvoiceDirection.PURCHASE]: 'Purchase',
};

const STATUS_LABELS: Record<InvoiceStatus, string> = {
  [InvoiceStatus.DRAFT]: 'Draft',
  [InvoiceStatus.SENT]: 'Sent',
  [InvoiceStatus.VIEWED]: 'Viewed',
  [InvoiceStatus.PAID]: 'Paid',
  [InvoiceStatus.OVERDUE]: 'Overdue',
  [InvoiceStatus.CANCELLED]: 'Cancelled',
};

const STATUS_VARIANT: Record<InvoiceStatus, 'default' | 'success' | 'warning' | 'error'> = {
  [InvoiceStatus.DRAFT]: 'default',
  [InvoiceStatus.SENT]: 'default',
  [InvoiceStatus.VIEWED]: 'default',
  [InvoiceStatus.PAID]: 'success',
  [InvoiceStatus.OVERDUE]: 'error',
  [InvoiceStatus.CANCELLED]: 'warning',
};

interface InvoicesTableProps {
  data: PaginatedInvoices;
  canCreate: boolean;
  canDelete: boolean;
}

export function InvoicesTableSkeleton() {
  return (
    <div className="card animate-pulse" aria-busy="true" aria-label="Loading invoices">
      <div className="h-10 bg-gray-100 dark:bg-gray-800 rounded mb-4" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 bg-gray-50 dark:bg-gray-900 rounded mb-2" />
      ))}
    </div>
  );
}

export function InvoicesTable({ data, canCreate, canDelete }: InvoicesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateParam = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete('page');
      startTransition(() => router.push(`/invoices?${params.toString()}`));
    },
    [router, searchParams]
  );

  const handleDelete = useCallback(
    async (id: string, invoiceNumber: string) => {
      if (!confirm(`Delete invoice ${invoiceNumber}? This cannot be undone.`)) return;
      const result = await deleteInvoice(id);
      if (!result.success) {
        alert(result.error ?? 'Failed to delete invoice');
      }
    },
    []
  );

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Search invoices…"
          defaultValue={searchParams.get('search') ?? ''}
          className="input w-64"
          onChange={(e) => updateParam('search', e.target.value || undefined)}
          aria-label="Search invoices"
        />
        <select
          className="input w-40"
          defaultValue={searchParams.get('direction') ?? ''}
          onChange={(e) => updateParam('direction', e.target.value || undefined)}
          aria-label="Filter by direction"
        >
          <option value="">All directions</option>
          <option value={InvoiceDirection.SALES}>Sales</option>
          <option value={InvoiceDirection.PURCHASE}>Purchase</option>
        </select>
        <select
          className="input w-40"
          defaultValue={searchParams.get('status') ?? ''}
          onChange={(e) => updateParam('status', e.target.value || undefined)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {Object.values(InvoiceStatus).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        {canCreate && (
          <Button
            onClick={() => router.push('/invoices/new')}
            className="ml-auto"
          >
            New Invoice
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        <table className="table" aria-label="Invoices">
          <caption className="sr-only">Invoice list</caption>
          <thead>
            <tr>
              <th scope="col">Number</th>
              <th scope="col">Direction</th>
              <th scope="col">Party</th>
              <th scope="col">Date</th>
              <th scope="col">Due</th>
              <th scope="col">Status</th>
              <th scope="col" className="text-right">Total</th>
              <th scope="col" className="text-right">Paid</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {data.data.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-8 text-gray-500">
                  No invoices found.
                </td>
              </tr>
            ) : (
              data.data.map((invoice) => (
                <InvoiceRow
                  key={invoice.id}
                  invoice={invoice}
                  canDelete={canDelete}
                  onDelete={handleDelete}
                  onNavigate={(id) => router.push(`/invoices/${id}`)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {data.pagination.totalPages > 1 && (
        <Pagination
          currentPage={data.pagination.page}
          totalPages={data.pagination.totalPages}
          onPageChange={(page) => updateParam('page', String(page))}
        />
      )}

      {isPending && (
        <p className="sr-only" aria-live="polite">Loading…</p>
      )}
    </div>
  );
}

interface InvoiceRowProps {
  invoice: InvoiceListItem;
  canDelete: boolean;
  onDelete: (id: string, invoiceNumber: string) => Promise<void>;
  onNavigate: (id: string) => void;
}

function InvoiceRow({ invoice, canDelete, onDelete, onNavigate }: InvoiceRowProps) {
  const [isPending, startTransition] = useTransition();

  return (
    <tr
      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
      onClick={() => onNavigate(invoice.id)}
    >
      <td className="font-mono text-sm">{invoice.invoiceNumber}</td>
      <td>
        <Badge variant={invoice.direction === InvoiceDirection.SALES ? 'default' : 'warning'}>
          {DIRECTION_LABELS[invoice.direction]}
        </Badge>
      </td>
      <td>{invoice.partyName}</td>
      <td>{formatDate.compact(invoice.invoiceDate)}</td>
      <td>{formatDate.compact(invoice.dueDate)}</td>
      <td>
        <Badge variant={STATUS_VARIANT[invoice.status]}>
          {STATUS_LABELS[invoice.status]}
        </Badge>
      </td>
      <td className="text-right font-mono">
        {formatCurrency(invoice.totalAmount, invoice.currency)}
      </td>
      <td className="text-right font-mono">
        {formatCurrency(invoice.paidAmount, invoice.currency)}
      </td>
      <td
        className="text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {canDelete &&
          invoice.status === InvoiceStatus.DRAFT && (
            <Button
              variant="ghost"
              size="sm"
              disabled={isPending}
              onClick={() =>
                startTransition(() => onDelete(invoice.id, invoice.invoiceNumber))
              }
            >
              Delete
            </Button>
          )}
      </td>
    </tr>
  );
}
