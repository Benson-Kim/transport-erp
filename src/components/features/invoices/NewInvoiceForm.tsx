'use client';

/**
 * New Invoice Form (#30, ADR 0001).
 *
 * Two-step flow:
 * 1. Choose direction (SALES / PURCHASE) and party.
 * 2. Select services and confirm totals (live preview via computeInvoiceTotals).
 *
 * RHF + zodResolver; direction-aware validation (PURCHASE requires
 * externalReference; SALES forbids it and IRPF). Totals are previewed
 * client-side via computeInvoiceTotals (the same pure function the action
 * uses) so the form is honest before submit.
 */

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { InvoiceDirection } from '@/app/generated/prisma';
import { createInvoice, getInvoiceableServices } from '@/actions/invoice-actions';
import { Alert, Button, FormField, Input, Select } from '@/components/ui';
import { computeInvoiceTotals } from '@/lib/invoices';
import { formatCurrency, formatDate } from '@/lib/utils';
import { createInvoiceSchema, type CreateInvoiceInput } from '@/lib/validations/invoice-schema';
import type { InvoicePartyOption, InvoiceableService } from '@/types/invoice';

interface NewInvoiceFormProps {
  clients: InvoicePartyOption[];
  suppliers: InvoicePartyOption[];
}

export function NewInvoiceForm({ clients, suppliers }: NewInvoiceFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [services, setServices] = useState<InvoiceableService[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateInvoiceInput>({
    resolver: zodResolver(createInvoiceSchema),
    defaultValues: {
      direction: InvoiceDirection.SALES,
      vatRatePoints: 21,
      serviceIds: [],
    },
  });

  const direction = watch('direction');
  const partyId = watch('partyId');
  const selectedServiceIds = watch('serviceIds') ?? [];
  // z.input of the preprocessed rate fields is `unknown`; coerce for the
  // live preview exactly like the schema does ('' -> default / not provided).
  const vatRateRaw = watch('vatRatePoints');
  const irpfRateRaw = watch('irpfRatePoints');
  const vatRatePoints = vatRateRaw === undefined || vatRateRaw === '' ? 21 : Number(vatRateRaw);
  const irpfRatePoints =
    irpfRateRaw === undefined || irpfRateRaw === '' ? null : Number(irpfRateRaw);

  const parties = direction === InvoiceDirection.SALES ? clients : suppliers;

  // Load invoiceable services when party changes.
  const loadServices = async (dir: InvoiceDirection, pid: string) => {
    if (!pid) return;
    setServicesLoading(true);
    const result = await getInvoiceableServices({ direction: dir, partyId: pid });
    setServicesLoading(false);
    if (result.success && result.data) {
      setServices(result.data);
      setValue('serviceIds', []);
    }
  };

  const selectedServices = services.filter((s) => selectedServiceIds.includes(s.id));
  const lineAmounts = selectedServices.map((s) => s.amount);
  const totals =
    lineAmounts.length > 0 && Number.isFinite(vatRatePoints)
      ? computeInvoiceTotals(
          lineAmounts,
          vatRatePoints,
          irpfRatePoints !== null && Number.isFinite(irpfRatePoints) ? irpfRatePoints : null
        )
      : null;

  const onSubmit = (data: CreateInvoiceInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await createInvoice(data);
      if (result.success && result.data) {
        router.push(`/invoices/${result.data.id}`);
      } else {
        setServerError(result.error ?? 'Failed to create invoice');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {serverError && (
        <Alert variant="error" title="Error">{serverError}</Alert>
      )}

      {/* Step 1: Direction + Party */}
      <div className="card space-y-4">
        <h2 className="text-lg font-semibold">1. Direction and party</h2>

        <FormField label="Direction" required error={errors.direction?.message ?? ''}>
          <Select
            {...register('direction')}
            options={[
              { value: InvoiceDirection.SALES, label: 'Sales — issue to a client (INV)' },
              { value: InvoiceDirection.PURCHASE, label: 'Purchase — register from a supplier (RINV)' },
            ]}
            onChange={(e) => {
              setValue('direction', e.target.value as InvoiceDirection);
              setValue('partyId', '');
              setServices([]);
            }}
          />
        </FormField>

        <FormField label={direction === InvoiceDirection.SALES ? 'Client' : 'Supplier'} required error={errors.partyId?.message ?? ''}>
          <Select
            {...register('partyId')}
            options={[
              { value: '', label: `Select a ${direction === InvoiceDirection.SALES ? 'client' : 'supplier'}…` },
              ...parties.map((p) => ({ value: p.id, label: p.name })),
            ]}
            onChange={(e) => {
              setValue('partyId', e.target.value);
              if (e.target.value) loadServices(direction, e.target.value);
            }}
          />
        </FormField>

        {direction === InvoiceDirection.PURCHASE && (
          <FormField
            label="Supplier's invoice number"
            required
            helperText="The supplier's own reference (stored as externalReference; our RINV number is allocated automatically)"
            error={errors.externalReference?.message ?? ''}
          >
            <Input {...register('externalReference')} placeholder="e.g. SUP-2026-0042" />
          </FormField>
        )}
      </div>

      {/* Step 2: Services */}
      {partyId && (
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold">2. Select services</h2>

          {servicesLoading && <p className="text-sm text-gray-500">Loading services…</p>}

          {!servicesLoading && services.length === 0 && (
            <p className="text-sm text-gray-500">
              No invoiceable services found for this{' '}
              {direction === InvoiceDirection.SALES ? 'client' : 'supplier'}.
            </p>
          )}

          {services.length > 0 && (
            <div className="overflow-x-auto">
              <table className="table">
                <caption className="sr-only">Invoiceable services</caption>
                <thead>
                  <tr>
                    <th scope="col"><span className="sr-only">Select</span></th>
                    <th scope="col">Number</th>
                    <th scope="col">Date</th>
                    <th scope="col">Route</th>
                    <th scope="col" className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((service) => (
                    <tr key={service.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Select service ${service.serviceNumber}`}
                          checked={selectedServiceIds.includes(service.id)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...selectedServiceIds, service.id]
                              : selectedServiceIds.filter((id) => id !== service.id);
                            setValue('serviceIds', next);
                          }}
                        />
                      </td>
                      <td className="font-mono text-sm">{service.serviceNumber}</td>
                      <td>{formatDate.compact(service.date)}</td>
                      <td className="text-sm">{service.origin} → {service.destination}</td>
                      <td className="text-right font-mono">
                        {formatCurrency(service.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {errors.serviceIds && (
            <p className="text-sm text-red-600">{errors.serviceIds.message}</p>
          )}
        </div>
      )}

      {/* Step 3: Rates + Totals preview */}
      {selectedServices.length > 0 && (
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold">3. Rates and totals</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="VAT rate (%)" required error={errors.vatRatePoints?.message ?? ''}>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                {...register('vatRatePoints')}
              />
            </FormField>

            {direction === InvoiceDirection.PURCHASE && (
              <FormField
                label="IRPF retention (%)"
                helperText="Leave blank if no retention applies"
                error={errors.irpfRatePoints?.message ?? ''}
              >
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  {...register('irpfRatePoints')}
                />
              </FormField>
            )}

            <FormField label="Invoice date" error={errors.invoiceDate?.message ?? ''}>
              <Input type="date" {...register('invoiceDate')} />
            </FormField>

            <FormField label="Due date" error={errors.dueDate?.message ?? ''}>
              <Input type="date" {...register('dueDate')} />
            </FormField>
          </div>

          {totals && (
            <dl className="space-y-1 max-w-xs ml-auto text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Subtotal</dt>
                <dd className="font-mono">{formatCurrency(totals.subtotal.toNumber())}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">VAT</dt>
                <dd className="font-mono">{formatCurrency(totals.taxAmount.toNumber())}</dd>
              </div>
              {totals.irpfAmount && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">IRPF</dt>
                  <dd className="font-mono text-red-600">
                    −{formatCurrency(totals.irpfAmount.toNumber())}
                  </dd>
                </div>
              )}
              <div className="flex justify-between font-semibold border-t pt-1">
                <dt>Total</dt>
                <dd className="font-mono">{formatCurrency(totals.totalAmount.toNumber())}</dd>
              </div>
            </dl>
          )}
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push('/invoices')}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || selectedServices.length === 0}>
          {isPending ? 'Creating…' : 'Create invoice'}
        </Button>
      </div>
    </form>
  );
}
