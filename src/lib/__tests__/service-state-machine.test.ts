import { describe, it, expect } from 'vitest';
import {
  assertValidServiceTransition,
  isValidServiceTransition,
  getAllowedServiceTransitions,
  filterValidTransitions,
  TERMINAL_SERVICE_STATUSES,
} from '../service/service-state-machine';
import { ServiceStatus } from '@/app/generated/prisma';

describe('Service State Machine', () => {
  describe('assertValidServiceTransition', () => {
    it('allows DRAFT → CONFIRMED', () => {
      expect(() => assertValidServiceTransition(ServiceStatus.DRAFT, ServiceStatus.CONFIRMED))
        .not.toThrow();
    });

    it('allows DRAFT → CANCELLED', () => {
      expect(() => assertValidServiceTransition(ServiceStatus.DRAFT, ServiceStatus.CANCELLED))
        .not.toThrow();
    });

    it('allows CONFIRMED → IN_PROGRESS', () => {
      expect(() => assertValidServiceTransition(ServiceStatus.CONFIRMED, ServiceStatus.IN_PROGRESS))
        .not.toThrow();
    });

    it('allows IN_PROGRESS → COMPLETED', () => {
      expect(() => assertValidServiceTransition(ServiceStatus.IN_PROGRESS, ServiceStatus.COMPLETED))
        .not.toThrow();
    });

    it('allows COMPLETED → INVOICED', () => {
      expect(() => assertValidServiceTransition(ServiceStatus.COMPLETED, ServiceStatus.INVOICED))
        .not.toThrow();
    });

    it('allows INVOICED → ARCHIVED', () => {
      expect(() => assertValidServiceTransition(ServiceStatus.INVOICED, ServiceStatus.ARCHIVED))
        .not.toThrow();
    });

    it('throws for skip transition DRAFT → COMPLETED', () => {
      expect(() => assertValidServiceTransition(ServiceStatus.DRAFT, ServiceStatus.COMPLETED))
        .toThrow('Invalid service status transition');
    });

    it('throws for terminal CANCELLED → anything', () => {
      expect(() => assertValidServiceTransition(ServiceStatus.CANCELLED, ServiceStatus.DRAFT))
        .toThrow('none (terminal)');
    });

    it('throws for terminal ARCHIVED → anything', () => {
      expect(() => assertValidServiceTransition(ServiceStatus.ARCHIVED, ServiceStatus.DRAFT))
        .toThrow('none (terminal)');
    });

    it('throws for backward COMPLETED → IN_PROGRESS', () => {
      expect(() => assertValidServiceTransition(ServiceStatus.COMPLETED, ServiceStatus.IN_PROGRESS))
        .toThrow('Invalid service status transition');
    });
  });

  describe('isValidServiceTransition', () => {
    it('returns true for valid transitions', () => {
      expect(isValidServiceTransition(ServiceStatus.DRAFT, ServiceStatus.CONFIRMED)).toBe(true);
      expect(isValidServiceTransition(ServiceStatus.IN_PROGRESS, ServiceStatus.COMPLETED)).toBe(true);
    });

    it('returns false for invalid transitions', () => {
      expect(isValidServiceTransition(ServiceStatus.DRAFT, ServiceStatus.COMPLETED)).toBe(false);
      expect(isValidServiceTransition(ServiceStatus.CANCELLED, ServiceStatus.DRAFT)).toBe(false);
    });
  });

  describe('getAllowedServiceTransitions', () => {
    it('returns allowed transitions for DRAFT', () => {
      const transitions = getAllowedServiceTransitions(ServiceStatus.DRAFT);
      expect(transitions).toContain(ServiceStatus.CONFIRMED);
      expect(transitions).toContain(ServiceStatus.CANCELLED);
      expect(transitions).toHaveLength(2);
    });

    it('returns empty array for terminal statuses', () => {
      expect(getAllowedServiceTransitions(ServiceStatus.CANCELLED)).toEqual([]);
      expect(getAllowedServiceTransitions(ServiceStatus.ARCHIVED)).toEqual([]);
    });
  });

  describe('filterValidTransitions', () => {
    it('filters services to only valid transitions', () => {
      const services = [
        { id: '1', status: ServiceStatus.DRAFT },
        { id: '2', status: ServiceStatus.CONFIRMED },
        { id: '3', status: ServiceStatus.COMPLETED }, // Cannot go to CONFIRMED
      ];

      const result = filterValidTransitions(services, ServiceStatus.CONFIRMED);
      expect(result.validIds).toEqual(['1']); // Only DRAFT → CONFIRMED is valid
      expect(result.skippedCount).toBe(2);
    });

    it('returns all when all valid', () => {
      const services = [
        { id: '1', status: ServiceStatus.DRAFT },
        { id: '2', status: ServiceStatus.DRAFT },
      ];

      const result = filterValidTransitions(services, ServiceStatus.CANCELLED);
      expect(result.validIds).toEqual(['1', '2']);
      expect(result.skippedCount).toBe(0);
    });
  });

  describe('TERMINAL_SERVICE_STATUSES', () => {
    it('contains CANCELLED and ARCHIVED', () => {
      expect(TERMINAL_SERVICE_STATUSES.has(ServiceStatus.CANCELLED)).toBe(true);
      expect(TERMINAL_SERVICE_STATUSES.has(ServiceStatus.ARCHIVED)).toBe(true);
    });

    it('does not contain non-terminal statuses', () => {
      expect(TERMINAL_SERVICE_STATUSES.has(ServiceStatus.DRAFT)).toBe(false);
      expect(TERMINAL_SERVICE_STATUSES.has(ServiceStatus.COMPLETED)).toBe(false);
    });
  });
});
