/**
 * #18 - tokens hashed at rest.
 *
 * hashToken is the only transformation between the raw emailed token and the
 * stored DB value; these tests pin its format and determinism (a leaked
 * verification_tokens row is a SHA-256 hash, not a usable token).
 */
import { describe, expect, it, jest } from '@jest/globals';

import { hashToken } from '@/lib/auth/auth-helpers';

jest.mock('@/lib/prisma/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/email', () => ({ emailService: {} }));

describe('hashToken', () => {
  it('returns a 64-character hex string (SHA-256)', async () => {
    const h = await hashToken('test-token');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', async () => {
    const a = await hashToken('abc123');
    const b = await hashToken('abc123');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', async () => {
    const a = await hashToken('token-a');
    const b = await hashToken('token-b');
    expect(a).not.toBe(b);
  });

  it('matches the known SHA-256 of an empty string', async () => {
    // SHA-256('') = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    const h = await hashToken('');
    expect(h).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});
