/**
 * #27 - service lifecycle state machine. Illegal moves named in the spec
 * (CANCELLED -> IN_PROGRESS, INVOICED -> DRAFT) must be rejected; legal
 * business flows must pass; same-status writes are no-ops.
 */
import { describe, expect, it } from '@jest/globals';

import { ServiceStatus } from '@/app/generated/prisma';
import {
  assertTransition,
  canTransition,
  IllegalStatusTransitionError,
} from '@/lib/service-status';

const { DRAFT, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, INVOICED, ARCHIVED } = ServiceStatus;

describe('legal transitions', () => {
  it.each([
    [DRAFT, CONFIRMED],
    [DRAFT, IN_PROGRESS],
    [DRAFT, COMPLETED],
    [DRAFT, CANCELLED],
    [CONFIRMED, DRAFT],
    [CONFIRMED, IN_PROGRESS],
    [CONFIRMED, COMPLETED],
    [CONFIRMED, CANCELLED],
    [IN_PROGRESS, CONFIRMED],
    [IN_PROGRESS, COMPLETED],
    [IN_PROGRESS, CANCELLED],
    [COMPLETED, IN_PROGRESS],
    [COMPLETED, INVOICED],
    [COMPLETED, CANCELLED],
    [COMPLETED, ARCHIVED],
    [CANCELLED, DRAFT],
    [CANCELLED, CONFIRMED],
    [INVOICED, ARCHIVED],
  ])('%s -> %s is allowed', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it('same-status writes are legal no-ops for every status', () => {
    for (const status of Object.values(ServiceStatus)) {
      expect(canTransition(status, status)).toBe(true);
    }
  });
});

describe('illegal transitions', () => {
  it.each([
    [CANCELLED, IN_PROGRESS], // spec-named: cancelled work cannot resume execution
    [CANCELLED, COMPLETED],
    [CANCELLED, INVOICED],
    [CANCELLED, ARCHIVED],
    [INVOICED, DRAFT], // spec-named: booked money cannot be un-drafted
    [INVOICED, CONFIRMED],
    [INVOICED, IN_PROGRESS],
    [INVOICED, COMPLETED],
    [INVOICED, CANCELLED],
    [ARCHIVED, DRAFT],
    [ARCHIVED, CONFIRMED],
    [ARCHIVED, IN_PROGRESS],
    [ARCHIVED, COMPLETED],
    [ARCHIVED, CANCELLED],
    [ARCHIVED, INVOICED],
    [IN_PROGRESS, DRAFT],
    [DRAFT, INVOICED],
    [DRAFT, ARCHIVED],
  ])('%s -> %s is rejected', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(IllegalStatusTransitionError);
  });

  it('the error carries the offending pair for callers and logs', () => {
    try {
      assertTransition(CANCELLED, IN_PROGRESS);
      throw new Error('expected assertTransition to throw');
    } catch (error) {
      const typed = error as IllegalStatusTransitionError;
      expect(typed.name).toBe('IllegalStatusTransitionError');
      expect(typed.from).toBe(CANCELLED);
      expect(typed.to).toBe(IN_PROGRESS);
    }
  });
});
