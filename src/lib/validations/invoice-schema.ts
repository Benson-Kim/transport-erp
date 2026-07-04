/**
 * Invoice Validation Schemas (#30, ADR 0001)
 *
 * Direction-aware: PURCHASE invoices REGISTER a received supplier invoice
 * (the supplier's own number is required, as externalReference); SALES
 * invoices are numbered by our issued series (externalReference forbidden)
 * and never carry IRPF retention (that is a purchase-side concept).
 */

import { z } from 'zod';

import { InvoiceDirection, InvoiceStatus } from '@/app/generated/prisma';

/**
 * Cleared form inputs submit '' - map to "not provided" BEFORE coercion
 * (Number('') === 0; new Date('') is Invalid). Same doctrine as
 * supplier-schema.ts (!20 review, must-fix 2).
 */
const emptyStringToUndefined = (value: unknown) => (value === '' ? undefined : value);

const emptyableString = (schema: z.ZodString) =>
  z.preprocess(emptyStringToUndefined, schema.optional());

export const createInvoiceSchema = z
  .object({
    direction: z.enum(InvoiceDirection),
    partyId: z.string().min(1, 'Select a client or supplier'),
    serviceIds: z
      .array(z.string().min(1))
      .min(1, 'Select at least one service')
      .max(100, 'An invoice cannot group more than 100 services'),
    invoiceDate: z.preprocess(emptyStringToUndefined, z.coerce.date().optional()),
    dueDate: z.preprocess(emptyStringToUndefined, z.coerce.date().optional()),
    externalReference: emptyableString(
      z.string().max(100, 'External reference must be less than 100 characters')
    ),
    /** Percent points (21 -> 21%), matching pricing.ts semantics. */
    vatRatePoints: z.preprocess(
      emptyStringToUndefined,
      z.coerce
        .number()
        .min(0, 'VAT rate cannot be negative')
        .max(100, 'VAT rate cannot exceed 100%')
        .default(21)
    ),
    /** IRPF retention in percent points; PURCHASE only. */
    irpfRatePoints: z.preprocess(
      emptyStringToUndefined,
      z.coerce
        .number()
        .min(0, 'IRPF rate cannot be negative')
        .max(100, 'IRPF rate cannot exceed 100%')
        .optional()
    ),
    description: emptyableString(
      z.string().max(5000, 'Description must be less than 5000 characters')
    ),
    notes: emptyableString(z.string().max(5000, 'Notes must be less than 5000 characters')),
  })
  .superRefine((data, ctx) => {
    if (data.direction === InvoiceDirection.PURCHASE && !data.externalReference) {
      ctx.addIssue({
        code: 'custom',
        path: ['externalReference'],
        message: "The supplier's own invoice number is required on purchase invoices",
      });
    }
    if (data.direction === InvoiceDirection.SALES && data.externalReference) {
      ctx.addIssue({
        code: 'custom',
        path: ['externalReference'],
        message: 'Sales invoices are numbered by our issued series - no external reference',
      });
    }
    if (
      data.direction === InvoiceDirection.SALES &&
      data.irpfRatePoints !== undefined &&
      data.irpfRatePoints > 0
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['irpfRatePoints'],
        message: 'IRPF retention applies to purchase invoices only',
      });
    }
    if (data.invoiceDate && data.dueDate && data.dueDate < data.invoiceDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['dueDate'],
        message: 'Due date cannot be before the invoice date',
      });
    }
  });

/** Party + direction pair for loading the invoiceable-services selection. */
export const invoiceableServicesSchema = z.object({
  direction: z.enum(InvoiceDirection),
  partyId: z.string().min(1),
});

/** Invoice list filters - capped pagination per the shared contract. */
export const invoiceFilterSchema = z.object({
  search: z.string().optional(),
  direction: z.enum(InvoiceDirection).optional(),
  status: z.enum(InvoiceStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z
    .enum(['invoiceDate', 'dueDate', 'invoiceNumber', 'totalAmount', 'createdAt'])
    .default('invoiceDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;
export type CreateInvoiceOutput = z.output<typeof createInvoiceSchema>;
export type InvoiceFilterInput = z.input<typeof invoiceFilterSchema>;
