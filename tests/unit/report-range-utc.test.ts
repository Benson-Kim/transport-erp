/**
 * #65 / ADR 0002: month bucketing is pinned to UTC.
 *
 * Boundary fixture 2019-01-31T23:30:00Z: in UTC this instant is 31 Jan; in
 * any east-of-UTC zone (e.g. Europe/Madrid, +1) the LOCAL date is already
 * 1 Feb - exactly the boundary the old server-local implementation
 * misbucketed. These assertions are expressed purely in UTC terms, so they
 * must hold under ANY process TZ.
 */

import { describe, expect, it } from '@jest/globals';

import { ServiceStatus } from '@/app/generated/prisma';
import { lastMonthsRange } from '@/lib/reports/dto';
import { aggregateServicesByMonth, utcMonthKey } from '@/lib/utils/dashboard-helpers';

const BOUNDARY = new Date('2019-01-31T23:30:00Z');

describe('lastMonthsRange (#65)', () => {
  it('builds a half-open UTC month window around the boundary instant', () => {
    const range = lastMonthsRange(6, BOUNDARY);

    expect(range.start.toISOString()).toBe('2018-08-01T00:00:00.000Z');
    expect(range.end.toISOString()).toBe('2019-02-01T00:00:00.000Z');
    // The boundary service itself is INSIDE the window: start <= d < end.
    expect(BOUNDARY.getTime()).toBeGreaterThanOrEqual(range.start.getTime());
    expect(BOUNDARY.getTime()).toBeLessThan(range.end.getTime());
  });

  it('normalizes year rollover (window crossing 1 January)', () => {
    const range = lastMonthsRange(3, new Date('2026-01-15T12:00:00Z'));
    expect(range.start.toISOString()).toBe('2025-11-01T00:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });
});

describe('utcMonthKey (#65)', () => {
  it('keys the boundary instant to its UTC month, not the local month', () => {
    expect(utcMonthKey(BOUNDARY)).toBe('Jan 2019');
    expect(utcMonthKey(new Date('2019-02-01T00:00:00Z'))).toBe('Feb 2019');
  });
});

describe('aggregateServicesByMonth (#65)', () => {
  it('buckets a month-boundary service into its UTC month', () => {
    const rows = aggregateServicesByMonth(
      [
        {
          date: BOUNDARY,
          status: ServiceStatus.COMPLETED,
        },
      ],
      // Injected "now" pins the 6-month init window to include Jan 2019.
      new Date('2019-02-15T12:00:00Z')
    );

    const january = rows.find((row) => row.month === 'Jan 2019');
    expect(january).toBeDefined();
    expect(january?.completed).toBe(1);
    expect(january?.total).toBe(1);

    const february = rows.find((row) => row.month === 'Feb 2019');
    expect(february?.total ?? 0).toBe(0);
  });
});
