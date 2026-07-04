/**
 * #33 - pure report math: Decimal end-to-end, decimalToNumber only at the
 * DTO boundary.
 */
import { describe, expect, it } from '@jest/globals';

import { Prisma } from '@/app/generated/prisma';
import { lastMonthsRange, summarizeFinancials, toMonthlyFinancialsDto } from '@/lib/reports/dto';

function decimal(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

const JAN = {
  month: new Date('2026-01-01T00:00:00Z'),
  services: 2,
  revenue: decimal('0.1'),
  cost: decimal('0'),
  margin: decimal('0.1'),
};

const FEB = {
  month: new Date('2026-02-01T00:00:00Z'),
  services: 1,
  revenue: decimal('0.2'),
  cost: decimal('0.05'),
  margin: decimal('0.15'),
};

describe('report DTO math (#33)', () => {
  it('sums in Decimal, not floats (0.1 + 0.2 stays exactly 0.3)', () => {
    const totals = summarizeFinancials([JAN, FEB]);

    // A float reduce would yield 0.30000000000000004 here.
    expect(totals.revenue).toBe(0.3);
    expect(totals.cost).toBe(0.05);
    expect(totals.margin).toBe(0.25);
    expect(totals.services).toBe(3);
  });

  it('derives the weighted margin percentage via pricing.ts semantics', () => {
    const totals = summarizeFinancials([JAN, FEB]);

    // (0.3 - 0.05) / 0.3 * 100 = 83.33 (round2, half-up)
    expect(totals.marginPercentage).toBe(83.33);
  });

  it('maps monthly rows to display DTOs with per-month margin %', () => {
    const [jan] = toMonthlyFinancialsDto([JAN]);

    expect(jan).toEqual({
      month: JAN.month,
      services: 2,
      revenue: 0.1,
      cost: 0,
      margin: 0.1,
      // cost 0 is a legitimate 100% margin, never 0 (#25 falsy-cost guard).
      marginPercentage: 100,
    });
  });

  it('summarizes an empty range to zeros', () => {
    expect(summarizeFinancials([])).toEqual({
      services: 0,
      revenue: 0,
      cost: 0,
      margin: 0,
      marginPercentage: 0,
    });
  });

  it('lastMonthsRange spans N month-aligned calendar months, end exclusive', () => {
    const now = new Date(2026, 6, 3); // 2026-07-03 local time
    const range = lastMonthsRange(12, now);

    expect(range.start.getDate()).toBe(1);
    expect(range.start.getFullYear()).toBe(2025);
    expect(range.start.getMonth()).toBe(7); // August 2025
    expect(range.end.getDate()).toBe(1);
    expect(range.end.getFullYear()).toBe(2026);
    expect(range.end.getMonth()).toBe(7); // August 2026 (exclusive)
  });
});
