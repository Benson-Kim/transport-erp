/**
 * #26 - formatCurrency renders 2 decimals; percent formatting is split into
 * typed helpers so fraction/points misuse is impossible at the call site.
 * SSR/client consistency: no module-load navigator.language - the same
 * default locale yields the same output on both sides.
 */
import { describe, expect, it } from '@jest/globals';

import {
  formatCurrency,
  formatPercent,
  formatPercentPoints,
} from '@/lib/utils/formatting';

// Intl uses non-breaking spaces in some locales; normalise for assertions.
const normalize = (value: string) => value.replaceAll('\u00A0', ' ').replaceAll('\u202F', ' ');

describe('formatCurrency (#26)', () => {
  it('renders exactly 2 decimals', () => {
    expect(formatCurrency(1234.56)).toBe('€1,234.56');
    expect(formatCurrency(1234.5)).toBe('€1,234.50');
    expect(formatCurrency(1235)).toBe('€1,235.00');
  });

  it('is currency-aware per call', () => {
    expect(formatCurrency(99.9, 'USD')).toBe('$99.90');
    expect(formatCurrency(99.9, 'GBP')).toBe('£99.90');
  });

  it('is locale-aware per call (no module-load locale)', () => {
    expect(normalize(formatCurrency(1234.56, 'EUR', 'de-DE'))).toBe('1.234,56 €');
  });

  it('is deterministic: two calls with the same inputs agree (SSR = client)', () => {
    expect(formatCurrency(1234.56)).toBe(formatCurrency(1234.56));
  });
});

describe('typed percent helpers (#26)', () => {
  it('formatPercent takes fractions: completion rate 0.6 -> "60%"', () => {
    expect(formatPercent(0.6)).toBe('60%');
    expect(formatPercent(1)).toBe('100%');
    expect(formatPercent(0.185)).toBe('18.5%');
  });

  it('formatPercentPoints takes points: VAT 21 -> "21%", margin 18.5 -> "18.5%"', () => {
    expect(formatPercentPoints(21)).toBe('21%');
    expect(formatPercentPoints(18.5)).toBe('18.5%');
    expect(formatPercentPoints(0)).toBe('0%');
    expect(formatPercentPoints(-12.5)).toBe('-12.5%');
  });
});
