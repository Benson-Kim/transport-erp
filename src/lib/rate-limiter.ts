/**
 * Rate Limiter
 *
 * Provides two implementations:
 *
 * 1. **RedisRateLimiter** (distributed) — uses a Redis sorted-set sliding window.
 *    Survives multi-replica deployments.  Requires `REDIS_URL` env var.
 *
 * 2. **InMemoryRateLimiter** (fallback) — in-process Map-based limiter.
 *    Used automatically when Redis is unavailable (dev, single-replica).
 *
 * The exported `checkRateLimit` function selects the correct backend at runtime.
 */

// Shared types

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

// In-memory fallback (same semantics, single-process only)

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  lastAttempt: number;
  lockedUntil?: number | undefined;
}

class InMemoryRateLimiter {
  private readonly limits: Map<string, RateLimitEntry> = new Map();
  private readonly cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  async check(
    identifier: string,
    maxAttempts: number,
    windowMs: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = this.limits.get(identifier);

    if (entry?.lockedUntil && entry.lockedUntil > now) {
      return { allowed: false, retryAfterMs: entry.lockedUntil - now };
    }

    if (entry && now - entry.firstAttempt < windowMs) {
      if (entry.attempts >= maxAttempts) {
        entry.lockedUntil = now + windowMs;
        return { allowed: false, retryAfterMs: windowMs };
      }
    } else if (entry) {
      // Window expired — reset the entry so new attempts start fresh
      entry.attempts = 0;
      entry.firstAttempt = now;
      entry.lockedUntil = undefined;
    }

    return { allowed: true, retryAfterMs: 0 };
  }

  async increment(identifier: string): Promise<void> {
    const now = Date.now();
    const entry = this.limits.get(identifier);

    if (entry) {
      entry.attempts++;
      entry.lastAttempt = now;
    } else {
      this.limits.set(identifier, {
        attempts: 1,
        firstAttempt: now,
        lastAttempt: now,
      });
    }
  }

  async reset(identifier: string): Promise<void> {
    this.limits.delete(identifier);
  }

  private cleanup(): void {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    for (const [key, entry] of this.limits.entries()) {
      if (entry.lastAttempt < oneHourAgo) {
        this.limits.delete(key);
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.limits.clear();
  }
}

// Redis-backed distributed rate limiter (sliding window via sorted set)

let redisClient: any | null = null;
let redisInitialized = false;

async function getRedis() {
  if (redisInitialized) return redisClient;
  redisInitialized = true;

  const url = process.env['REDIS_URL'];
  if (!url) {
    console.warn('[RateLimiter] REDIS_URL not set — falling back to in-memory rate limiter.');
    return null;
  }

  try {
    // Dynamic import so the app still starts if ioredis is not installed
    const Redis = (await import('ioredis')).default;
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    await redisClient.connect();
    console.info('[RateLimiter] Connected to Redis for distributed rate limiting.');
  } catch (err) {
    console.warn('[RateLimiter] Could not connect to Redis — falling back to in-memory:', err);
    redisClient = null;
  }
  return redisClient;
}

async function checkWithRedis(
  redis: any,
  identifier: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const key = `rl:${identifier}`;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, now - windowMs); // evict expired
  pipeline.zadd(key, now, `${now}:${Math.random()}`); // record attempt (unique member)
  pipeline.zcard(key); // count in window
  pipeline.pexpire(key, windowMs); // auto-expire key
  const results = await pipeline.exec();

  const count = results?.[2]?.[1] as number;
  if (count > maxAttempts) {
    return { allowed: false, retryAfterMs: windowMs };
  }
  return { allowed: true, retryAfterMs: 0 };
}

// ---------------------------------------------------------------------------
// Public API — auto-selects Redis or fallback
// ---------------------------------------------------------------------------

const fallback = new InMemoryRateLimiter();

/**
 * Checks whether the given identifier is within the rate limit.
 *
 * @param identifier  Unique key (e.g. `gps:${driverId}`, `login:${email}`)
 * @param maxAttempts Maximum allowed attempts within the window
 * @param windowSeconds Window duration in seconds
 */
export async function checkRateLimit(
  identifier: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const redis = await getRedis();

  if (redis) {
    try {
      return await checkWithRedis(redis, identifier, maxAttempts, windowSeconds);
    } catch {
      // Redis failure shouldn't break the request — degrade gracefully
      console.warn('[RateLimiter] Redis call failed, falling back to in-memory.');
    }
  }

  // Fallback to in-memory (window converted to ms)
  const windowMs = windowSeconds * 1000;
  const result = await fallback.check(identifier, maxAttempts, windowMs);
  if (result.allowed) {
    await fallback.increment(identifier);
  }
  return result;
}

/**
 * Resets rate limit state for an identifier (e.g. after successful login).
 */
export async function resetRateLimit(identifier: string): Promise<void> {
  const redis = await getRedis();
  if (redis) {
    try {
      await redis.del(`rl:${identifier}`);
      return;
    } catch {
      // swallow
    }
  }
  await fallback.reset(identifier);
}

// Legacy export for backwards compatibility
export const rateLimiter = fallback;
