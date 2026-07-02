/**
 * Address JSON helpers
 *
 * Client addresses are stored as JSON columns (Client.billingAddress /
 * Client.shippingAddress) until they are normalized to columns (issue #14).
 * This is the single place where that JSON is narrowed to the Address shape.
 */

import type { Prisma } from '@/app/generated/prisma';
import type { Address } from '@/types/client';

/**
 * Narrow a Prisma JSON value to the stored Address shape.
 * Returns null when the value is missing or not a JSON object.
 */
export function asAddress(value: Prisma.JsonValue | null | undefined): Address | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as unknown as Address;
  }
  return null;
}
