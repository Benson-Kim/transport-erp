/**
 * #19 - crypto-random generated passwords.
 */
import { describe, expect, it } from '@jest/globals';

import { generateSecurePassword, secureRandomInt } from '@/lib/security/password';

describe('secureRandomInt', () => {
  it('returns values within [0, max)', () => {
    for (let i = 0; i < 200; i++) {
      const n = secureRandomInt(10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(10);
    }
  });

  it('throws for non-positive max', () => {
    expect(() => secureRandomInt(0)).toThrow();
  });

  it('throws for max > 256 instead of infinite-looping (review finding 4)', () => {
    expect(() => secureRandomInt(257)).toThrow();
    expect(() => secureRandomInt(256)).not.toThrow();
  });
});

describe('generateSecurePassword', () => {
  it('is 12 chars by default and respects a minimum of 8', () => {
    expect(generateSecurePassword()).toHaveLength(12);
    expect(generateSecurePassword(4).length).toBeGreaterThanOrEqual(8);
    expect(generateSecurePassword(20)).toHaveLength(20);
  });

  it('always contains at least one upper, lower, digit and symbol', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generateSecurePassword();
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[!@#$%^&*]/);
    }
  });

  it('produces different passwords across calls (not constant)', () => {
    const a = generateSecurePassword();
    const b = generateSecurePassword();
    expect(a).not.toBe(b);
  });
});
