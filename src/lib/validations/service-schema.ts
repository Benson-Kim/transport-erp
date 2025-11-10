/**
 * Service Validation Schemas
 */

import { z } from 'zod';
import { ServiceStatus } from '@/app/generated/prisma';

export const serviceSchema = z.object({
  date: z.coerce.date(),
  clientId: z.string().min(1, 'Client is required'),
  supplierId: z.string().min(1, 'Supplier is required'),
  description: z.string().min(1, 'Description is required'),
  reference: z.string().optional(),
  origin: z.string().min(1, 'Origin is required'),
  destination: z.string().min(1, 'Destination is required'),
  distance: z.number().optional(),
  vehicleType: z.string().optional(),
  vehiclePlate: z.string().optional(),
  driverName: z.string().optional(),
  costAmount: z.number().min(0, 'Cost must be positive'),
  saleAmount: z.number().min(0, 'Sale amount must be positive'),
  costCurrency: z.string().default('EUR'),
  saleCurrency: z.string().default('EUR'),
  costVatRate: z.number().default(21),
  saleVatRate: z.number().default(21),
  status: z.enum(ServiceStatus).default(ServiceStatus.DRAFT),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),

  kilometers: z.number().optional(),
  pricePerKm: z.number().optional(),
  extras: z.number().default(0),
  totalCost: z.number().min(0.01, 'Total cost is required and must be greater than 0'),
  sale: z.number().optional(),

  //   // Status (edit mode)
  completed: z.boolean().optional(),
  cancelled: z.boolean().optional(),
});

export const serviceFilterSchema = z.object({
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.enum(ServiceStatus).optional(),
  clientId: z.string().optional(),
  supplierId: z.string().optional(),
  driver: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(100).optional(),
});

export type ServiceFormData = z.input<typeof serviceSchema>;
export type ServiceSchemaOutput = z.infer<typeof serviceSchema>;
export type ServiceFilters = z.infer<typeof serviceFilterSchema>;
