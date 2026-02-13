// dashboard-helpers.ts
/**
 * Dashboard Helper Functions
 * Utility functions for dashboard calculations and data processing
 */

import { startOfMonth, subDays } from 'date-fns';
import { ServiceStatus } from '@/app/generated/prisma';
import { formatDate, toDate } from './date-formats';

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
 * Aggregate services by month for chart
 */
export function aggregateServicesByMonth(
  services: Array<{
    date: Date;
    status: ServiceStatus;
    saleAmount?: any; // Add optional fields
    costAmount?: any;
    margin?: any;
  }>
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

  // Initialize last 6 months
  for (let i = 5; i >= 0; i--) {
    const date = subDays(new Date(), i * 30);
    const monthKey = formatDate.monthYear(startOfMonth(date));
    monthlyData[monthKey] = {
      completed: 0,
      inProgress: 0,
      cancelled: 0,
      total: 0,
    };
  }

  // Aggregate services
  services.forEach((service) => {
    const monthKey = formatDate.monthYear(startOfMonth(service.date));
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
    saleAmount: any;
    costAmount: any;
    margin: any;
  }>
) {
  const monthlyData: Record<
    string,
    {
      revenue: number;
      cost: number;
      margin: number;
    }
  > = {};

  // Initialize last 6 months
  for (let i = 5; i >= 0; i--) {
    const date = subDays(new Date(), i * 30);
    const monthKey = formatDate.monthYear(startOfMonth(date));
    monthlyData[monthKey] = {
      revenue: 0,
      cost: 0,
      margin: 0,
    };
  }

  // Aggregate revenue
  services.forEach((service) => {
    if (
      service.status === ServiceStatus.COMPLETED ||
      service.status === ServiceStatus.INVOICED ||
      service.status === ServiceStatus.ARCHIVED
    ) {
      const monthKey = formatDate.monthYear(startOfMonth(service.date));
      if (monthlyData[monthKey]) {
        monthlyData[monthKey].revenue += Number(service.saleAmount || 0);
        monthlyData[monthKey].cost += Number(service.costAmount || 0);
        monthlyData[monthKey].margin += Number(service.margin || 0);
      }
    }
  });

  return Object.entries(monthlyData).map(([month, data]) => ({
    month,
    ...data,
  }));
}
