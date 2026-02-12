// dashboard-helpers.ts
/**
 * Dashboard Helper Functions
 * Utility functions for dashboard calculations and data processing
 */

import { format, startOfMonth, parseISO, subDays } from 'date-fns';
import { ServiceStatus } from '@/app/generated/prisma';

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
  let startDate: Date;
  let endDate: Date;

  if (dateRange.from && dateRange.to) {
    startDate = parseISO(dateRange.from);
    endDate = parseISO(dateRange.to);
  } else {
    endDate = new Date();
    switch (dateRange.preset) {
      case '7d':
        startDate = subDays(endDate, 7);
        break;
      case '30d':
        startDate = subDays(endDate, 30);
        break;
      case '90d':
        startDate = subDays(endDate, 90);
        break;
      case '1y':
        startDate = subDays(endDate, 365);
        break;
      default:
        startDate = subDays(endDate, 30);
    }
  }

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
    const monthKey = format(startOfMonth(date), 'MMM yyyy');
    monthlyData[monthKey] = {
      completed: 0,
      inProgress: 0,
      cancelled: 0,
      total: 0,
    };
  }

  // Aggregate services
  services.forEach((service) => {
    const monthKey = format(startOfMonth(service.date), 'MMM yyyy');
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
    const monthKey = format(startOfMonth(date), 'MMM yyyy');
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
      const monthKey = format(startOfMonth(service.date), 'MMM yyyy');
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
