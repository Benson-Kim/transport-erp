import { describe, it, expect } from 'vitest';
import {
  assertValidTransition,
  isValidTransition,
  getAllowedTransitions,
  TERMINAL_STATUSES,
} from '../delivery/delivery-state-machine';
import { DeliveryStatus } from '@/app/generated/prisma';

describe('Delivery State Machine', () => {
  describe('assertValidTransition', () => {
    it('allows PENDING → ASSIGNED', () => {
      expect(() => assertValidTransition(DeliveryStatus.PENDING, DeliveryStatus.ASSIGNED))
        .not.toThrow();
    });

    it('allows ASSIGNED → PICKED_UP', () => {
      expect(() => assertValidTransition(DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP))
        .not.toThrow();
    });

    it('allows ASSIGNED → PENDING (re-assign / unassign)', () => {
      expect(() => assertValidTransition(DeliveryStatus.ASSIGNED, DeliveryStatus.PENDING))
        .not.toThrow();
    });

    it('allows OUT_FOR_DELIVERY → DELIVERED', () => {
      expect(() => assertValidTransition(DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.DELIVERED))
        .not.toThrow();
    });

    it('allows OUT_FOR_DELIVERY → FAILED', () => {
      expect(() => assertValidTransition(DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.FAILED))
        .not.toThrow();
    });

    it('allows FAILED → AT_PUDO', () => {
      expect(() => assertValidTransition(DeliveryStatus.FAILED, DeliveryStatus.AT_PUDO))
        .not.toThrow();
    });

    it('allows AT_PUDO → DELIVERED', () => {
      expect(() => assertValidTransition(DeliveryStatus.AT_PUDO, DeliveryStatus.DELIVERED))
        .not.toThrow();
    });

    it('throws for invalid transition PENDING → DELIVERED', () => {
      expect(() => assertValidTransition(DeliveryStatus.PENDING, DeliveryStatus.DELIVERED))
        .toThrow('Invalid delivery status transition');
    });

    it('throws for terminal status DELIVERED → anything', () => {
      expect(() => assertValidTransition(DeliveryStatus.DELIVERED, DeliveryStatus.PENDING))
        .toThrow('none (terminal)');
    });

    it('throws for terminal status RETURNED → anything', () => {
      expect(() => assertValidTransition(DeliveryStatus.RETURNED, DeliveryStatus.PENDING))
        .toThrow('none (terminal)');
    });

    it('throws for backward transition IN_TRANSIT → ASSIGNED', () => {
      expect(() => assertValidTransition(DeliveryStatus.IN_TRANSIT, DeliveryStatus.ASSIGNED))
        .toThrow('Invalid delivery status transition');
    });
  });

  describe('isValidTransition', () => {
    it('returns true for valid transitions', () => {
      expect(isValidTransition(DeliveryStatus.PENDING, DeliveryStatus.ASSIGNED)).toBe(true);
      expect(isValidTransition(DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT)).toBe(true);
    });

    it('returns false for invalid transitions', () => {
      expect(isValidTransition(DeliveryStatus.PENDING, DeliveryStatus.DELIVERED)).toBe(false);
      expect(isValidTransition(DeliveryStatus.DELIVERED, DeliveryStatus.PENDING)).toBe(false);
    });
  });

  describe('getAllowedTransitions', () => {
    it('returns allowed transitions for PENDING', () => {
      expect(getAllowedTransitions(DeliveryStatus.PENDING)).toEqual([DeliveryStatus.ASSIGNED]);
    });

    it('returns multiple transitions for OUT_FOR_DELIVERY', () => {
      const transitions = getAllowedTransitions(DeliveryStatus.OUT_FOR_DELIVERY);
      expect(transitions).toContain(DeliveryStatus.DELIVERED);
      expect(transitions).toContain(DeliveryStatus.FAILED);
      expect(transitions).toContain(DeliveryStatus.DELIVERY_ATTEMPTED);
      expect(transitions).toHaveLength(3);
    });

    it('returns empty array for terminal statuses', () => {
      expect(getAllowedTransitions(DeliveryStatus.DELIVERED)).toEqual([]);
      expect(getAllowedTransitions(DeliveryStatus.RETURNED)).toEqual([]);
    });
  });

  describe('TERMINAL_STATUSES', () => {
    it('contains DELIVERED and RETURNED', () => {
      expect(TERMINAL_STATUSES.has(DeliveryStatus.DELIVERED)).toBe(true);
      expect(TERMINAL_STATUSES.has(DeliveryStatus.RETURNED)).toBe(true);
    });

    it('does not contain non-terminal statuses', () => {
      expect(TERMINAL_STATUSES.has(DeliveryStatus.PENDING)).toBe(false);
      expect(TERMINAL_STATUSES.has(DeliveryStatus.FAILED)).toBe(false);
    });
  });
});
