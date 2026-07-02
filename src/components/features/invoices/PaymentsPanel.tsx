'use client';

/**
 * Payments panel (#31): record + void payments against an invoice, plus
 * send/cancel document actions. Every button maps to a gated server action
 * and renders only when the caller holds the permission.
 */

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { cancelInvoice, markInvoiceSent } from '@/actions/invoice-actions';
import { recordPayment, voidPayment } from '@/actions/payment-actions';
import { Alert, Input, Label } from '@/components/ui';
import { INVOICE_PAYMENT_METHODS } from '@/lib/validations/invoice-schema';
import { formatCurrency } from '@/lib/utils/formatting';
import type { PaymentView } from '@/types/invoice';

interface PaymentsPanelProps {
  invoiceId: string;
  invoiceStatus: string;
  outstanding: number;
  currency: string;
  payments: PaymentView[];
  canRecordPayment: boolean;
  canVoidPayment: boolean;
  canSend: boolean;
  canCancel: boolean;
  sentAt: Date | null;
}

// eslint-disable-next-line max-lines-per-function
export function PaymentsPanel({
  invoiceId,
  invoiceStatus,
  outstanding,
  currency,
  payments,
  canRecordPayment,
  canVoidPayment,
  canSend,
  canCancel,
  sentAt,
}: PaymentsPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmVoidId, setConfirmVoidId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<string>('TRANSFER');
  const [reference, setReference] = useState('');

  const isCancelled = invoiceStatus === 'CANCELLED';
  const canRecordNow = canRecordPayment && !isCancelled && outstanding > 0;

  const handleRecord = () => {
    setError(null);
    startTransition(async () => {
      const result = await recordPayment({
        invoiceId,
        amount,
        paymentDate,
        paymentMethod,
        reference,
      });
      if (!result.success) {
        setError(result.error ?? 'Failed to record payment');
        return;
      }
      setAmount('');
      setReference('');
      router.refresh();
    });
  };

  const handleVoid = (paymentId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await voidPayment(paymentId);
      setConfirmVoidId(null);
      if (!result.success) {
        setError(result.error ?? 'Failed to void payment');
        return;
      }
      router.refresh();
    });
  };

  const handleSend = () => {
    setError(null);
    startTransition(async () => {
      const result = await markInvoiceSent(invoiceId);
      if (!result.success) {
        setError(result.error ?? 'Failed to mark as sent');
        return;
      }
      router.refresh();
    });
  };

  const handleCancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelInvoice(invoiceId);
      setConfirmCancel(false);
      if (!result.success) {
        setError(result.error ?? 'Failed to cancel invoice');
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="card p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Payments</h2>
        <div className="flex items-center gap-2">
          {canSend && !isCancelled && !sentAt && (
            <button
              type="button"
              className="button button-secondary"
              onClick={handleSend}
              disabled={isPending}
            >
              Mark as sent
            </button>
          )}
          {canCancel &&
            !isCancelled &&
            (confirmCancel ? (
              <button
                type="button"
                className="button button-secondary text-red-600"
                onClick={handleCancel}
                disabled={isPending}
              >
                Confirm cancel invoice?
              </button>
            ) : (
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setConfirmCancel(true)}
                disabled={isPending}
              >
                Cancel invoice
              </button>
            ))}
        </div>
      </div>

      {error && (
        <Alert variant="error" title="Payment action failed">
          {error}
        </Alert>
      )}

      {/* Record payment */}
      {canRecordNow && (
        <div className="grid grid-cols-1 md:grid-cols-[140px_150px_150px_1fr_auto] gap-3 items-end border-b pb-6">
          <div className="space-y-1">
            <Label htmlFor="payment-amount">Amount ({currency}) *</Label>
            <Input
              id="payment-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={outstanding}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-date">Date *</Label>
            <Input
              id="payment-date"
              type="date"
              value={paymentDate}
              onChange={(event) => setPaymentDate(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-method">Method *</Label>
            <select
              id="payment-method"
              className="input w-full"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
            >
              {INVOICE_PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment-reference">Reference</Label>
            <Input
              id="payment-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="Bank reference"
            />
          </div>
          <button
            type="button"
            className="button button-primary"
            onClick={handleRecord}
            disabled={isPending || !amount}
          >
            {isPending ? 'Recording…' : 'Record payment'}
          </button>
        </div>
      )}
      {!canRecordNow && outstanding === 0 && !isCancelled && (
        <p className="text-sm text-gray-500">Invoice is fully paid.</p>
      )}

      {/* Payments list */}
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Number</th>
              <th scope="col">Date</th>
              <th scope="col">Method</th>
              <th scope="col">Reference</th>
              <th scope="col">Amount</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-gray-500">
                  No payments recorded.
                </td>
              </tr>
            )}
            {payments.map((payment) => (
              <tr key={payment.id}>
                <td>{payment.paymentNumber}</td>
                <td>{payment.paymentDate.toLocaleDateString('es-ES')}</td>
                <td>{payment.paymentMethod}</td>
                <td>{payment.reference ?? '—'}</td>
                <td>{formatCurrency(payment.amount)}</td>
                <td>
                  <span
                    className={`badge ${payment.status === 'COMPLETED' ? 'badge-success' : 'badge-gray'}`}
                  >
                    {payment.status}
                  </span>
                </td>
                <td>
                  {canVoidPayment &&
                    payment.status === 'COMPLETED' &&
                    (confirmVoidId === payment.id ? (
                      <button
                        type="button"
                        className="text-sm font-semibold text-red-600 hover:underline"
                        onClick={() => handleVoid(payment.id)}
                        disabled={isPending}
                      >
                        Confirm void?
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-sm text-red-600 hover:underline"
                        onClick={() => setConfirmVoidId(payment.id)}
                        disabled={isPending}
                      >
                        Void
                      </button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
