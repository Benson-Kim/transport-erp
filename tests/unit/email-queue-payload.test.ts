/**
 * #38: email_queue.data is JSONB storing the OBJECT; legacy rows were
 * double-serialized (JSON string inside JSONB). normalizeQueuePayload must
 * accept both so the existing queue drains after the fix.
 */
import { describe, expect, it, jest } from '@jest/globals';


import { normalizeQueuePayload } from '@/lib/email/service';

// service.ts imports the prisma singleton; mock it (jest.mock is hoisted
// above the import) so the unit suite never instantiates a real
// PrismaClient - test-unit runs without a database and a stray client
// crashes the process at exit with P1001.
jest.mock('@/lib/prisma/prisma', () => ({ __esModule: true, default: {} }));

describe('normalizeQueuePayload (#38)', () => {
  it('passes object payloads through untouched (new rows)', () => {
    const payload = { name: 'Ada', verificationUrl: 'https://example.test/v' };
    expect(normalizeQueuePayload(payload)).toBe(payload);
  });

  it('parses legacy double-serialized string payloads once', () => {
    const payload = { name: 'Ada', verificationUrl: 'https://example.test/v' };
    expect(normalizeQueuePayload(JSON.stringify(payload))).toEqual(payload);
  });

  it('throws on corrupted legacy strings instead of sending garbage', () => {
    expect(() => normalizeQueuePayload('{not json')).toThrow();
  });
});
