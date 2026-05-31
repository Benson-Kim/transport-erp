/**
 * Service Status State Machine
 *
 * Defines and enforces valid ServiceStatus transitions.
 * Single source of truth — mirrors the DeliveryStateMachine pattern.
 *
 * Used by: createService, updateService, bulkUpdateServices, service-helpers (UI).
 */

import { ServiceStatus } from '@/app/generated/prisma';

/** Maps each status to the set of statuses it may legally transition to. */
const VALID_TRANSITIONS: Readonly<Record<ServiceStatus, ServiceStatus[]>> = {
  [ServiceStatus.DRAFT]: [ServiceStatus.CONFIRMED, ServiceStatus.CANCELLED],
  [ServiceStatus.CONFIRMED]: [ServiceStatus.IN_PROGRESS, ServiceStatus.CANCELLED],
  [ServiceStatus.IN_PROGRESS]: [ServiceStatus.COMPLETED, ServiceStatus.CANCELLED],
  [ServiceStatus.COMPLETED]: [ServiceStatus.INVOICED],
  [ServiceStatus.CANCELLED]: [], // Terminal
  [ServiceStatus.INVOICED]: [ServiceStatus.ARCHIVED],
  [ServiceStatus.ARCHIVED]: [], // Terminal
};

/** Terminal statuses that cannot be changed once reached. */
export const TERMINAL_SERVICE_STATUSES: ReadonlySet<ServiceStatus> = new Set([
  ServiceStatus.CANCELLED,
  ServiceStatus.ARCHIVED,
]);

/**
 * Asserts that a service status transition is valid.
 * Throws a descriptive error if the transition is illegal.
 */
export function assertValidServiceTransition(from: ServiceStatus, to: ServiceStatus): void {
  const allowed = VALID_TRANSITIONS[from];

  if (!allowed) {
    throw new Error(`Unknown service status: "${from}"`);
  }

  if (!allowed.includes(to)) {
    throw new Error(
      `Invalid service status transition: ${from} → ${to}. ` +
      `Allowed transitions from ${from}: [${allowed.join(', ') || 'none (terminal)'}]`
    );
  }
}

/**
 * Returns whether a given service transition is valid without throwing.
 */
export function isValidServiceTransition(from: ServiceStatus, to: ServiceStatus): boolean {
  return (VALID_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Returns the allowed next statuses for a given current status.
 */
export function getAllowedServiceTransitions(from: ServiceStatus): ServiceStatus[] {
  return [...(VALID_TRANSITIONS[from] ?? [])];
}

/**
 * Filters a list of services to only those that can legally transition to the target status.
 * Returns { validIds, skippedCount }.
 */
export function filterValidTransitions(
  services: Array<{ id: string; status: ServiceStatus }>,
  targetStatus: ServiceStatus,
): { validIds: string[]; skippedCount: number } {
  const validIds = services
    .filter((s) => isValidServiceTransition(s.status, targetStatus))
    .map((s) => s.id);

  return {
    validIds,
    skippedCount: services.length - validIds.length,
  };
}
