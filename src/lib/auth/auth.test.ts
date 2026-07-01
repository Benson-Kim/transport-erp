import { UserRole } from '@/app/generated/prisma';

// auth.ts calls NextAuth(authConfig) and imports heavy Node-only deps at
// module load. Mock them so only the pure exports under test are exercised.
jest.mock('next-auth', () => ({
  __esModule: true,
  default: () => ({
    handlers: {},
    signIn: jest.fn(),
    signOut: jest.fn(),
    auth: jest.fn(),
    unstable_update: jest.fn(),
  }),
}));
jest.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));
jest.mock('next-auth/providers/google', () => ({ __esModule: true, default: () => ({}) }));
jest.mock('next-auth/providers/credentials', () => ({ __esModule: true, default: () => ({}) }));
jest.mock('@/lib/rate-limiter', () => ({ rateLimiter: {} }));
jest.mock('../email', () => ({ emailService: {} }));
jest.mock('@/lib/prisma/prisma', () => ({ __esModule: true, default: { user: {} } }));

import {
  TOKEN_REVALIDATE_MS,
  revalidateTokenFields,
  shouldRevalidateToken,
} from './auth';

describe('shouldRevalidateToken', () => {
  it('revalidates when checkedAt is unset', () => {
    expect(shouldRevalidateToken(undefined, 1_000)).toBe(true);
  });

  it('does not revalidate within the cache window', () => {
    const now = 1_000_000;
    expect(shouldRevalidateToken(now - (TOKEN_REVALIDATE_MS - 1), now)).toBe(false);
  });

  it('revalidates once the cache window has elapsed', () => {
    const now = 1_000_000;
    expect(shouldRevalidateToken(now - TOKEN_REVALIDATE_MS, now)).toBe(true);
    expect(shouldRevalidateToken(now - (TOKEN_REVALIDATE_MS + 1), now)).toBe(true);
  });
});

describe('revalidateTokenFields', () => {
  it('revokes when the user is missing', () => {
    expect(revalidateTokenFields(null, UserRole.ADMIN, 0)).toEqual({
      role: UserRole.ADMIN,
      isActive: false,
    });
  });

  it('revokes when the user is soft-deleted', () => {
    expect(
      revalidateTokenFields(
        { role: UserRole.MANAGER, isActive: true, deletedAt: new Date(), tokenVersion: 0 },
        UserRole.MANAGER,
        0
      )
    ).toEqual({ role: UserRole.MANAGER, isActive: false });
  });

  it('revokes when the user is deactivated', () => {
    expect(
      revalidateTokenFields(
        { role: UserRole.OPERATOR, isActive: false, deletedAt: null, tokenVersion: 0 },
        UserRole.OPERATOR,
        0
      )
    ).toEqual({ role: UserRole.OPERATOR, isActive: false });
  });

  it('refreshes role and isActive for an active user (role change takes effect)', () => {
    // Token still says OPERATOR; DB now says MANAGER -> token should follow DB.
    expect(
      revalidateTokenFields(
        { role: UserRole.MANAGER, isActive: true, deletedAt: null, tokenVersion: 0 },
        UserRole.OPERATOR,
        0
      )
    ).toEqual({ role: UserRole.MANAGER, isActive: true });
  });

  it('keeps an active user with a matching tokenVersion', () => {
    expect(
      revalidateTokenFields(
        { role: UserRole.ADMIN, isActive: true, deletedAt: null, tokenVersion: 3 },
        UserRole.ADMIN,
        3
      )
    ).toEqual({ role: UserRole.ADMIN, isActive: true });
  });

  it('revokes when the DB tokenVersion is ahead of the token (security event bump)', () => {
    expect(
      revalidateTokenFields(
        { role: UserRole.ADMIN, isActive: true, deletedAt: null, tokenVersion: 4 },
        UserRole.ADMIN,
        3
      )
    ).toEqual({ role: UserRole.ADMIN, isActive: false });
  });

  it('treats an undefined token version as 0', () => {
    // Legacy token minted before tokenVersion existed; DB still at 0 -> valid.
    expect(
      revalidateTokenFields(
        { role: UserRole.VIEWER, isActive: true, deletedAt: null, tokenVersion: 0 },
        UserRole.VIEWER,
        undefined
      )
    ).toEqual({ role: UserRole.VIEWER, isActive: true });
  });

  it('falls back to VIEWER when no current role and user is missing', () => {
    expect(revalidateTokenFields(null, undefined, undefined)).toEqual({
      role: UserRole.VIEWER,
      isActive: false,
    });
  });
});
