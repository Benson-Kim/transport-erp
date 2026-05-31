import { describe, it, expect } from 'vitest';
import { computeFinancials } from '../service-financials';

describe('computeFinancials', () => {
  it('calculates margin and VAT with default rates', () => {
    const result = computeFinancials({ costAmount: 100, saleAmount: 150 });

    expect(result.margin).toBe(50);
    expect(result.marginPercentage).toBe(33.33);
    expect(result.costVatRate).toBe(21);
    expect(result.saleVatRate).toBe(21);
    expect(result.costVatAmount).toBe(21);
    expect(result.saleVatAmount).toBe(31.5);
  });

  it('calculates margin percentage correctly', () => {
    const result = computeFinancials({ costAmount: 80, saleAmount: 100 });
    expect(result.marginPercentage).toBe(20);
  });

  it('handles zero sale amount without division by zero', () => {
    const result = computeFinancials({ costAmount: 100, saleAmount: 0 });
    expect(result.margin).toBe(-100);
    expect(result.marginPercentage).toBe(0); // guard against NaN/Infinity
  });

  it('handles zero cost and sale amounts', () => {
    const result = computeFinancials({ costAmount: 0, saleAmount: 0 });
    expect(result.margin).toBe(0);
    expect(result.marginPercentage).toBe(0);
    expect(result.costVatAmount).toBe(0);
    expect(result.saleVatAmount).toBe(0);
  });

  it('zeros all fields when cancelled', () => {
    const result = computeFinancials({
      costAmount: 500,
      saleAmount: 750,
      cancelled: true,
    });

    expect(result.costAmount).toBe(0);
    expect(result.saleAmount).toBe(0);
    expect(result.margin).toBe(0);
    expect(result.marginPercentage).toBe(0);
    expect(result.costVatAmount).toBe(0);
    expect(result.saleVatAmount).toBe(0);
    // VAT rates should be preserved even when cancelled
    expect(result.costVatRate).toBe(21);
    expect(result.saleVatRate).toBe(21);
  });

  it('uses custom VAT rates when provided', () => {
    const result = computeFinancials({
      costAmount: 100,
      saleAmount: 200,
      costVatRate: 10,
      saleVatRate: 4,
    });

    expect(result.costVatRate).toBe(10);
    expect(result.saleVatRate).toBe(4);
    expect(result.costVatAmount).toBe(10); // 100 * 10%
    expect(result.saleVatAmount).toBe(8);  // 200 * 4%
  });

  it('handles negative margin (loss-making service)', () => {
    const result = computeFinancials({ costAmount: 200, saleAmount: 150 });

    expect(result.margin).toBe(-50);
    expect(result.marginPercentage).toBe(-33.33);
  });

  it('rounds to 2 decimal places', () => {
    // 100/3 = 33.333... should round to 33.33
    const result = computeFinancials({ costAmount: 66.67, saleAmount: 100 });

    expect(result.margin).toBe(33.33);
    // Verify no floating-point artifacts
    expect(result.costVatAmount.toString()).not.toContain('000');
    expect(result.saleVatAmount.toString()).not.toContain('000');
  });
});
