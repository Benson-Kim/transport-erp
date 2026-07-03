/**
 * #22 - Postgres-backed rate limiter: pure decision semantics.
 *
 * The boundary is pinned BEFORE the store (review note 4): with
 * maxAttempts = N, attempts 1..N-1 are allowed and attempt N trips the lock
 * and is blocked ("5 attempts total trips the lock; the fifth attempt is
 * blocked").
 */
import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/prisma/prisma', () => ({ __esModule: true, default: {} }));

import { RATE_LIMITS, decideRateLimit, extractClientIp, rateLimitKey } from '@/lib/rate-limiter';
import type { RateLimitState } from '@/lib/rate-limiter';

const OPTS = { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 };
const T0 = new Date('2026-07-03T10:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

/** Run `count` sequential attempts at T0 against an initially-unknown key. */
function simulate(count: number): { results: boolean[]; state: RateLimitState | null } {
  let state: RateLimitState | null = null;
  const results: boolean[] = [];
  for (let i = 0; i < count; i += 1) {
    const decision = decideRateLimit(state, T0, OPTS);
    state = decision.next;
    results.push(decision.allowed);
  }
  return { results, state };
}

describe('decideRateLimit boundary (#22)', () => {
  it('first attempt on an unknown key is allowed', () => {
    const decision = decideRateLimit(null, T0, OPTS);
    expect(decision.allowed).toBe(true);
    expect(decision.retryAfter).toBe(0);
    expect(decision.next).toMatchObject({ attempts: 1, lockedUntil: null });
  });

  it('allows attempts 1-4 and blocks the 5th (off-by-one pinned)', () => {
    const { results, state } = simulate(5);
    expect(results).toEqual([true, true, true, true, false]);
    expect(state?.lockedUntil).toEqual(at(OPTS.lockMs));
  });

  it('rejects while locked without consuming budget, retryAfter counts down', () => {
    const { state } = simulate(5);
    const later = at(5 * 60 * 1000);
    const decision = decideRateLimit(state, later, OPTS);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfter).toBe(OPTS.lockMs - 5 * 60 * 1000);
    expect(decision.next.attempts).toBe(state?.attempts);
  });

  it('starts a fresh window after the lock expires', () => {
    const { state } = simulate(5);
    const afterLock = at(OPTS.lockMs + 1);
    const decision = decideRateLimit(state, afterLock, OPTS);
    expect(decision.allowed).toBe(true);
    expect(decision.next).toMatchObject({ attempts: 1, lockedUntil: null });
    expect(decision.next.windowStart).toEqual(afterLock);
  });

  it('starts a fresh window after an idle windowMs', () => {
    const { state } = simulate(3);
    const decision = decideRateLimit(state, at(OPTS.windowMs), OPTS);
    expect(decision.allowed).toBe(true);
    expect(decision.next.attempts).toBe(1);
  });

  it('maxAttempts = 1 locks on the first attempt', () => {
    const decision = decideRateLimit(null, T0, { maxAttempts: 1, windowMs: 60_000 });
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfter).toBe(60_000); // lockMs defaults to windowMs
  });
});

describe('rateLimitKey (#22)', () => {
  it('normalises email and scopes by IP', () => {
    expect(rateLimitKey('login', ' User@Example.COM ', '203.0.113.7')).toBe(
      'login:user@example.com:203.0.113.7'
    );
  });

  it('falls back to an explicit unknown-IP bucket', () => {
    expect(rateLimitKey('verification-email', 'a@b.c', null)).toBe(
      'verification-email:a@b.c:unknown'
    );
  });
});

describe('extractClientIp (#22 - one implementation)', () => {
  const headersOf = (map: Record<string, string>) => ({
    get: (name: string) => map[name] ?? null,
  });

  it('takes the first x-forwarded-for hop', () => {
    expect(extractClientIp(headersOf({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe(
      '203.0.113.7'
    );
  });

  it('falls back to x-real-ip, then null', () => {
    expect(extractClientIp(headersOf({ 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9');
    expect(extractClientIp(headersOf({}))).toBeNull();
  });
});

describe('RATE_LIMITS policy pins (#22, review !22 item 3)', () => {
  it('login: locks at the 5th attempt within 15 min, for 15 min', () => {
    expect(RATE_LIMITS.LOGIN).toEqual({
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
      lockMs: 15 * 60 * 1000,
    });
  });

  it('email send: locks at the 3rd send within 1 h, for 1 h', () => {
    expect(RATE_LIMITS.EMAIL_SEND).toEqual({
      maxAttempts: 3,
      windowMs: 60 * 60 * 1000,
      lockMs: 60 * 60 * 1000,
    });
  });
});

describe('rateLimitKey truncation (review !22 item 1 - DoS-by-disk guard)', () => {
  it('caps attacker-controlled IP material at 64 chars', () => {
    const key = rateLimitKey('login', 'a@b.c', 'x'.repeat(500));
    expect(key).toBe(`login:a@b.c:${'x'.repeat(64)}`);
  });

  it('leaves real IPv6 addresses intact', () => {
    const ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
    expect(rateLimitKey('login', 'a@b.c', ipv6)).toBe(`login:a@b.c:${ipv6}`);
  });
});
