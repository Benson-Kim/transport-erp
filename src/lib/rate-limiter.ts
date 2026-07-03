/**
 * Rate Limiter (#22)
 *
 * Postgres-backed, cross-process rate limiting for authentication attempts
 * and public email-send triggers. Replaces the previous in-memory Map, which
 * was per-process (multi-instance deployments each granted a full budget),
 * never incremented on check (the lock could only trip one attempt late),
 * and leaked its setInterval cleanup in serverless.
 *
 * Semantics (pinned by tests/unit/rate-limiter.test.ts):
 * - Every attempt consumes budget atomically - there is NO check/increment
 *   split, so no path can send/probe without being counted.
 * - maxAttempts is the attempt number at which the limiter LOCKS: with
 *   maxAttempts = 5, attempts 1-4 are allowed and the 5th is blocked
 *   (the #22 acceptance: "5 attempts total trips the lock; the fifth
 *   attempt is blocked").
 * - While locked, attempts are rejected without consuming budget; after the
 *   lock (or an idle window) expires, the next attempt starts a fresh window.
 * - A database outage FAILS CLOSED by explicit decision: consume() throws,
 *   so the caller's attempt is rejected - an infrastructure failure must
 *   never be silently treated as "not limited" (#22 review note 2).
 *
 * Storage: one row per key in rate_limit_counters. consume() serialises
 * concurrent attempts on the same key with INSERT ... ON CONFLICT DO NOTHING
 * (row creation) + SELECT ... FOR UPDATE (row lock) inside one transaction,
 * so the increment is atomic across app instances - the same row-lock
 * convention as document_counters (#12). reset() deletes the row (successful
 * login), and every consume() opportunistically sweeps rows idle beyond
 * RATE_LIMIT_PRUNE_AFTER_MS, so spraying keys on unauthenticated paths
 * cannot grow the table without bound (review !22 item 1). All timestamps
 * the decision logic reads are written from the app clock - one clock
 * domain (review !22 item 2).
 */

import type { PrismaClient } from '@/app/generated/prisma';
import prisma from '@/lib/prisma/prisma';

/** Limit profiles. Durations in milliseconds. */
export const RATE_LIMITS = {
  /** Credentials login: lock for 15 min at the 5th attempt within 15 min. */
  LOGIN: { maxAttempts: 5, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 },
  /**
   * Public email-send triggers (verification resend, password reset):
   * lock for 1 h at the 3rd send within 1 h - spam/abuse and cost vector.
   */
  EMAIL_SEND: { maxAttempts: 3, windowMs: 60 * 60 * 1000, lockMs: 60 * 60 * 1000 },
  /**
   * Public registration, keyed per IP with an empty email component (#35):
   * bounds bcrypt work, allow-list probing and account/send attempts for
   * callers rotating email addresses (the per-email budgets cannot).
   * Lock for 1 h at the 10th attempt within 1 h.
   */
  REGISTRATION: { maxAttempts: 10, windowMs: 60 * 60 * 1000, lockMs: 60 * 60 * 1000 },
} as const;

/**
 * Rows idle longer than this are semantically dead (any window/lock above is
 * at most 1 h) and are swept opportunistically on consume(). Pinned
 * conservatively at 24 h so the sweep can never delete live state.
 */
export const RATE_LIMIT_PRUNE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface RateLimitOptions {
  /** Attempt number at which the limiter locks (that attempt is blocked). */
  maxAttempts: number;
  /** Fixed counting window, anchored at the key's windowStart. */
  windowMs: number;
  /** Lock duration once maxAttempts is reached. Defaults to windowMs. */
  lockMs?: number;
}

export interface RateLimitResult {
  success: boolean;
  /** Milliseconds until the caller may retry (0 when success). */
  retryAfter: number;
}

/**
 * Typed rate-limit rejection - the third member of the typed authz error
 * contract (UnauthorizedError / ForbiddenError in src/lib/rbac.ts, which
 * re-exports this class). Catch by instanceof; never string-match messages.
 * Defined here rather than in rbac.ts because rbac depends on lib/auth,
 * which depends on this module - defining it there would create a cycle.
 */
export class RateLimitedError extends Error {
  readonly retryAfter: number;

  constructor(retryAfterMs: number, message?: string) {
    const minutes = Math.max(1, Math.ceil(retryAfterMs / 60000));
    super(
      message ??
        `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
    );
    this.name = 'RateLimitedError';
    this.retryAfter = retryAfterMs;
  }
}

/**
 * Client IP extraction - the ONE implementation (#22 review note 5), shared
 * by authorize() in src/lib/auth/auth.ts and getClientInfo() in
 * src/actions/auth-actions.ts. First x-forwarded-for hop, then x-real-ip.
 */
export function extractClientIp(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return headers.get('x-real-ip');
}

/** Scopes with independent budgets. verification-email is ONE send budget
 * shared by the unverified-login path, the public resend form and
 * registration; 'registration' is the per-IP attempt gate (#35). */
export type RateLimitScope =
  | 'login'
  | 'verification-email'
  | 'password-reset-email'
  | 'registration';

/**
 * Longest IP component persisted into a key: covers any textual IPv6 form
 * while capping attacker-controlled x-forwarded-for material - keys become
 * persisted rows on unauthenticated paths, so unbounded input would be a
 * DoS-by-disk vector (review !22 item 1).
 */
const MAX_IP_KEY_LENGTH = 64;

/** Limiter key: scope + normalised email + IP (issue spec: keyed by IP+email). */
export function rateLimitKey(scope: RateLimitScope, email: string, ip: string | null): string {
  return `${scope}:${email.trim().toLowerCase()}:${(ip ?? 'unknown').slice(0, MAX_IP_KEY_LENGTH)}`;
}

/** Persisted state of one limiter key. */
export interface RateLimitState {
  attempts: number;
  windowStart: Date;
  lockedUntil: Date | null;
}

export interface RateLimitDecision {
  allowed: boolean;
  /** Milliseconds until retry (0 when allowed). */
  retryAfter: number;
  /** State to persist. Carries the same values when the key is locked. */
  next: RateLimitState;
}

/**
 * Pure decision: given the current persisted state of a key (null = no row)
 * and the moment of the attempt, decide whether the attempt is allowed and
 * what state to persist. Extracted so the boundary semantics are
 * unit-testable without a database (#22 review note 4).
 */
export function decideRateLimit(
  state: RateLimitState | null,
  now: Date,
  options: RateLimitOptions
): RateLimitDecision {
  const { maxAttempts, windowMs } = options;
  const lockMs = options.lockMs ?? windowMs;

  // Actively locked: reject without consuming budget.
  if (state?.lockedUntil && state.lockedUntil.getTime() > now.getTime()) {
    return {
      allowed: false,
      retryAfter: state.lockedUntil.getTime() - now.getTime(),
      next: state,
    };
  }

  // Fresh window: no state yet, an expired lock (the active case returned
  // above), or an idle window that has elapsed.
  const isFresh =
    !state ||
    state.lockedUntil !== null ||
    now.getTime() - state.windowStart.getTime() >= windowMs;

  const attempts = isFresh ? 1 : state.attempts + 1;
  const windowStart = isFresh && state ? now : (state?.windowStart ?? now);

  // Reaching maxAttempts trips the lock and blocks THAT attempt (#22).
  if (attempts >= maxAttempts) {
    return {
      allowed: false,
      retryAfter: lockMs,
      next: { attempts, windowStart: isFresh ? now : windowStart, lockedUntil: new Date(now.getTime() + lockMs) },
    };
  }

  return {
    allowed: true,
    retryAfter: 0,
    next: { attempts, windowStart: isFresh ? now : windowStart, lockedUntil: null },
  };
}

interface CounterRow {
  attempts: number;
  windowStart: Date;
  lockedUntil: Date | null;
}

/**
 * Anything that can run raw queries and an interactive transaction: the base
 * client or the app's $extends-ed singleton. Typed structurally (method
 * shorthand for parameter bivariance) - the proven repo pattern from
 * numbering.ts / db-helpers.ts under exactOptionalPropertyTypes.
 */
export type RawQueryClient = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;

export type RateLimitStore = RawQueryClient & {
  $transaction<T>(fn: (tx: RawQueryClient) => Promise<T>): Promise<T>;
};

export class PostgresRateLimiter {
  private readonly store: RateLimitStore;

  constructor(store: RateLimitStore = prisma) {
    this.store = store;
  }

  /**
   * Atomically consume one attempt for a key and decide whether it is
   * allowed. Concurrent attempts on the same key - across processes - queue
   * on the row lock, so the count can neither race nor over-admit.
   */
  async consume(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
    const decision = await this.store.$transaction(async (tx) => {
      // One clock domain (review !22 item 2): the seed row, the decision and
      // the persisted state all use this timestamp - no SQL now() in any
      // value the decision logic reads.
      const now = new Date();

      // Ensure the row exists, then lock it. Concurrent first attempts on a
      // new key serialise on the speculative insert; everyone else queues on
      // the row lock.
      await tx.$executeRaw`
        INSERT INTO "rate_limit_counters" ("key", "attempts", "windowStart", "updatedAt")
        VALUES (${key}, 0, ${now}, ${now})
        ON CONFLICT ("key") DO NOTHING;
      `;

      const rows = await tx.$queryRaw<CounterRow[]>`
        SELECT "attempts", "windowStart", "lockedUntil"
        FROM "rate_limit_counters"
        WHERE "key" = ${key}
        FOR UPDATE;
      `;

      const result = decideRateLimit(rows[0] ?? null, now, options);

      await tx.$executeRaw`
        UPDATE "rate_limit_counters"
        SET "attempts" = ${result.next.attempts},
            "windowStart" = ${result.next.windowStart},
            "lockedUntil" = ${result.next.lockedUntil},
            "updatedAt" = ${now}
        WHERE "key" = ${key};
      `;

      return result;
    });

    // Opportunistic sweep of dead rows (review !22 item 1). Never fails the
    // attempt: a failed sweep is logged, not surfaced.
    try {
      await this.pruneStale();
    } catch (error) {
      console.error('Rate-limiter prune failed:', error);
    }

    return { success: decision.allowed, retryAfter: decision.retryAfter };
  }

  /**
   * Delete rows idle beyond RATE_LIMIT_PRUNE_AFTER_MS whose lock (if any)
   * has expired. Active keys always have a fresh updatedAt, so the sweep
   * never contends with rows locked by a concurrent consume(). Scans the
   * updatedAt index.
   */
  private async pruneStale(): Promise<void> {
    const now = new Date();
    const cutoff = new Date(now.getTime() - RATE_LIMIT_PRUNE_AFTER_MS);
    await this.store.$executeRaw`
      DELETE FROM "rate_limit_counters"
      WHERE "updatedAt" < ${cutoff}
        AND ("lockedUntil" IS NULL OR "lockedUntil" < ${now});
    `;
  }

  /** Clear a key (successful login). Deleting the row keeps the table trim. */
  async reset(key: string): Promise<void> {
    await this.store.$executeRaw`
      DELETE FROM "rate_limit_counters" WHERE "key" = ${key};
    `;
  }
}

/** App-wide limiter bound to the Prisma singleton. */
export const rateLimiter = new PostgresRateLimiter();
