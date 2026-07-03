'use client';

/**
 * Record Payment Form (#31).
 *
 * Inline form rendered on the invoice detail page. Validates that the
 * payment amount does not exceed the remaining balance before submitting
 * (client-side guard; the action enforces it server-side too).
 */

import { useTransition } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';

import { recordPayment } from '@/actions/payment-actions';
import { Alert, Button, FormField, Input, Select } from '@/components/ui';
import { createPaymentSchema, PAYMENT_METHODS, type CreatePaymentInput } from '@/lib/validations/payment-schema';
import { formatCurrency } from '@/lib/utils';

interface RecordPaymentFormProps {
  invoiceId: string;
  remainingAmount: number;
  currency: string;
  onSuccess: () => void;
}

export function RecordPaymentForm({
  invoiceId,
  remainingAmount,
  currency,
  onSuccess,
}: RecordPaymentFormProps) {
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
    reset,
  } = useForm<CreatePaymentInput>({
    resolver: zodResolver(createPaymentSchema),
    defaultValues: {
      currency,
      paymentMethod: 'TRANSFER',
    },
  });

  const onSubmit = (data: CreatePaymentInput) => {
    startTransition(async () => {
      const result = await recordPayment(invoiceId, data);
      if (result.success) {
        reset();
        onSuccess();
      } else {
        setError('root', { message: result.error ?? 'Failed to record payment' });
      }
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {errors.root && (
        <Alert variant="error" title="Error">{errors.root.message}</Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          label="Amount"
          required
          helperText={`Remaining: ${formatCurrency(remainingAmount, currency)}`}
          error={errors.amount?.message}
        >
          <Input
            type="number"
            step="0.01"
            min="0.01"
            max={remainingAmount}
            {...register('amount')}
          />
        </FormField>

        <FormField label="Payment date" required error={errors.paymentDate?.message}>
          <Input type="date" {...register('paymentDate')} />
        </FormField>

        <FormField label="Payment method" required error={errors.paymentMethod?.message}>
          <Select
            {...register('paymentMethod')}
            options={PAYMENT_METHODS.map((m) => ({ value: m, label: m }))}
          />
        </FormField>

        <FormField label="Reference" error={errors.reference?.message}>
          <Input {...register('reference')} placeholder="Bank reference (optional)" />
        </FormField>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Recording…' : 'Record payment'}
        </Button>
      </div>
    </form>
  );
}
