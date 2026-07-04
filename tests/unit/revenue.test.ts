/**
 * #33 - THE single revenue-recognition definition.
 *
 * Pins the business decision (delivery-based recognition) and its
 * consistency with the service state machine, so no future "fix" can
 * silently fork a fourth status set.
 */
import { describe, expect, it } from '@jest/globals';

import { ServiceStatus } from '@/app/generated/prisma';
import { RECOGNIZED_REVENUE_STATUSES, isRecognizedRevenueStatus } from '@/lib/revenue';
import { canTransition } from '@/lib/service-status';

describe('RECOGNIZED_REVENUE_STATUSES (#33)', () => {
  it('is exactly COMPLETED, INVOICED, ARCHIVED', () => {
    expect([...RECOGNIZED_REVENUE_STATUSES].sort()).toEqual(
      [ServiceStatus.ARCHIVED, ServiceStatus.COMPLETED, ServiceStatus.INVOICED].sort()
    );
  });

  it('classifies every ServiceStatus consistently with the constant', () => {
    for (const status of Object.values(ServiceStatus)) {
      expect(isRecognizedRevenueStatus(status)).toBe(RECOGNIZED_REVENUE_STATUSES.includes(status));
    }
  });

  it('never recognizes pipeline or cancelled services', () => {
    expect(isRecognizedRevenueStatus(ServiceStatus.DRAFT)).toBe(false);
    expect(isRecognizedRevenueStatus(ServiceStatus.CONFIRMED)).toBe(false);
    expect(isRecognizedRevenueStatus(ServiceStatus.IN_PROGRESS)).toBe(false);
    // CANCELLED presents as EUR 0 (effectiveServiceAmounts, #28) and must
    // never count as revenue.
    expect(isRecognizedRevenueStatus(ServiceStatus.CANCELLED)).toBe(false);
  });

  it('keeps revenue recognized across every legal exit from INVOICED (state-machine consistency)', () => {
    // INVOICED is financially booked; whatever the state machine allows
    // after it (today: only ARCHIVED) must not remove booked revenue from
    // reports.
    for (const target of Object.values(ServiceStatus)) {
      if (target !== ServiceStatus.INVOICED && canTransition(ServiceStatus.INVOICED, target)) {
        expect(isRecognizedRevenueStatus(target)).toBe(true);
      }
    }
  });
});
