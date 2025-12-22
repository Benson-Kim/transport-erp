/**
 * Client Validation Schemas
 * Zod schemas for client form validation
 */

import { z } from 'zod';

/** Address schema */
export const addressSchema = z.object({
  line1: z
    .string()
    .min(1, 'Address line 1 is required')
    .max(200, 'Address line 1 must be less than 200 characters'),
  line2: z
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
    .min(1, 'Country is required')
    .max(100, 'Country must be less than 100 characters'),
});

/** Client create/update schema */
export const clientSchema = z
  .object({
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

    // Addresses
    billingAddress: addressSchema,
    useShippingAddress: z.boolean().default(false),
    shippingAddress: addressSchema.optional(),

    // Contact Information
    billingEmail: z.email('Invalid email address').min(1, 'Billing email is required'),
    trafficEmail: z
      .email('Invalid email address')
      .toLowerCase()
      .trim()
      .optional()
      .or(z.literal('')),
    contactPerson: z
      .string()
      .max(100, 'Contact person must be less than 100 characters')
      .optional()
      .or(z.literal('')),
    contactPhone: z
      .string()
      .max(30, 'Phone must be less than 30 characters')
      .optional()
      .or(z.literal('')),
    contactMobile: z
      .string()
      .max(30, 'Mobile must be less than 30 characters')
      .optional()
      .or(z.literal('')),

    // Financial Settings
    creditLimit: z.coerce.number().min(0, 'Credit limit cannot be negative').optional(),
    paymentTerms: z.coerce
      .number()
      .int('Payment terms must be a whole number')
      .min(0, 'Payment terms cannot be negative')
      .max(365, 'Payment terms cannot exceed 365 days')
      .default(30),
    discount: z.coerce
      .number()
      .min(0, 'Discount cannot be negative')
      .max(100, 'Discount cannot exceed 100%')
      .optional(),
    currency: z
      .string()
      .min(1, 'Currency is required')
      .max(3, 'Currency must be a valid code')
      .default('EUR'),

    // Settings
    language: z.string().min(1, 'Language is required').max(10, 'Language must be a valid code'),
    sendReminders: z.boolean().default(true),
    autoInvoice: z.boolean().default(false),

    // Metadata
    notes: z
      .string()
      .max(5000, 'Notes must be less than 5000 characters')
      .optional()
      .or(z.literal('')),
    tags: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => {
      // If using shipping address, it must be provided
      if (data.useShippingAddress && !data.shippingAddress) {
        return false;
      }
      return true;
    },
    {
      message: 'Shipping address is required when enabled',
      path: ['shippingAddress'],
    }
  );

/** Client search/filter schema */
export const clientFilterSchema = z.object({
  search: z.string().optional(),
  country: z.string().optional(),
  isActive: z.boolean().optional(),
  currency: z.string().optional(),
  tags: z.array(z.string()).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z
    .enum(['name', 'clientCode', 'country', 'servicesCount', 'createdAt', 'updatedAt'])
    .default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

/** Type exports */
export type AddressInput = z.input<typeof addressSchema>;
export type ClientInput = z.input<typeof clientSchema>;
export type ClientOutput = z.output<typeof clientSchema>;
export type ClientFilterInput = z.input<typeof clientFilterSchema>;
