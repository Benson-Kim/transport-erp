/**
 * #25 - canonical pricing module.
 *
 * Acceptance matrix: VAT 0/10/21, IRPF, cost = 0, negative margins,
 * 2dp half-up rounding, non-finite guards, and input-form invariance
 * (number/string/Decimal inputs produce identical results - the client
 * form/calculator and the server actions call the same functions, so
 * they agree by construction).
 */
import { describe, expect, it } from '@jest/globals';

import { Decimal } from '@/app/generated/prisma/runtime/library';
import {
  computeServicePricing,
  decimalToNumber,
  effectiveServiceAmounts,
  irpfAmount,
  margin,
  marginPercentage,
  markupPercentage,
  roi,
  round2,
  saleForTargetMarginPercentage,
  toDecimal,
  totalWithVat,
  vatAmount,
  ZERO,
} from '@/lib/pricing';

describe('rounding (2dp, half-up)', () => {
  it('rounds half-up at the .005 edge (exact decimal input)', () => {
    expect(round2('1.005').toFixed(2)).toBe('1.01');
    expect(round2('2.675').toFixed(2)).toBe('2.68');
  });

  it('rounds down below the edge', () => {
    expect(round2('1.004').toFixed(2)).toBe('1.00');
  });

  it('rejects non-finite input', () => {
    expect(() => toDecimal(Number.NaN)).toThrow(TypeError);
    expect(() => toDecimal(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe('VAT matrix (0 / 10 / 21) and IRPF', () => {
  it.each([
    [100, 21, '21.00'],
    [100, 10, '10.00'],
    [100, 0, '0.00'],
    [123.45, 21, '25.92'],
    [0, 21, '0.00'],
  ])('vatAmount(%p, %p) = %p', (net, rate, expected) => {
    expect(vatAmount(net, rate).toFixed(2)).toBe(expected);
  });

  it('totalWithVat adds the rounded VAT', () => {
    expect(totalWithVat(100, 21).toFixed(2)).toBe('121.00');
    expect(totalWithVat(123.45, 10).toFixed(2)).toBe('135.80');
  });

  it('IRPF retention (Spanish autónomo, 15%)', () => {
    expect(irpfAmount(1000, 15).toFixed(2)).toBe('150.00');
    expect(irpfAmount(1000, 0).toFixed(2)).toBe('0.00');
  });
});

describe('margin family', () => {
  it('margin and margin % for a normal service', () => {
    expect(margin(150, 100).toFixed(2)).toBe('50.00');
    expect(marginPercentage(150, 100).toFixed(2)).toBe('33.33');
  });

  it('cost = 0 is VALID: margin equals sale, margin % is 100', () => {
    expect(margin(150, 0).toFixed(2)).toBe('150.00');
    expect(marginPercentage(150, 0).toFixed(2)).toBe('100.00');
  });

  it('sale <= 0 yields margin % 0 (undefined ratio), never a crash', () => {
    expect(marginPercentage(0, 100).equals(ZERO)).toBe(true);
    expect(marginPercentage(0, 0).equals(ZERO)).toBe(true);
  });

  it('negative margins are preserved, not clamped', () => {
    expect(margin(100, 150).toFixed(2)).toBe('-50.00');
    expect(marginPercentage(100, 150).toFixed(2)).toBe('-50.00');
  });

  it('markup and ROI guard division by zero cost', () => {
    expect(markupPercentage(150, 100).toFixed(2)).toBe('50.00');
    expect(markupPercentage(150, 0).equals(ZERO)).toBe(true);
    expect(roi(150, 100).toFixed(2)).toBe('0.50');
    expect(roi(150, 0).equals(ZERO)).toBe(true);
  });
});

describe('computeServicePricing', () => {
  it('produces the full derived set with default 21% VAT', () => {
    const pricing = computeServicePricing({ costAmount: 100, saleAmount: 150 });
    expect(pricing.margin.toFixed(2)).toBe('50.00');
    expect(pricing.marginPercentage.toFixed(2)).toBe('33.33');
    expect(pricing.costVatAmount.toFixed(2)).toBe('21.00');
    expect(pricing.saleVatAmount.toFixed(2)).toBe('31.50');
    expect(pricing.costTotalWithVat.toFixed(2)).toBe('121.00');
    expect(pricing.saleTotalWithVat.toFixed(2)).toBe('181.50');
  });

  it('is invariant across input forms (number / string / Decimal)', () => {
    const asNumber = computeServicePricing({
      costAmount: 1234.56,
      saleAmount: 1500.99,
      costVatRate: 10,
      saleVatRate: 21,
    });
    const asString = computeServicePricing({
      costAmount: '1234.56',
      saleAmount: '1500.99',
      costVatRate: '10',
      saleVatRate: '21',
    });
    const asDecimal = computeServicePricing({
      costAmount: new Decimal('1234.56'),
      saleAmount: new Decimal('1500.99'),
      costVatRate: new Decimal(10),
      saleVatRate: new Decimal(21),
    });

    for (const key of Object.keys(asNumber) as Array<keyof typeof asNumber>) {
      expect(asString[key].equals(asNumber[key])).toBe(true);
      expect(asDecimal[key].equals(asNumber[key])).toBe(true);
    }
  });

  it('matches the seed-canonical rounding for representative values', () => {
    // prisma/seed.ts: Math.round(costAmount * 0.21 * 100) / 100
    for (const cost of [100, 250.5, 999.99, 1234.56, 0.01]) {
      const seedVat = Math.round(cost * 0.21 * 100) / 100;
      expect(decimalToNumber(vatAmount(cost, 21))).toBe(seedVat);
    }
  });
});

describe('saleForTargetMarginPercentage', () => {
  it('suggests the sale that yields the target margin', () => {
    expect(saleForTargetMarginPercentage(100, 20).toFixed(2)).toBe('125.00');
    expect(saleForTargetMarginPercentage(100, 30).toFixed(2)).toBe('142.86');
    expect(saleForTargetMarginPercentage(100, 40).toFixed(2)).toBe('166.67');
  });

  it('rejects targets outside [0, 100)', () => {
    expect(() => saleForTargetMarginPercentage(100, 100)).toThrow(RangeError);
    expect(() => saleForTargetMarginPercentage(100, -1)).toThrow(RangeError);
  });
});

describe('effectiveServiceAmounts (#28)', () => {
  const booked = {
    costAmount: new Decimal('100.00'),
    saleAmount: new Decimal('150.00'),
    margin: new Decimal('50.00'),
    marginPercentage: new Decimal('33.33'),
    costVatAmount: new Decimal('21.00'),
    saleVatAmount: new Decimal('31.50'),
  };

  it('presents €0 for cancelled services without touching the input', () => {
    const effective = effectiveServiceAmounts(true, booked);
    expect(effective.costAmount.equals(ZERO)).toBe(true);
    expect(effective.saleAmount.equals(ZERO)).toBe(true);
    expect(effective.margin.equals(ZERO)).toBe(true);
    // Booked figures remain intact - cancellation is reversible.
    expect(booked.costAmount.toFixed(2)).toBe('100.00');
    expect(booked.saleAmount.toFixed(2)).toBe('150.00');
  });

  it('is the identity for non-cancelled services', () => {
    expect(effectiveServiceAmounts(false, booked)).toBe(booked);
  });
});
