// dashboard-helpers.ts
/**
 * Dashboard Helper Functions
 * Utility functions for dashboard calculations and data processing
 */

import { subDays } from 'date-fns';

import { ServiceStatus } from '@/app/generated/prisma';
import type { Decimal } from '@/app/generated/prisma/runtime/library';
import { decimalToNumber, toDecimal, ZERO, type MoneyInput } from '@/lib/pricing';
import { isRecognizedRevenueStatus } from '@/lib/revenue';

import { toDate } from './date-formats';

/**
 * Calculate percentage change between two values
 */
export function calculatePercentageChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) {
    return newValue > 0 ? 100 : 0;
  }
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Calculate date range from preset or custom dates
 */
export function calculateDateRange(dateRange: { from?: string; to?: string; preset?: string }) {
  if (toDate(dateRange.from) && toDate(dateRange.to)) {
    return {
      startDate: toDate(dateRange.from),
      endDate: toDate(dateRange.to),
    };
  }

  const endDate = new Date();

  const presets: Record<string, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '1y': 365,
  };

  const days = presets[dateRange.preset ?? ''] ?? 30;

  const startDate = subDays(endDate, days);

  return { startDate, endDate };
}

/**
 * Month bucket key pinned to UTC (#65 / ADR 0002): the previous
 * formatDate.monthYear(startOfMonth(date)) keyed months in SERVER-LOCAL
 * time against UTC-stored dates, so a service at 2019-01-31T23:30:00Z
 * bucketed into February on an east-of-UTC deployment. Exported for the
 * boundary tests.
 */
export function utcMonthKey(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** First instant of the UTC month `monthsBack` months before `now`. */
function utcMonthStart(now: Date, monthsBack: number): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));
}

/**
 * Aggregate services by month for chart
 */
export function aggregateServicesByMonth(
  services: Array<{
    date: Date;
    status: ServiceStatus;
    saleAmount?: MoneyInput | null;
    costAmount?: MoneyInput | null;
    margin?: MoneyInput | null;
  }>,
  /** Injectable for month-boundary tests (#65). */
  now: Date = new Date()
) {
  const monthlyData: Record<
    string,
    {
      completed: number;
      inProgress: number;
      cancelled: number;
      total: number;
    }
  > = {};

  // Initialize the last 6 UTC calendar months (#65): real month arithmetic,
  // not the old subDays(i * 30) approximation which drifted across 31-day
  // months and DST transitions.
  for (let i = 5; i >= 0; i--) {
    const monthKey = utcMonthKey(utcMonthStart(now, i));
    monthlyData[monthKey] = {
      completed: 0,
      inProgress: 0,
      cancelled: 0,
      total: 0,
    };
  }

  // Aggregate services
  services.forEach((service) => {
    const monthKey = utcMonthKey(service.date);
    if (monthlyData[monthKey]) {
      monthlyData[monthKey].total++;

      switch (service.status) {
        case ServiceStatus.COMPLETED:
        case ServiceStatus.INVOICED:
          monthlyData[monthKey].completed++;
          break;
        case ServiceStatus.IN_PROGRESS:
        case ServiceStatus.CONFIRMED:
          monthlyData[monthKey].inProgress++;
          break;
        case ServiceStatus.CANCELLED:
          monthlyData[monthKey].cancelled++;
          break;
      }
    }
  });

  return Object.entries(monthlyData).map(([month, data]) => ({
    month,
    ...data,
  }));
}

/**
 * Aggregate revenue by month for chart
 */
export function aggregateRevenueByMonth(
  services: Array<{
    date: Date;
    status: ServiceStatus;
    saleAmount: MoneyInput | null;
    costAmount: MoneyInput | null;
    margin: MoneyInput | null;
  }>,
  /** Injectable for month-boundary tests (#65). */
  now: Date = new Date()
) {
  // Accumulate in Decimal (#25): Prisma Decimal amounts summed as floats
  // lose precision. Convert once at the chart boundary.
  const monthlyData: Record<
    string,
    {
      revenue: Decimal;
      cost: Decimal;
      margin: Decimal;
    }
  > = {};

  // Initialize the last 6 UTC calendar months (#65).
  for (let i = 5; i >= 0; i--) {
    const monthKey = utcMonthKey(utcMonthStart(now, i));
    monthlyData[monthKey] = {
      revenue: ZERO,
      cost: ZERO,
      margin: ZERO,
    };
  }

  // Aggregate revenue (recognized statuses only - the #33 single definition)
  services.forEach((service) => {
    if (isRecognizedRevenueStatus(service.status)) {
      const monthKey = utcMonthKey(service.date);
      const bucket = monthlyData[monthKey];
      if (bucket) {
        bucket.revenue = bucket.revenue.plus(toDecimal(service.saleAmount ?? 0));
        bucket.cost = bucket.cost.plus(toDecimal(service.costAmount ?? 0));
        bucket.margin = bucket.margin.plus(toDecimal(service.margin ?? 0));
      }
    }
  });

  return Object.entries(monthlyData).map(([month, data]) => ({
    month,
    revenue: decimalToNumber(data.revenue),
    cost: decimalToNumber(data.cost),
    margin: decimalToNumber(data.margin),
  }));
}
