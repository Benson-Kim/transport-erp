/**
 * #38: email_queue.data is JSONB storing the OBJECT; legacy rows were
 * double-serialized (JSON string inside JSONB). normalizeQueuePayload must
 * accept both so the existing queue drains after the fix.
 */

import { normalizeQueuePayload } from '@/lib/email/service';

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
