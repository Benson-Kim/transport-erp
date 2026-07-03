/**
 * #22 - cross-process rate limiting against a REAL Postgres.
 *
 * Two independent limiter instances over two separate PrismaClient
 * connections share one budget - exactly what the in-memory Map could not
 * do (an in-process test would prove nothing; that was the bug).
 */
import { afterAll, expect, it } from '@jest/globals';

import { PrismaClient } from '@/app/generated/prisma';
import { PostgresRateLimiter, RATE_LIMITS, rateLimitKey } from '@/lib/rate-limiter';

import { prisma, uid } from './helpers';

const otherProcess = new PrismaClient();
const limiterA = new PostgresRateLimiter(prisma);
const limiterB = new PostgresRateLimiter(otherProcess);

afterAll(async () => {
  await prisma.$disconnect();
  await otherProcess.$disconnect();
});

it('blocks after N attempts ACROSS two limiter instances - 5th attempt blocked (#22)', async () => {
  const key = rateLimitKey('login', `cross-${uid()}@example.test`, '203.0.113.7');

  const results: boolean[] = [];
  for (let i = 0; i < 5; i += 1) {
    const limiter = i % 2 === 0 ? limiterA : limiterB;
    // eslint-disable-next-line no-await-in-loop -- attempts are sequential by nature
    const result = await limiter.consume(key, RATE_LIMITS.LOGIN);
    results.push(result.success);
  }
  expect(results).toEqual([true, true, true, true, false]);

  // Still blocked on BOTH instances, with a positive retryAfter.
  const blockedA = await limiterA.consume(key, RATE_LIMITS.LOGIN);
  const blockedB = await limiterB.consume(key, RATE_LIMITS.LOGIN);
  expect(blockedA.success).toBe(false);
  expect(blockedA.retryAfter).toBeGreaterThan(0);
  expect(blockedB.success).toBe(false);
});

it('atomic increment: concurrent attempts across instances never over-admit (#22)', async () => {
  const key = rateLimitKey('login', `race-${uid()}@example.test`, null);
  const opts = { maxAttempts: 5, windowMs: 60_000, lockMs: 60_000 };

  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) => (i % 2 === 0 ? limiterA : limiterB).consume(key, opts))
  );

  const allowed = results.filter((result) => result.success).length;
  // Attempts 1-4 admitted, attempt 5 trips the lock, everything after is
  // rejected - regardless of interleaving, because the row lock serialises
  // the increment.
  expect(allowed).toBe(opts.maxAttempts - 1);
});

it('reset clears the budget - the successful-login path (#22)', async () => {
  const key = rateLimitKey('login', `reset-${uid()}@example.test`, null);
  const opts = { maxAttempts: 2, windowMs: 60_000 };

  expect((await limiterA.consume(key, opts)).success).toBe(true);
  expect((await limiterB.consume(key, opts)).success).toBe(false);

  await limiterA.reset(key);

  expect((await limiterB.consume(key, opts)).success).toBe(true);
});
