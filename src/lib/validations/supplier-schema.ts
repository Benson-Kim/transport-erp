/**
 * Supplier Validation Schemas (#29)
 * Zod schemas for supplier form validation.
 *
 * NOTE: Supplier stores a FLAT address (addressLine1/city/postalCode/...)
 * per schema.prisma - unlike Client's JSON billingAddress. The form schema
 * mirrors the model; do not reuse addressSchema here.
 */

import { z } from 'zod';

export const PAYMENT_METHODS = ['TRANSFER', 'CASH', 'CARD', 'CHEQUE'] as const;

/** Supplier create/update schema */
export const supplierSchema = z.object({
  // Basic Information
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(200, 'Name must be less than 200 characters'),
  tradeName: z
    .string()
    .max(200, 'Trade name must be less than 200 characters')
    .optional()
    .or(z.literal('')),
  vatNumber: z
    .string()
    .max(50, 'VAT number must be less than 50 characters')
    .optional()
    .or(z.literal(''))
    .transform((val) => val?.toUpperCase()),

  // Address (flat, matching the Supplier model)
  addressLine1: z
    .string()
    .min(1, 'Address line 1 is required')
    .max(200, 'Address line 1 must be less than 200 characters'),
  addressLine2: z
    .string()
    .max(200, 'Address line 2 must be less than 200 characters')
    .optional()
    .or(z.literal('')),
  city: z.string().min(1, 'City is required').max(100, 'City must be less than 100 characters'),
  state: z.string().max(100, 'State must be less than 100 characters').optional().or(z.literal('')),
  postalCode: z
    .string()
    .min(1, 'Postal code is required')
    .max(20, 'Postal code must be less than 20 characters'),
  country: z
    .string()
    .min(2, 'Country is required')
    .max(100, 'Country must be less than 100 characters')
    .default('ES'),

  // Contact
  email: z.email('Invalid email address').min(1, 'Email is required'),
  phone: z.string().max(30, 'Phone must be less than 30 characters').optional().or(z.literal('')),
  fax: z.string().max(30, 'Fax must be less than 30 characters').optional().or(z.literal('')),
  contactPerson: z
    .string()
    .max(100, 'Contact person must be less than 100 characters')
    .optional()
    .or(z.literal('')),
  contactMobile: z
    .string()
    .max(30, 'Mobile must be less than 30 characters')
    .optional()
    .or(z.literal('')),

  // Financial settings (percent POINTS, e.g. 21 -> 21%; see pricing.ts)
  irpfRate: z.coerce
    .number()
    .min(0, 'IRPF rate cannot be negative')
    .max(100, 'IRPF rate cannot exceed 100%')
    .optional(),
  vatRate: z.coerce
    .number()
    .min(0, 'VAT rate cannot be negative')
    .max(100, 'VAT rate cannot exceed 100%')
    .default(21),
  paymentTerms: z.coerce
    .number()
    .int('Payment terms must be a whole number')
    .min(0, 'Payment terms cannot be negative')
    .max(365, 'Payment terms cannot exceed 365 days')
    .default(30),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),

  // Banking
  bankName: z
    .string()
    .max(100, 'Bank name must be less than 100 characters')
    .optional()
    .or(z.literal('')),
  bankAccount: z
    .string()
    .max(50, 'Bank account must be less than 50 characters')
    .optional()
    .or(z.literal('')),
  swiftCode: z
    .string()
    .max(20, 'SWIFT code must be less than 20 characters')
    .optional()
    .or(z.literal('')),
  iban: z.string().max(40, 'IBAN must be less than 40 characters').optional().or(z.literal('')),

  // Settings
  currency: z
    .string()
    .min(1, 'Currency is required')
    .max(3, 'Currency must be a valid code')
    .default('EUR'),
  autoApprove: z.boolean().default(false),
  requirePO: z.boolean().default(false),

  // Metadata
  notes: z
    .string()
    .max(5000, 'Notes must be less than 5000 characters')
    .optional()
    .or(z.literal('')),
  tags: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

/** Supplier search/filter schema */
export const supplierFilterSchema = z.object({
  search: z.string().optional(),
  country: z.string().optional(),
  isActive: z.boolean().optional(),
  currency: z.string().optional(),
  tags: z.array(z.string()).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z
    .enum(['name', 'supplierCode', 'country', 'servicesCount', 'createdAt', 'updatedAt'])
    .default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

/** Type exports */
export type SupplierInput = z.input<typeof supplierSchema>;
export type SupplierOutput = z.output<typeof supplierSchema>;
export type SupplierFilterInput = z.input<typeof supplierFilterSchema>;
