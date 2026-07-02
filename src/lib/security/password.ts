/**
 * Cryptographically secure password generation. (#19)
 *
 * Uses crypto.getRandomValues (a CSPRNG) with rejection sampling to avoid
 * modulo bias. Never use Math.random() for security-sensitive values.
 */

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

/** Unbiased random integer in [0, max) using rejection sampling. */
export function secureRandomInt(max: number): number {
  if (max <= 0) throw new Error('max must be positive');
  const limit = 256 - (256 % max);
  const buf = new Uint8Array(1);
  let val: number;
  do {
    crypto.getRandomValues(buf);
    val = buf[0]!;
  } while (val >= limit);
  return val % max;
}

function pick(charset: string): string {
  return charset[secureRandomInt(charset.length)]!;
}

/**
 * Generate a password of `length` (min 8) guaranteed to contain at least one
 * upper, lower, digit and symbol, shuffled with a crypto Fisher-Yates.
 */
export function generateSecurePassword(length = 12): string {
  const len = Math.max(8, length);
  const chars = [
    pick(UPPER),
    pick(LOWER),
    pick(DIGITS),
    pick(SYMBOLS),
    ...Array.from({ length: len - 4 }, () => ALL[secureRandomInt(ALL.length)]!),
  ];

  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }

  return chars.join('');
}
