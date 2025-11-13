/**
 * Rate Limiter
 * In-memory rate limiting for authentication attempts
 */

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  lastAttempt: number;
  lockedUntil?: number;
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up old entries every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  /**
   * Check if an identifier is rate limited
   */
  async check(
    identifier: string,
    maxAttempts: number,
    windowMs: number
  ): Promise<{ success: boolean; retryAfter: number }> {
    const now = Date.now();
    const entry = this.limits.get(identifier);

    // Check if locked
    if (entry?.lockedUntil && entry.lockedUntil > now) {
      return {
        success: false,
        retryAfter: entry.lockedUntil - now,
      };
    }

    // Check if within window
    if (entry && now - entry.firstAttempt < windowMs) {
      if (entry.attempts >= maxAttempts) {
        // Lock the account
        entry.lockedUntil = now + windowMs;
        return {
          success: false,
          retryAfter: windowMs,
        };
      }
    }

    return { success: true, retryAfter: 0 };
  }

  /**
   * Increment attempts for an identifier
   */
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

  /**
   * Reset attempts for an identifier
   */
  async reset(identifier: string): Promise<void> {
    this.limits.delete(identifier);
  }

  /**
   * Clean up old entries
   */
  private cleanup(): void {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    for (const [key, entry] of this.limits.entries()) {
      if (entry.lastAttempt < oneHourAgo) {
        this.limits.delete(key);
      }
    }
  }

  /**
   * Destroy the rate limiter
   */
  destroy(): void {
    clearInterval(this.cleanupInterval);
    this.limits.clear();
  }
}

// Export singleton instance
export const rateLimiter = new RateLimiter();
