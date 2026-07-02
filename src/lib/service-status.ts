/**
 * Service status state machine (#27).
 *
 * Single source of truth for which lifecycle transitions are legal. Pure
 * module - no 'use server', no I/O - so it is unit-testable and shared by
 * every mutation path (generic edit, dedicated actions, bulk operations).
 *
 * Permissions are a separate concern: requireElevatedStatusTransition
 * decides WHO may perform a transition; this module decides WHICH
 * transitions exist at all.
 */

import { ServiceStatus } from '@/app/generated/prisma';

export class IllegalStatusTransitionError extends Error {
  readonly from: ServiceStatus;
  readonly to: ServiceStatus;

  constructor(from: ServiceStatus, to: ServiceStatus) {
    super(`Illegal service status transition: ${from} -> ${to}`);
    this.name = 'IllegalStatusTransitionError';
    this.from = from;
    this.to = to;
  }
}

/**
 * Allowed transitions. Same-status writes are always legal no-ops.
 *
 * - CANCELLED may only be reactivated to DRAFT or CONFIRMED - never jump
 *   back into execution or billing (CANCELLED -> IN_PROGRESS is illegal).
 * - INVOICED is financially booked: the only move is ARCHIVED
 *   (INVOICED -> DRAFT is illegal).
 * - COMPLETED may reopen to IN_PROGRESS (corrections), be INVOICED,
 *   CANCELLED, or ARCHIVED.
 * - ARCHIVED is terminal.
 */
const ALLOWED_TRANSITIONS: Record<ServiceStatus, readonly ServiceStatus[]> = {
  [ServiceStatus.DRAFT]: [
    ServiceStatus.CONFIRMED,
    ServiceStatus.IN_PROGRESS,
    ServiceStatus.COMPLETED,
    ServiceStatus.CANCELLED,
  ],
  [ServiceStatus.CONFIRMED]: [
    ServiceStatus.DRAFT,
    ServiceStatus.IN_PROGRESS,
    ServiceStatus.COMPLETED,
    ServiceStatus.CANCELLED,
  ],
  [ServiceStatus.IN_PROGRESS]: [
    ServiceStatus.CONFIRMED,
    ServiceStatus.COMPLETED,
    ServiceStatus.CANCELLED,
  ],
  [ServiceStatus.COMPLETED]: [
    ServiceStatus.IN_PROGRESS,
    ServiceStatus.INVOICED,
    ServiceStatus.CANCELLED,
    ServiceStatus.ARCHIVED,
  ],
  [ServiceStatus.CANCELLED]: [ServiceStatus.DRAFT, ServiceStatus.CONFIRMED],
  [ServiceStatus.INVOICED]: [ServiceStatus.ARCHIVED],
  [ServiceStatus.ARCHIVED]: [],
};

export function canTransition(from: ServiceStatus, to: ServiceStatus): boolean {
  if (from === to) {
    return true;
  }
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Throws IllegalStatusTransitionError when the move is not allowed. */
export function assertTransition(from: ServiceStatus, to: ServiceStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalStatusTransitionError(from, to);
  }
}

/**
 * All statuses from which `to` is legally reachable - including `to` itself
 * (same-status writes are legal no-ops). Lets mutation paths re-assert the
 * state machine INSIDE an UPDATE's WHERE clause, so a row whose status
 * changed between read and write is excluded by the database itself
 * (review !17 blocker 1).
 */
export function legalSourceStatuses(to: ServiceStatus): ServiceStatus[] {
  return (Object.keys(ALLOWED_TRANSITIONS) as ServiceStatus[]).filter((from) =>
    canTransition(from, to)
  );
}
