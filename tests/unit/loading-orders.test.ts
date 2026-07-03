/**
 * #32 - loading-order grouping: pure input normalization + schema bounds.
 */

import { describe, expect, it } from '@jest/globals';

import {
  buildServicePositions,
  deriveClientId,
  normalizeServiceIds,
} from '@/lib/loading-orders';
import {
  createLoadingOrderSchema,
  MAX_LOADING_ORDER_SERVICES,
} from '@/lib/validations/loading-order-schema';

describe('normalizeServiceIds', () => {
  it('dedupes preserving first-seen order (positions are carrier-visible)', () => {
    expect(normalizeServiceIds(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c']);
  });

  it('returns an empty list unchanged', () => {
    expect(normalizeServiceIds([])).toEqual([]);
  });
});

describe('buildServicePositions', () => {
  it('assigns dense 1-based positions in first-seen order', () => {
    expect(buildServicePositions(['s2', 's1', 's2', 's3'])).toEqual([
      { serviceId: 's2', position: 1 },
      { serviceId: 's1', position: 2 },
      { serviceId: 's3', position: 3 },
    ]);
  });
});

describe('deriveClientId', () => {
  it('links the client only when every member shares it', () => {
    expect(deriveClientId(['c1', 'c1'])).toBe('c1');
  });

  it('is null for mixed-client groups', () => {
    expect(deriveClientId(['c1', 'c2'])).toBeNull();
  });

  it('is null for empty input', () => {
    expect(deriveClientId([])).toBeNull();
  });
});

describe('createLoadingOrderSchema', () => {
  it('accepts a minimal valid input', () => {
    const parsed = createLoadingOrderSchema.parse({ serviceIds: ['a'] });
    expect(parsed.serviceIds).toEqual(['a']);
    expect(parsed.notes).toBeUndefined();
  });

  it('rejects an empty selection', () => {
    expect(() => createLoadingOrderSchema.parse({ serviceIds: [] })).toThrow();
  });

  it('rejects oversized groups', () => {
    const ids = Array.from({ length: MAX_LOADING_ORDER_SERVICES + 1 }, (_, i) => `s${i}`);
    expect(() => createLoadingOrderSchema.parse({ serviceIds: ids })).toThrow();
  });

  it('trims notes and rejects overlong ones', () => {
    expect(createLoadingOrderSchema.parse({ serviceIds: ['a'], notes: '  hi  ' }).notes).toBe(
      'hi'
    );
    expect(() =>
      createLoadingOrderSchema.parse({ serviceIds: ['a'], notes: 'x'.repeat(2001) })
    ).toThrow();
  });
});
