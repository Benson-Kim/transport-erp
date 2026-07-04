/**
 * #64 - returnTo open-redirect guard: only same-origin app paths may be
 * navigated to after supplier creation; everything else falls back to the
 * default detail-page navigation.
 */
import { describe, expect, it } from '@jest/globals';

import { safeInternalPath } from '@/lib/utils/safe-internal-path';

describe('safeInternalPath', () => {
  it('accepts internal app paths', () => {
    expect(safeInternalPath('/services/new')).toBe('/services/new');
    expect(safeInternalPath('/suppliers?page=2')).toBe('/suppliers?page=2');
    expect(safeInternalPath('/')).toBe('/');
  });

  it('rejects empty and missing values', () => {
    expect(safeInternalPath('')).toBeNull();
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
  });

  it('rejects absolute URLs and schemes', () => {
    expect(safeInternalPath('https://evil.example/phish')).toBeNull();
    expect(safeInternalPath('javascript:alert(1)')).toBeNull();
    expect(safeInternalPath('mailto:x@evil.example')).toBeNull();
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeInternalPath('//evil.example/phish')).toBeNull();
  });

  it('rejects backslash normalisation trickery', () => {
    expect(safeInternalPath('/\\evil.example')).toBeNull();
    expect(safeInternalPath('\\/evil.example')).toBeNull();
  });

  it('rejects control characters', () => {
    expect(safeInternalPath('/services/new\u0000')).toBeNull();
    expect(safeInternalPath('/services\tnew')).toBeNull();
    expect(safeInternalPath('/services/new\u007f')).toBeNull();
  });
});
