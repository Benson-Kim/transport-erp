/**
 * Delivery State Machine
 * Defines and enforces valid DeliveryStatus transitions.
 * This is the single source of truth for what status changes are permissible.
 */

import { DeliveryStatus } from '@/app/generated/prisma';

/** Maps each status to the set of statuses it may legally transition to. */
const VALID_TRANSITIONS: Readonly<Record<DeliveryStatus, DeliveryStatus[]>> = {
  [DeliveryStatus.PENDING]: [DeliveryStatus.ASSIGNED],
  [DeliveryStatus.ASSIGNED]: [DeliveryStatus.PICKED_UP, DeliveryStatus.PENDING],
  [DeliveryStatus.PICKED_UP]: [DeliveryStatus.IN_TRANSIT],
  [DeliveryStatus.IN_TRANSIT]: [DeliveryStatus.OUT_FOR_DELIVERY],
  [DeliveryStatus.OUT_FOR_DELIVERY]: [
    DeliveryStatus.DELIVERED,
    DeliveryStatus.FAILED,
    DeliveryStatus.DELIVERY_ATTEMPTED,
  ],
  [DeliveryStatus.DELIVERY_ATTEMPTED]: [
    DeliveryStatus.OUT_FOR_DELIVERY,
    DeliveryStatus.FAILED,
  ],
  [DeliveryStatus.FAILED]: [DeliveryStatus.AT_PUDO, DeliveryStatus.OUT_FOR_DELIVERY],
  [DeliveryStatus.AT_PUDO]: [DeliveryStatus.DELIVERED],
  [DeliveryStatus.DELIVERED]: [], // Terminal
  [DeliveryStatus.RETURNED]: [],  // Terminal
};

/** Terminal statuses that cannot be changed once reached. */
export const TERMINAL_STATUSES: ReadonlySet<DeliveryStatus> = new Set([
  DeliveryStatus.DELIVERED,
  DeliveryStatus.RETURNED,
]);

/**
 * Asserts that a status transition is valid.
 * Throws a descriptive error if the transition is illegal.
 */
export function assertValidTransition(from: DeliveryStatus, to: DeliveryStatus): void {
  const allowed = VALID_TRANSITIONS[from];

  if (!allowed) {
    throw new Error(`Unknown source status: "${from}"`);
  }

  if (!allowed.includes(to)) {
    throw new Error(
      `Invalid delivery status transition: ${from} → ${to}. ` +
        `Allowed transitions from ${from}: [${allowed.join(', ') || 'none (terminal)'}]`
    );
  }
}

/**
 * Returns whether a given transition is valid without throwing.
 */
export function isValidTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Returns the allowed next statuses for a given current status.
 */
export function getAllowedTransitions(from: DeliveryStatus): DeliveryStatus[] {
  return [...(VALID_TRANSITIONS[from] ?? [])];
}
