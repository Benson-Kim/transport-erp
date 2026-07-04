/**
 * Revenue recognition (#33).
 *
 * THE single definition of which service statuses carry recognized revenue.
 * Until this module, three call sites disagreed (dashboard-helpers'
 * aggregateRevenueByMonth: COMPLETED|INVOICED|ARCHIVED; dashboard-actions'
 * revenue aggregates: COMPLETED only; client-actions' calculateClientStats:
 * every status including CANCELLED), so the chart, the stat cards and the
 * client detail could not reconcile at month-end.
 *
 * Business decision (delivery-based recognition): revenue is recognized when
 * the work has been performed - COMPLETED - and stays recognized through
 * billing (INVOICED) and archival. ARCHIVED is included deliberately: the
 * state machine's (service-status.ts) ONLY exit from INVOICED is ARCHIVED,
 * so archived rows legitimately carry booked revenue - excluding them would
 * make history evaporate from reports at archive time. CANCELLED never
 * counts: cancelled services present as EUR 0 (effectiveServiceAmounts,
 * #28). DRAFT / CONFIRMED / IN_PROGRESS are pipeline, not revenue.
 *
 * Pure module - no 'use server', no I/O - shared by client charts, server
 * actions and SQL WHERE clauses (same placement rationale as pricing.ts and
 * service-status.ts). Do NOT re-type this list anywhere: JS filters use
 * isRecognizedRevenueStatus, SQL callers interpolate the constant.
 */

import { ServiceStatus } from '@/app/generated/prisma';

export const RECOGNIZED_REVENUE_STATUSES: readonly ServiceStatus[] = [
  ServiceStatus.COMPLETED,
  ServiceStatus.INVOICED,
  ServiceStatus.ARCHIVED,
];

/** Membership helper for JS-side filters (charts, DTO mappers). */
export function isRecognizedRevenueStatus(status: ServiceStatus): boolean {
  return RECOGNIZED_REVENUE_STATUSES.includes(status);
}
