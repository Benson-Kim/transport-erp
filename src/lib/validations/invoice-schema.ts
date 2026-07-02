/**
 * Invoice + Payment validation schemas (#30/#31).
 *
 * Totals are NOT accepted from the client: items carry quantity/unitPrice/
 * taxRate and the server computes amounts in Decimal via pricing.ts. What
 * the client sends is intent; what gets stored is derived.
 */

import { z } from 'zod';

// NOTE: duplicated with supplier-schema's PAYMENT_METHODS while #29 and
// #30/#31 ride parallel branches; consolidate into one module when both
// have merged (tracked in the MR description).
export const INVOICE_PAYMENT_METHODS = ['TRANSFER', 'CASH', 'CARD', 'CHEQUE'] as const;

export const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Description is required').max(500),
  quantity: z.coerce.number().positive('Quantity must be positive').max(1_000_000),
  unitPrice: z.coerce.number().min(0, 'Unit price cannot be negative').max(10_000_000),
  taxRate: z.coerce
    .number()
    .min(0, 'Tax rate cannot be negative')
    .max(100, 'Tax rate cannot exceed 100%')
    .default(21),
  serviceId: z.string().optional().or(z.literal('')),
});

const invoiceBase = z.object({
  invoiceDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  items: z.array(invoiceItemSchema).min(1, 'At least one line item is required').max(200),
  description: z.string().max(5000).optional().or(z.literal('')),
  notes: z.string().max(5000).optional().or(z.literal('')),
  currency: z.string().min(1).max(3).default('EUR'),
});

/** SALES: issued to a client; we allocate the INV number; no external ref. */
export const salesInvoiceSchema = invoiceBase
  .extend({
    direction: z.literal('SALES'),
    clientId: z.string().min(1, 'Client is required'),
  })
  .refine((data) => data.dueDate >= data.invoiceDate, {
    message: 'Due date cannot be before the invoice date',
    path: ['dueDate'],
  });

/** PURCHASE: received from a supplier; registered under our RINV series. */
export const purchaseInvoiceSchema = invoiceBase
  .extend({
    direction: z.literal('PURCHASE'),
    supplierId: z.string().min(1, 'Supplier is required'),
    externalReference: z
      .string()
      .min(1, "Supplier's invoice number is required")
      .max(100, 'Reference must be less than 100 characters'),
    irpfRate: z.coerce
      .number()
      .min(0, 'IRPF rate cannot be negative')
      .max(100, 'IRPF rate cannot exceed 100%')
      .optional(),
  })
  .refine((data) => data.dueDate >= data.invoiceDate, {
    message: 'Due date cannot be before the invoice date',
    path: ['dueDate'],
  });

export const invoiceSchema = z.discriminatedUnion('direction', [
  salesInvoiceSchema,
  purchaseInvoiceSchema,
]);

export const invoiceFilterSchema = z.object({
  search: z.string().optional(),
  direction: z.enum(['SALES', 'PURCHASE']).optional(),
  status: z.enum(['DRAFT', 'SENT', 'VIEWED', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  paymentStatus: z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['invoiceDate', 'dueDate', 'invoiceNumber', 'totalAmount']).default('invoiceDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/** Record a payment against an invoice (#31). */
export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice is required'),
  amount: z.coerce.number().positive('Amount must be positive').max(10_000_000),
  paymentDate: z.coerce.date(),
  paymentMethod: z.enum(INVOICE_PAYMENT_METHODS),
  reference: z.string().max(100).optional().or(z.literal('')),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export type InvoiceInput = z.input<typeof invoiceSchema>;
export type InvoiceOutput = z.output<typeof invoiceSchema>;
export type InvoiceFilterInput = z.input<typeof invoiceFilterSchema>;
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;
