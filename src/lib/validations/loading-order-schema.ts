/**
 * Loading Order Validation Schemas (#32)
 */

import { z } from 'zod';

/** Hard cap on group size - a carrier instruction, not a bulk export. */
export const MAX_LOADING_ORDER_SERVICES = 50;

/**
 * Create/group input. Duplicated ids are normalized downstream
 * (first-seen order; see src/lib/loading-orders.ts).
 */
export const createLoadingOrderSchema = z.object({
  serviceIds: z
    .array(z.string().min(1, 'Service id must not be empty'))
    .min(1, 'Select at least one service')
    .max(
      MAX_LOADING_ORDER_SERVICES,
      `A loading order may group at most ${MAX_LOADING_ORDER_SERVICES} services`
    ),
  notes: z.string().trim().max(2000, 'Notes must be less than 2000 characters').optional(),
});

export type CreateLoadingOrderInput = z.infer<typeof createLoadingOrderSchema>;

/** List filters. The limit cap mirrors getPaginationParams' server-side cap. */
export const loadingOrderFilterSchema = z.object({
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['orderNumber', 'generatedAt', 'createdAt']).default('generatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type LoadingOrderFilterInput = z.infer<typeof loadingOrderFilterSchema>;
