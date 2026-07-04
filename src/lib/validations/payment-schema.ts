/**
 * Payment Validation Schema (#31)
 *
 * Validates the data for recording a payment against an invoice.
 * Amount must be positive; the app-level remaining-balance guard and the
 * #11 DB CHECK (paidAmount <= totalAmount) are the backstops for
 * over-payment.
 */

import { z } from 'zod';

export const PAYMENT_METHODS = ['TRANSFER', 'CASH', 'CARD', 'CHEQUE'] as const;

const emptyStringToUndefined = (value: unknown) => (value === '' ? undefined : value);
const emptyableString = (schema: z.ZodString) =>
  z.preprocess(emptyStringToUndefined, schema.optional());

export const createPaymentSchema = z.object({
  amount: z.preprocess(
    emptyStringToUndefined,
    z.coerce
      .number()
      .positive('Payment amount must be greater than zero')
      .max(10_000_000, 'Payment amount is unreasonably large')
  ),
  currency: z.string().min(1).max(3).default('EUR'),
  paymentDate: z.preprocess(
    emptyStringToUndefined,
    // zod v4: the unified `error` param replaced required_error.
    z.coerce.date({ error: 'Payment date is required' })
  ),
  paymentMethod: z.enum(PAYMENT_METHODS, {
    error: 'Payment method is required',
  }),
  reference: emptyableString(
    z.string().max(100, 'Reference must be less than 100 characters')
  ),
  notes: emptyableString(
    z.string().max(2000, 'Notes must be less than 2000 characters')
  ),
});

export type CreatePaymentInput = z.input<typeof createPaymentSchema>;
export type CreatePaymentOutput = z.output<typeof createPaymentSchema>;
