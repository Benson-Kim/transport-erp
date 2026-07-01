// auth-helpers.test.ts
// Mock heavy deps so only the pure exports under test load.
jest.mock('@/lib/prisma/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('../email', () => ({ emailService: {} }));

import { hashToken } from './auth-helpers';

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
