/**
 * #35 / !27 review item 2 - the duplicate-account -> neutral-success mapping
 * is a typed contract, not a string match: rewording the user-facing copy
 * must never reopen the enumeration oracle.
 */

import { describe, expect, it } from '@jest/globals';

import { Prisma } from '@/app/generated/prisma';
import { DuplicateUserError, isDuplicateUserError } from '@/lib/auth/auth-helpers';

describe('isDuplicateUserError (#35)', () => {
  it('matches the typed pre-check error regardless of message text', () => {
    expect(isDuplicateUserError(new DuplicateUserError())).toBe(true);
    expect(isDuplicateUserError(new DuplicateUserError('completely reworded copy'))).toBe(true);
  });

  it('matches the P2002 unique-index backstop (racing registrations)', () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
    });
    expect(isDuplicateUserError(p2002)).toBe(true);
  });

  it('does NOT match a plain Error carrying the legacy message text', () => {
    // The old implementation matched exactly this - the contract is the
    // type, not the copy.
    expect(isDuplicateUserError(new Error('A user with this email already exists'))).toBe(false);
  });

  it('does not match unrelated errors or non-errors', () => {
    const p2025 = new Prisma.PrismaClientKnownRequestError('Record not found', {
      code: 'P2025',
      clientVersion: '6.19.3',
    });
    expect(isDuplicateUserError(p2025)).toBe(false);
    expect(isDuplicateUserError(new Error('boom'))).toBe(false);
    expect(isDuplicateUserError(null)).toBe(false);
    expect(isDuplicateUserError('P2002')).toBe(false);
  });
});
