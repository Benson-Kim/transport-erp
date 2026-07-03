/**
 * #24 - production boot fails fast without AUTH_SECRET (the NextAuth v5
 * name; NEXTAUTH_SECRET is the transitional v4 fallback).
 *
 * auth.ts calls NextAuth(authConfig) and imports heavy Node-only deps at
 * module load, so the factories below (the proven recipe from
 * auth-revalidation.test.ts) stub the graph; the Prisma singleton is mocked
 * per the unit convention (no DB client construction in test:unit).
 */
import { afterEach, beforeEach, expect, it, jest } from '@jest/globals';

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
jest.mock('@/lib/email', () => ({ emailService: {} }));
jest.mock('@/lib/prisma/prisma', () => ({ __esModule: true, default: { user: {} } }));

const ENV_KEYS = ['NODE_ENV', 'AUTH_SECRET', 'NEXTAUTH_SECRET'] as const;
const saved: Record<string, string | undefined> = {};

/**
 * Next's ProcessEnv augmentation types NODE_ENV as readonly, so direct
 * assignment is TS2540; at runtime process.env values are plain writable
 * strings. Drive the env matrix through defineProperty: the compile-time
 * contract is satisfied without `as any` (repo rule), and the module-load
 * wiring stays under test (!25 review item 1, minimal option).
 */
function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  Object.defineProperty(process.env, key, {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  jest.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) setEnv(key, saved[key]);
});

/** Load auth.ts in an isolated module registry; return what it threw. */
function loadAuthModule(): unknown {
  let thrown: unknown;
  jest.isolateModules(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- module-load side effect under test
      require('@/lib/auth/auth');
    } catch (error) {
      thrown = error;
    }
  });
  return thrown;
}

it('production boot WITHOUT a secret throws an actionable error (#24)', () => {
  setEnv('NODE_ENV', 'production');
  delete process.env.AUTH_SECRET;
  delete process.env.NEXTAUTH_SECRET;

  const thrown = loadAuthModule();
  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toContain('AUTH_SECRET is required in production');
});

it('production boot WITH AUTH_SECRET loads', () => {
  setEnv('NODE_ENV', 'production');
  setEnv('AUTH_SECRET', 'unit-test-secret-value-32-chars-long!!');
  delete process.env.NEXTAUTH_SECRET;

  expect(loadAuthModule()).toBeUndefined();
});

it('the transitional v4 NEXTAUTH_SECRET fallback also satisfies the guard', () => {
  setEnv('NODE_ENV', 'production');
  delete process.env.AUTH_SECRET;
  setEnv('NEXTAUTH_SECRET', 'legacy-secret-value-32-chars-long!!');

  expect(loadAuthModule()).toBeUndefined();
});

it('non-production boot without a secret loads (v5 throws MissingSecret later)', () => {
  setEnv('NODE_ENV', 'test');
  delete process.env.AUTH_SECRET;
  delete process.env.NEXTAUTH_SECRET;

  expect(loadAuthModule()).toBeUndefined();
});
