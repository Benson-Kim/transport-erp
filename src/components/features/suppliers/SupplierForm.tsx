'use client';

/**
 * Supplier Form Component (#29)
 * Create and edit supplier information - the cost side of the brokerage.
 *
 * Receives PLAIN initial values (SupplierFormInitial): Prisma Decimal fields
 * are converted server-side before crossing the RSC -> client boundary.
 */

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { createSupplier, updateSupplier } from '@/actions/supplier-actions';
import { Alert, Input, Label, Textarea } from '@/components/ui';
import { safeInternalPath } from '@/lib/utils';
import {
  supplierSchema,
  PAYMENT_METHODS,
  type SupplierInput,
} from '@/lib/validations/supplier-schema';

/** Plain (RSC-serializable) initial values for edit mode. */
export interface SupplierFormInitial {
  id: string;
  supplierCode: string;
  name: string;
  tradeName: string | null;
  vatNumber: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string | null;
  postalCode: string;
  country: string;
  email: string;
  phone: string | null;
  fax: string | null;
  contactPerson: string | null;
  contactMobile: string | null;
  irpfRate: number | null;
  vatRate: number;
  paymentTerms: number;
  paymentMethod: string | null;
  bankName: string | null;
  bankAccount: string | null;
  swiftCode: string | null;
  iban: string | null;
  currency: string;
  autoApprove: boolean;
  requirePO: boolean;
  notes: string | null;
  tags: string[];
  isActive: boolean;
}

interface SupplierFormProps {
  supplier?: SupplierFormInitial;
  mode: 'create' | 'edit';
  /**
   * Post-create navigation target (#64). Validated with safeInternalPath at
   * the navigation call site; anything unsafe falls back to the detail page.
   */
  returnTo?: string | undefined;
}

const CURRENCIES = [
  { value: 'EUR', label: 'Euro (€)' },
  { value: 'USD', label: 'US Dollar ($)' },
  { value: 'GBP', label: 'British Pound (£)' },
];

function toDefaultValues(supplier?: SupplierFormInitial): SupplierInput {
  return {
    name: supplier?.name ?? '',
    tradeName: supplier?.tradeName ?? '',
    vatNumber: supplier?.vatNumber ?? '',
    addressLine1: supplier?.addressLine1 ?? '',
    addressLine2: supplier?.addressLine2 ?? '',
    city: supplier?.city ?? '',
    state: supplier?.state ?? '',
    postalCode: supplier?.postalCode ?? '',
    country: supplier?.country ?? 'ES',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    fax: supplier?.fax ?? '',
    contactPerson: supplier?.contactPerson ?? '',
    contactMobile: supplier?.contactMobile ?? '',
    ...(supplier?.irpfRate != null ? { irpfRate: supplier.irpfRate } : {}),
    vatRate: supplier?.vatRate ?? 21,
    paymentTerms: supplier?.paymentTerms ?? 30,
    ...(supplier?.paymentMethod
      ? { paymentMethod: supplier.paymentMethod as (typeof PAYMENT_METHODS)[number] }
      : {}),
    bankName: supplier?.bankName ?? '',
    bankAccount: supplier?.bankAccount ?? '',
    swiftCode: supplier?.swiftCode ?? '',
    iban: supplier?.iban ?? '',
    currency: supplier?.currency ?? 'EUR',
    autoApprove: supplier?.autoApprove ?? false,
    requirePO: supplier?.requirePO ?? false,
    notes: supplier?.notes ?? '',
    tags: supplier?.tags ?? [],
    isActive: supplier?.isActive ?? true,
  };
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
export function SupplierForm({ supplier, mode }: SupplierFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<SupplierInput>({
    resolver: zodResolver(supplierSchema),
    defaultValues: toDefaultValues(supplier),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = form;

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const result =
        mode === 'create'
          ? await createSupplier(values)
          : await updateSupplier(supplier!.id, values);

      if (result.success && result.data) {
        router.push(`/suppliers/${result.data.id}`);
        router.refresh();
        return;
      }

      setServerError(result.error ?? 'Failed to save supplier');
      if (result.errors) {
        Object.entries(result.errors).forEach(([field, messages]) => {
          const [message] = messages;
          if (!message) return;
          form.setError(field as keyof SupplierInput, { type: 'server', message });
        });
      }
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-8 max-w-4xl" noValidate>
      {serverError && (
        <Alert variant="error" title="Could not save supplier">
          {serverError}
        </Alert>
      )}

      {/* Basic Information */}
      <section className="card p-6" aria-labelledby="supplier-basic">
        <h2 id="supplier-basic" className="text-lg font-semibold mb-6">
          Basic Information
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="name">Legal name *</Label>
            <Input id="name" {...register('name')} aria-invalid={!!errors.name} />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tradeName">Trade name</Label>
            <Input id="tradeName" {...register('tradeName')} />
            <FieldError message={errors.tradeName?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vatNumber">VAT number</Label>
            <Input id="vatNumber" {...register('vatNumber')} aria-invalid={!!errors.vatNumber} />
            <FieldError message={errors.vatNumber?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <select id="currency" className="input w-full" {...register('currency')}>
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* Address */}
      <section className="card p-6" aria-labelledby="supplier-address">
        <h2 id="supplier-address" className="text-lg font-semibold mb-6">
          Address
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="addressLine1">Address line 1 *</Label>
            <Input
              id="addressLine1"
              {...register('addressLine1')}
              aria-invalid={!!errors.addressLine1}
            />
            <FieldError message={errors.addressLine1?.message} />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="addressLine2">Address line 2</Label>
            <Input id="addressLine2" {...register('addressLine2')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">City *</Label>
            <Input id="city" {...register('city')} aria-invalid={!!errors.city} />
            <FieldError message={errors.city?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="state">State / Province</Label>
            <Input id="state" {...register('state')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postalCode">Postal code *</Label>
            <Input id="postalCode" {...register('postalCode')} aria-invalid={!!errors.postalCode} />
            <FieldError message={errors.postalCode?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="country">Country *</Label>
            <Input id="country" {...register('country')} aria-invalid={!!errors.country} />
            <FieldError message={errors.country?.message} />
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="card p-6" aria-labelledby="supplier-contact">
        <h2 id="supplier-contact" className="text-lg font-semibold mb-6">
          Contact
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="email">Email *</Label>
            <Input id="email" type="email" {...register('email')} aria-invalid={!!errors.email} />
            <FieldError message={errors.email?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" {...register('phone')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactPerson">Contact person</Label>
            <Input id="contactPerson" {...register('contactPerson')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contactMobile">Mobile</Label>
            <Input id="contactMobile" {...register('contactMobile')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fax">Fax</Label>
            <Input id="fax" {...register('fax')} />
          </div>
        </div>
      </section>

      {/* Financial Settings */}
      <section className="card p-6" aria-labelledby="supplier-financial">
        <h2 id="supplier-financial" className="text-lg font-semibold mb-6">
          Financial Settings
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="vatRate">VAT rate (%) *</Label>
            <Input
              id="vatRate"
              type="number"
              step="0.01"
              min="0"
              max="100"
              {...register('vatRate')}
              aria-invalid={!!errors.vatRate}
              aria-describedby="vatRate-hint"
            />
            <p id="vatRate-hint" className="text-sm text-gray-500">
              Leave blank to use the default 21%.
            </p>
            <FieldError message={errors.vatRate?.message} />
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
              aria-invalid={!!errors.irpfRate}
            />
            <FieldError message={errors.irpfRate?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentTerms">Payment terms (days) *</Label>
            <Input
              id="paymentTerms"
              type="number"
              min="0"
              max="365"
              {...register('paymentTerms')}
              aria-invalid={!!errors.paymentTerms}
            />
            <FieldError message={errors.paymentTerms?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentMethod">Payment method</Label>
            <select id="paymentMethod" className="input w-full" {...register('paymentMethod')}>
              <option value="">Not specified</option>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
            <FieldError message={errors.paymentMethod?.message} />
          </div>
        </div>
      </section>

      {/* Banking */}
      <section className="card p-6" aria-labelledby="supplier-banking">
        <h2 id="supplier-banking" className="text-lg font-semibold mb-6">
          Banking
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="bankName">Bank name</Label>
            <Input id="bankName" {...register('bankName')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="iban">IBAN</Label>
            <Input id="iban" {...register('iban')} />
            <FieldError message={errors.iban?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="swiftCode">SWIFT / BIC</Label>
            <Input id="swiftCode" {...register('swiftCode')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankAccount">Bank account</Label>
            <Input id="bankAccount" {...register('bankAccount')} />
          </div>
        </div>
      </section>

      {/* Settings + Notes */}
      <section className="card p-6" aria-labelledby="supplier-settings">
        <h2 id="supplier-settings" className="text-lg font-semibold mb-6">
          Settings
        </h2>
        <div className="space-y-4">
          <label className="flex items-center gap-3">
            <input type="checkbox" className="h-4 w-4" {...register('isActive')} />
            <span>Active supplier</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" className="h-4 w-4" {...register('autoApprove')} />
            <span>Auto-approve services from this supplier</span>
          </label>
          <label className="flex items-center gap-3">
            <input type="checkbox" className="h-4 w-4" {...register('requirePO')} />
            <span>Require purchase order</span>
          </label>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" rows={4} {...register('notes')} />
            <FieldError message={errors.notes?.message} />
          </div>
        </div>
      </section>

      {/* Actions */}
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
          {isPending ? 'Saving…' : mode === 'create' ? 'Create supplier' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
