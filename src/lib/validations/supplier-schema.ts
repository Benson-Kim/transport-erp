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

/**
 * Cleared form inputs submit '' (RHF register keeps DOM string values).
 * Map '' to "not provided" BEFORE any coercion: Number('') === 0, so without
 * this a blank IRPF/VAT field would silently persist 0 - and "0% retention"
 * vs "no retention configured" are different facts (!20 review, must-fix 2).
 */
const emptyStringToUndefined = (value: unknown) => (value === '' ? undefined : value);

/**
 * Optional string whose cleared form value ('') parses to undefined, so the
 * action's `?? null` mapping persists NULL - never '' (!20 re-review item 6:
 * a blank vatNumber stored as '' would collide on the planned partial unique
 * index over live vatNumber; all optional text fields normalize the same way).
 */
const emptyableString = (schema: z.ZodString) =>
  z.preprocess(emptyStringToUndefined, schema.optional());

/** Supplier create/update schema */
export const supplierSchema = z.object({
  // Basic Information
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(200, 'Name must be less than 200 characters'),
  tradeName: emptyableString(z.string().max(200, 'Trade name must be less than 200 characters')),
  vatNumber: emptyableString(
    z.string().max(50, 'VAT number must be less than 50 characters')
  ).transform((val) => val?.toUpperCase()),

  // Address (flat, matching the Supplier model)
  addressLine1: z
    .string()
    .min(1, 'Address line 1 is required')
    .max(200, 'Address line 1 must be less than 200 characters'),
  addressLine2: emptyableString(
    z.string().max(200, 'Address line 2 must be less than 200 characters')
  ),
  city: z.string().min(1, 'City is required').max(100, 'City must be less than 100 characters'),
  state: emptyableString(z.string().max(100, 'State must be less than 100 characters')),
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
  phone: emptyableString(z.string().max(30, 'Phone must be less than 30 characters')),
  fax: emptyableString(z.string().max(30, 'Fax must be less than 30 characters')),
  contactPerson: emptyableString(
    z.string().max(100, 'Contact person must be less than 100 characters')
  ),
  contactMobile: emptyableString(z.string().max(30, 'Mobile must be less than 30 characters')),

  // Financial settings (percent POINTS, e.g. 21 -> 21%; see pricing.ts).
  // '' preprocesses to undefined so a cleared input is "unset", never 0.
  irpfRate: z.preprocess(
    emptyStringToUndefined,
    z.coerce
      .number()
      .min(0, 'IRPF rate cannot be negative')
      .max(100, 'IRPF rate cannot exceed 100%')
      .optional()
  ),
  vatRate: z.preprocess(
    emptyStringToUndefined,
    z.coerce
      .number()
      .min(0, 'VAT rate cannot be negative')
      .max(100, 'VAT rate cannot exceed 100%')
      .default(21)
  ),
  paymentTerms: z.coerce
    .number()
    .int('Payment terms must be a whole number')
    .min(0, 'Payment terms cannot be negative')
    .max(365, 'Payment terms cannot exceed 365 days')
    .default(30),
  // '' is the form's "Not specified" option -> unset (!20 review, must-fix 1)
  paymentMethod: z
    .enum(PAYMENT_METHODS)
    .optional()
    .or(z.literal(''))
    .transform((value) => (value === '' ? undefined : value)),

  // Banking
  bankName: emptyableString(z.string().max(100, 'Bank name must be less than 100 characters')),
  bankAccount: emptyableString(z.string().max(50, 'Bank account must be less than 50 characters')),
  swiftCode: emptyableString(z.string().max(20, 'SWIFT code must be less than 20 characters')),
  iban: emptyableString(z.string().max(40, 'IBAN must be less than 40 characters')),

  // Settings
  currency: z
    .string()
    .min(1, 'Currency is required')
    .max(3, 'Currency must be a valid code')
    .default('EUR'),
  autoApprove: z.boolean().default(false),
  requirePO: z.boolean().default(false),

  // Metadata
  notes: emptyableString(z.string().max(5000, 'Notes must be less than 5000 characters')),
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
