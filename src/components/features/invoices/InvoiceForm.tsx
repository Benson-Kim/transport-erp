'use client';

/**
 * Invoice Form (#30) - direction-discriminated (SALES to a client /
 * PURCHASE from a supplier), dynamic line items.
 *
 * The totals shown here are a PREVIEW computed with the same pricing.ts
 * Decimal math the server uses; the server re-derives and stores its own
 * numbers - client totals are never trusted.
 */

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';

import { createInvoice } from '@/actions/invoice-actions';
import { Alert, Input, Label, Textarea } from '@/components/ui';
import { round2, toDecimal, vatAmount, ZERO, decimalToNumber } from '@/lib/pricing';
import { formatCurrency } from '@/lib/utils/formatting';
import { invoiceSchema, type InvoiceInput } from '@/lib/validations/invoice-schema';
import type { InvoiceParties } from '@/types/invoice';

interface InvoiceFormProps {
  parties: InvoiceParties;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function FieldError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return (
    <p className="text-sm text-red-600" role="alert">
      {message}
    </p>
  );
}

// eslint-disable-next-line max-lines-per-function
export function InvoiceForm({ parties }: InvoiceFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<InvoiceInput>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      direction: 'SALES',
      clientId: '',
      invoiceDate: todayIso(),
      dueDate: todayIso(),
      currency: 'EUR',
      items: [{ description: '', quantity: 1, unitPrice: 0, taxRate: 21 }],
      description: '',
      notes: '',
    } as InvoiceInput,
  });

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = form;

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const direction = useWatch({ control, name: 'direction' });
  const watchedItems = useWatch({ control, name: 'items' });

  // Preview totals - same Decimal math as the server (pricing.ts).
  const previewSubtotal = round2(
    (watchedItems ?? []).reduce((sum, item) => {
      const quantity = Number(item?.quantity) || 0;
      const unitPrice = Number(item?.unitPrice) || 0;
      return sum.plus(round2(toDecimal(quantity).times(unitPrice)));
    }, ZERO)
  );
  const previewTax = round2(
    (watchedItems ?? []).reduce((sum, item) => {
      const quantity = Number(item?.quantity) || 0;
      const unitPrice = Number(item?.unitPrice) || 0;
      const taxRate = Number(item?.taxRate) || 0;
      return sum.plus(vatAmount(round2(toDecimal(quantity).times(unitPrice)), taxRate));
    }, ZERO)
  );
  const previewTotal = round2(previewSubtotal.plus(previewTax));

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createInvoice(values);
      if (result.success && result.data) {
        router.push(`/invoices/${result.data.id}`);
        router.refresh();
        return;
      }
      setServerError(result.error ?? 'Failed to create invoice');
    });
  });

  const itemErrors = errors.items;

  return (
    <form onSubmit={onSubmit} className="space-y-8 max-w-4xl" noValidate>
      {serverError && (
        <Alert variant="error" title="Could not create invoice">
          {serverError}
        </Alert>
      )}

      {/* Direction + party */}
      <section className="card p-6" aria-labelledby="invoice-direction">
        <h2 id="invoice-direction" className="text-lg font-semibold mb-6">
          Billing direction
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="direction">Direction *</Label>
            <select id="direction" className="input w-full" {...register('direction')}>
              <option value="SALES">Sales — issue to a client (revenue)</option>
              <option value="PURCHASE">Purchase — register from a supplier (cost)</option>
            </select>
          </div>

          {direction === 'SALES' ? (
            <div className="space-y-2">
              <Label htmlFor="clientId">Client *</Label>
              <select id="clientId" className="input w-full" {...register('clientId')}>
                <option value="">Select a client…</option>
                {parties.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              <FieldError
                message={'clientId' in errors ? (errors.clientId?.message as string) : undefined}
              />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="supplierId">Supplier *</Label>
                <select id="supplierId" className="input w-full" {...register('supplierId')}>
                  <option value="">Select a supplier…</option>
                  {parties.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                <FieldError
                  message={
                    'supplierId' in errors ? (errors.supplierId?.message as string) : undefined
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="externalReference">Supplier's invoice number *</Label>
                <Input id="externalReference" {...register('externalReference')} />
                <FieldError
                  message={
                    'externalReference' in errors
                      ? (errors.externalReference?.message as string)
                      : undefined
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="irpfRate">IRPF retention (%)</Label>
                <Input
                  id="irpfRate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  {...register('irpfRate')}
                />
                <FieldError
                  message={'irpfRate' in errors ? (errors.irpfRate?.message as string) : undefined}
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="invoiceDate">Invoice date *</Label>
            <Input id="invoiceDate" type="date" {...register('invoiceDate')} />
            <FieldError message={errors.invoiceDate?.message as string | undefined} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dueDate">Due date *</Label>
            <Input id="dueDate" type="date" {...register('dueDate')} />
            <FieldError message={errors.dueDate?.message as string | undefined} />
          </div>
        </div>
      </section>

      {/* Line items */}
      <section className="card p-6" aria-labelledby="invoice-items">
        <div className="flex items-center justify-between mb-6">
          <h2 id="invoice-items" className="text-lg font-semibold">
            Line items
          </h2>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => append({ description: '', quantity: 1, unitPrice: 0, taxRate: 21 })}
          >
            Add item
          </button>
        </div>

        <div className="space-y-4">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid grid-cols-1 md:grid-cols-[1fr_100px_130px_100px_auto] gap-3 items-start"
            >
              <div className="space-y-1">
                <Label htmlFor={`items.${index}.description`}>Description *</Label>
                <Input
                  id={`items.${index}.description`}
                  {...register(`items.${index}.description` as const)}
                />
                <FieldError message={itemErrors?.[index]?.description?.message} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`items.${index}.quantity`}>Qty *</Label>
                <Input
                  id={`items.${index}.quantity`}
                  type="number"
                  step="0.01"
                  min="0"
                  {...register(`items.${index}.quantity` as const)}
                />
                <FieldError message={itemErrors?.[index]?.quantity?.message} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`items.${index}.unitPrice`}>Unit price *</Label>
                <Input
                  id={`items.${index}.unitPrice`}
                  type="number"
                  step="0.01"
                  min="0"
                  {...register(`items.${index}.unitPrice` as const)}
                />
                <FieldError message={itemErrors?.[index]?.unitPrice?.message} />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`items.${index}.taxRate`}>VAT % *</Label>
                <Input
                  id={`items.${index}.taxRate`}
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  {...register(`items.${index}.taxRate` as const)}
                />
                <FieldError message={itemErrors?.[index]?.taxRate?.message} />
              </div>
              <div className="pt-6">
                <button
                  type="button"
                  className="text-sm text-red-600 hover:underline disabled:opacity-50"
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1}
                  aria-label={`Remove item ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <FieldError
          message={typeof itemErrors?.message === 'string' ? itemErrors.message : undefined}
        />

        {/* Totals preview */}
        <div className="mt-6 border-t pt-4 flex flex-col items-end gap-1 text-sm">
          <p>
            Subtotal:{' '}
            <span className="font-medium">{formatCurrency(decimalToNumber(previewSubtotal))}</span>
          </p>
          <p>
            VAT: <span className="font-medium">{formatCurrency(decimalToNumber(previewTax))}</span>
          </p>
          <p className="text-base">
            Total:{' '}
            <span className="font-semibold">{formatCurrency(decimalToNumber(previewTotal))}</span>
          </p>
          <p className="text-xs text-gray-500">
            Preview only — the server recomputes and stores authoritative totals.
          </p>
        </div>
      </section>

      {/* Notes */}
      <section className="card p-6" aria-labelledby="invoice-notes">
        <h2 id="invoice-notes" className="text-lg font-semibold mb-6">
          Details
        </h2>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={2} {...register('description')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Internal notes</Label>
            <Textarea id="notes" rows={3} {...register('notes')} />
          </div>
        </div>
      </section>

      <div className="flex items-center justify-end gap-4 pt-4">
        <button
          type="button"
          className="button button-secondary"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Cancel
        </button>
        <button type="submit" className="button button-primary" disabled={isPending}>
          {isPending ? 'Creating…' : 'Create invoice'}
        </button>
      </div>
    </form>
  );
}
