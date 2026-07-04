/**
 * Invoice detail view (#30, ADR 0001).
 *
 * Pure server component: receives plain DTO numbers from the page (Decimal
 * already converted by the action). Renders header, line items, payment
 * history, status controls and the record-payment form (#31). No pricing
 * fields are shown to roles that lack invoices:view - the page gate
 * handles that.
 */

import Link from 'next/link';

import { InvoiceDirection, InvoiceStatus } from '@/app/generated/prisma';
import { updateInvoiceStatus } from '@/actions/invoice-actions';
import { RecordPaymentForm } from '@/components/features/invoices/RecordPaymentForm';
import { Badge, Button, PageHeader } from '@/components/ui';
import { formatCurrency, formatDate, formatPercentPoints } from '@/lib/utils';
import type { InvoiceDetail as InvoiceDetailDto } from '@/types/invoice';

interface InvoiceDetailProps {
  invoice: InvoiceDetailDto;
  canEdit: boolean;
  canDelete: boolean;
  canSend: boolean;
  canRecordPayment: boolean;
}

const DIRECTION_LABEL: Record<InvoiceDirection, string> = {
  [InvoiceDirection.SALES]: 'Sales invoice',
  [InvoiceDirection.PURCHASE]: 'Purchase invoice',
};

/**
 * Badge ships 'active' | 'completed' | 'cancelled' | 'billed' | 'archived'
 * | 'default' - map invoice statuses onto those (there is no
 * success/warning/error variant).
 */
type InvoiceBadgeVariant = 'default' | 'billed' | 'completed' | 'cancelled' | 'archived';

const STATUS_VARIANT: Record<InvoiceStatus, InvoiceBadgeVariant> = {
  [InvoiceStatus.DRAFT]: 'default',
  [InvoiceStatus.SENT]: 'billed',
  [InvoiceStatus.VIEWED]: 'billed',
  [InvoiceStatus.PAID]: 'completed',
  [InvoiceStatus.OVERDUE]: 'cancelled',
  [InvoiceStatus.CANCELLED]: 'archived',
};

export function InvoiceDetail({ invoice, canSend, canRecordPayment }: InvoiceDetailProps) {
  const currency = invoice.currency;

  const showRecordPayment =
    canRecordPayment &&
    invoice.remainingAmount > 0 &&
    invoice.status !== InvoiceStatus.DRAFT &&
    invoice.status !== InvoiceStatus.CANCELLED;

  return (
    <div className="space-y-6">
      <PageHeader
        title={invoice.invoiceNumber}
        description={DIRECTION_LABEL[invoice.direction]}
      >
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[invoice.status]}>{invoice.status}</Badge>
          {canSend && invoice.status === InvoiceStatus.DRAFT && (
            <form
              action={async () => {
                'use server';
                await updateInvoiceStatus(invoice.id, InvoiceStatus.SENT);
              }}
            >
              <Button type="submit" size="sm">
                Mark as Sent
              </Button>
            </form>
          )}
        </div>
      </PageHeader>

      {/* Header card */}
      <div className="card grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <dt className="text-sm text-gray-500">Party</dt>
          <dd className="font-medium">
            <Link
              href={`/${invoice.party.type === 'client' ? 'clients' : 'suppliers'}/${invoice.party.id}`}
              className="text-primary hover:underline"
            >
              {invoice.party.name}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">Invoice date</dt>
          <dd>{formatDate.compact(invoice.invoiceDate)}</dd>
        </div>
        <div>
          <dt className="text-sm text-gray-500">Due date</dt>
          <dd>{formatDate.compact(invoice.dueDate)}</dd>
        </div>
        {invoice.externalReference && (
          <div>
            <dt className="text-sm text-gray-500">Supplier ref.</dt>
            <dd className="font-mono text-sm">{invoice.externalReference}</dd>
          </div>
        )}
        <div>
          <dt className="text-sm text-gray-500">Created by</dt>
          <dd>{invoice.createdByName}</dd>
        </div>
        {invoice.sentAt && (
          <div>
            <dt className="text-sm text-gray-500">Sent</dt>
            <dd>{formatDate.dateTime(invoice.sentAt)}</dd>
          </div>
        )}
      </div>

      {/* Line items */}
      <section aria-labelledby="items-heading" className="card overflow-x-auto">
        <h2 id="items-heading" className="mb-4 text-lg font-semibold">Line items</h2>
        <table className="table">
          <caption className="sr-only">Invoice line items</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left">Description</th>
              <th scope="col" className="text-right">Qty</th>
              <th scope="col" className="text-right">Unit price</th>
              <th scope="col" className="text-right">VAT %</th>
              <th scope="col" className="text-right">VAT</th>
              <th scope="col" className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.description}
                  {item.serviceNumber && (
                    <span className="ml-2 text-xs text-gray-500 font-mono">
                      {item.serviceNumber}
                    </span>
                  )}
                </td>
                <td className="text-right">{item.quantity}</td>
                <td className="text-right font-mono">{formatCurrency(item.unitPrice, currency)}</td>
                <td className="text-right">{formatPercentPoints(item.taxRate)}</td>
                <td className="text-right font-mono">{formatCurrency(item.taxAmount, currency)}</td>
                <td className="text-right font-mono">{formatCurrency(item.amount, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Totals */}
      <section aria-labelledby="totals-heading" className="card">
        <h2 id="totals-heading" className="mb-4 text-lg font-semibold">Totals</h2>
        <dl className="space-y-2 max-w-xs ml-auto">
          <div className="flex justify-between">
            <dt className="text-gray-500">Subtotal</dt>
            <dd className="font-mono">{formatCurrency(invoice.subtotal, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">VAT</dt>
            <dd className="font-mono">{formatCurrency(invoice.taxAmount, currency)}</dd>
          </div>
          {invoice.irpfRate !== null && invoice.irpfAmount !== null && (
            <div className="flex justify-between">
              <dt className="text-gray-500">IRPF ({formatPercentPoints(invoice.irpfRate)})</dt>
              <dd className="font-mono text-red-600">
                −{formatCurrency(invoice.irpfAmount, currency)}
              </dd>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t pt-2">
            <dt>Total</dt>
            <dd className="font-mono">{formatCurrency(invoice.totalAmount, currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Paid</dt>
            <dd className="font-mono">{formatCurrency(invoice.paidAmount, currency)}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Remaining</dt>
            <dd className="font-mono">{formatCurrency(invoice.remainingAmount, currency)}</dd>
          </div>
        </dl>
      </section>

      {/* Payment history */}
      {invoice.payments.length > 0 && (
        <section aria-labelledby="payments-heading" className="card overflow-x-auto">
          <h2 id="payments-heading" className="mb-4 text-lg font-semibold">Payments</h2>
          <table className="table">
            <caption className="sr-only">Payment history for this invoice</caption>
            <thead>
              <tr>
                <th scope="col">Number</th>
                <th scope="col">Date</th>
                <th scope="col">Method</th>
                <th scope="col">Reference</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.payments.map((payment) => (
                <tr key={payment.id}>
                  <td className="font-mono text-sm">{payment.paymentNumber}</td>
                  <td>{formatDate.compact(payment.paymentDate)}</td>
                  <td>{payment.paymentMethod}</td>
                  <td className="text-sm text-gray-500">{payment.reference ?? '—'}</td>
                  <td>
                    <Badge variant={payment.status === 'COMPLETED' ? 'completed' : 'default'}>
                      {payment.status}
                    </Badge>
                  </td>
                  <td className="text-right font-mono">
                    {formatCurrency(payment.amount, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Record payment (#31): capability derived server-side by the page;
          the action re-checks permission, remaining balance and status. */}
      {showRecordPayment && (
        <section aria-labelledby="record-payment-heading" className="card">
          <h2 id="record-payment-heading" className="mb-4 text-lg font-semibold">
            Record payment
          </h2>
          <RecordPaymentForm
            invoiceId={invoice.id}
            remainingAmount={invoice.remainingAmount}
            currency={currency}
          />
        </section>
      )}

      {invoice.description && (
        <section aria-labelledby="desc-heading" className="card">
          <h2 id="desc-heading" className="mb-2 text-lg font-semibold">Description</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {invoice.description}
          </p>
        </section>
      )}
    </div>
  );
}
