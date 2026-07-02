/**
 * Invoice Detail (#30/#31) - server component; interactivity lives in the
 * client PaymentsPanel.
 */

import Link from 'next/link';

import { PaymentsPanel } from '@/components/features/invoices/PaymentsPanel';
import { formatCurrency, formatPercentPoints } from '@/lib/utils/formatting';
import type { InvoiceDetailView } from '@/types/invoice';

interface InvoiceDetailProps {
  invoice: InvoiceDetailView;
  canRecordPayment: boolean;
  canVoidPayment: boolean;
  canSend: boolean;
  canCancel: boolean;
}

// eslint-disable-next-line max-lines-per-function
export function InvoiceDetail({
  invoice,
  canRecordPayment,
  canVoidPayment,
  canSend,
  canCancel,
}: InvoiceDetailProps) {
  const partyHref =
    invoice.party.kind === 'client'
      ? `/clients/${invoice.party.id}`
      : `/suppliers/${invoice.party.id}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-gray-500">
            {invoice.direction === 'SALES' ? 'Sales invoice issued to' : 'Purchase invoice from'}{' '}
            <Link href={partyHref} className="text-primary-600 hover:underline">
              {invoice.party.name}
            </Link>
            {invoice.externalReference && ` · Supplier ref: ${invoice.externalReference}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge">{invoice.status}</span>
          <span
            className={`badge ${
              invoice.paymentStatus === 'COMPLETED'
                ? 'badge-success'
                : invoice.paymentStatus === 'PROCESSING'
                  ? 'badge-warning'
                  : 'badge-gray'
            }`}
          >
            {invoice.paymentStatus}
          </span>
        </div>
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="card p-4">
          <p className="text-sm text-gray-500">Subtotal</p>
          <p className="text-xl font-semibold">{formatCurrency(invoice.subtotal)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">VAT</p>
          <p className="text-xl font-semibold">{formatCurrency(invoice.taxAmount)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-xl font-semibold">{formatCurrency(invoice.totalAmount)}</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-gray-500">Outstanding</p>
          <p className="text-xl font-semibold">{formatCurrency(invoice.outstanding)}</p>
        </div>
      </div>

      {invoice.irpfRate != null && invoice.irpfAmount != null && (
        <div className="card p-4">
          <p className="text-sm text-gray-500">
            IRPF retention ({formatPercentPoints(invoice.irpfRate)})
          </p>
          <p className="text-lg font-semibold">{formatCurrency(invoice.irpfAmount)}</p>
        </div>
      )}

      {/* Line items */}
      <div className="card overflow-hidden">
        <h2 className="text-lg font-semibold p-6 pb-2">Line items</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col">Service</th>
                <th scope="col">Qty</th>
                <th scope="col">Unit price</th>
                <th scope="col">VAT %</th>
                <th scope="col">VAT</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.description}</td>
                  <td>
                    {item.serviceId && item.serviceNumber ? (
                      <Link
                        href={`/services/${item.serviceId}`}
                        className="text-primary-600 hover:underline"
                      >
                        {item.serviceNumber}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{item.quantity}</td>
                  <td>{formatCurrency(item.unitPrice)}</td>
                  <td>{formatPercentPoints(item.taxRate)}</td>
                  <td>{formatCurrency(item.taxAmount)}</td>
                  <td>{formatCurrency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payments (#31) */}
      <PaymentsPanel
        invoiceId={invoice.id}
        invoiceStatus={invoice.status}
        outstanding={invoice.outstanding}
        currency={invoice.currency}
        payments={invoice.payments}
        canRecordPayment={canRecordPayment}
        canVoidPayment={canVoidPayment}
        canSend={canSend}
        canCancel={canCancel}
        sentAt={invoice.sentAt}
      />

      {(invoice.description || invoice.notes) && (
        <div className="card p-6 space-y-4">
          {invoice.description && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Description</h2>
              <p className="text-sm whitespace-pre-wrap">{invoice.description}</p>
            </div>
          )}
          {invoice.notes && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Internal notes</h2>
              <p className="text-sm whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Created by {invoice.createdBy.name} on {invoice.createdAt.toLocaleDateString('es-ES')}
      </p>
    </div>
  );
}
