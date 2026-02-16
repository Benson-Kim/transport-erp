/**
 * Dashboard Server Actions
 * Server-side data fetching for dashboard
 */

'use server';

import { unstable_cache } from 'next/cache';
import { Prisma, ServiceStatus } from '@/app/generated/prisma';
import { startOfMonth, endOfMonth, subMonths, subDays } from 'date-fns';
import {
  calculatePercentageChange,
  calculateDateRange,
  aggregateServicesByMonth,
  aggregateRevenueByMonth,
} from '@/lib/utils/dashboard-helpers';
import prisma from '@/lib/prisma/prisma';
import { DashboardData, DashboardDateRange } from '@/types/dashboard';

type ServiceGroupResult = {
  status: ServiceStatus;
  _count: { _all: number };
};

type RecentServices = Prisma.ServiceGetPayload<{
  include: {
    client: {
      select: { name: true };
    };
  };
}>;

/**
 * Get dashboard data with caching
 */
export const getDashboardData = unstable_cache(
  async ({
    // userId,
    dateRange,
  }: {
    userId: string;
    dateRange: DashboardDateRange;
  }): Promise<DashboardData> => {
    // Calculate date range
    const { startDate, endDate } = calculateDateRange(dateRange);
    if (!startDate || !endDate) {
      throw new Error('Invalid dashboard date range');
    }

    const previousPeriod = {
      startDate: subDays(
        startDate,
        Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
      ),
      endDate: startDate,
    };

    // Fetch current period stats
    const [
      currentServices,
      previousServices,
      currentRevenue,
      previousRevenue,
      recentServices,
      monthlyData,
    ] = await Promise.all([
      // Current period services
      prisma.service.groupBy({
        by: ['status'],
        where: {
          date: {
            gte: startDate,
            lte: endDate,
          },
          deletedAt: null,
        },
        _count: true,
      }) as unknown as Promise<ServiceGroupResult[]>,

      // Previous period services
      prisma.service.groupBy({
        by: ['status'],
        where: {
          date: {
            gte: previousPeriod.startDate,
            lte: previousPeriod.endDate,
          },
          deletedAt: null,
        },
        _count: true,
      }) as unknown as Promise<ServiceGroupResult[]>,

      // Current period revenue
      prisma.service.aggregate({
        where: {
          date: {
            gte: startDate,
            lte: endDate,
          },
          status: ServiceStatus.COMPLETED,
          deletedAt: null,
        },
        _sum: {
          saleAmount: true,
          costAmount: true,
          margin: true,
        },
        _avg: {
          marginPercentage: true,
          margin: true,
        },
      }),

      // Previous period revenue
      prisma.service.aggregate({
        where: {
          date: {
            gte: previousPeriod.startDate,
            lte: previousPeriod.endDate,
          },
          status: ServiceStatus.COMPLETED,
          deletedAt: null,
        },
        _sum: {
          saleAmount: true,
          costAmount: true,
          margin: true,
        },
        _avg: {
          marginPercentage: true,
        },
      }),

      // Recent services
      prisma.service.findMany({
        where: {
          deletedAt: null,
        },
        include: {
          client: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          date: 'desc',
        },
        take: 10,
      }) as Promise<RecentServices[]>,

      // Monthly data for charts (last 6 months)
      prisma.service.findMany({
        where: {
          date: {
            gte: startOfMonth(subMonths(new Date(), 5)),
            lte: endOfMonth(new Date()),
          },
          deletedAt: null,
        },
        select: {
          date: true,
          status: true,
          saleAmount: true,
          costAmount: true,
          margin: true,
        },
      }),
    ]);

    // Calculate stats
    const currentActive =
      currentServices.find((s) => s.status === ServiceStatus.IN_PROGRESS)?._count._all || 0;
    const currentCompleted =
      currentServices.find((s) => s.status === ServiceStatus.COMPLETED)?._count._all || 0;
    const previousActive =
      previousServices.find((s) => s.status === ServiceStatus.IN_PROGRESS)?._count._all || 0;
    const previousCompleted =
      previousServices.find((s) => s.status === ServiceStatus.COMPLETED)?._count._all || 0;

    const stats = {
      activeServices: currentActive,
      activeServicesChange: calculatePercentageChange(previousActive, currentActive),
      completedServices: currentCompleted,
      completedServicesChange: calculatePercentageChange(previousCompleted, currentCompleted),
      totalRevenue: Number(currentRevenue._sum.saleAmount || 0),
      totalRevenueChange: calculatePercentageChange(
        Number(previousRevenue._sum.saleAmount || 0),
        Number(currentRevenue._sum.saleAmount || 0)
      ),
      averageMargin: Number(currentRevenue._avg.marginPercentage || 0),
      averageMarginAmount: Number(currentRevenue._avg.margin || 0),
      averageMarginChange: calculatePercentageChange(
        Number(previousRevenue._avg.marginPercentage || 0),
        Number(currentRevenue._avg.marginPercentage || 0)
      ),
      totalServices: currentServices.reduce((sum, s) => sum + s._count._all, 0),
    };

    // Aggregate monthly data for charts
    const servicesChart = aggregateServicesByMonth(monthlyData);
    const revenueChart = aggregateRevenueByMonth(monthlyData);

    // Format recent services
    const formattedRecentServices = recentServices.map((service) => ({
      id: service.id,
      serviceNumber: service.serviceNumber,
      date: service.date.toISOString(),
      clientName: service.client?.name || service.clientId,
      origin: service.origin,
      destination: service.destination,
      status: service.status,
      amount: Number(service.saleAmount),
      currency: service.saleCurrency,
    }));

    return {
      stats,
      servicesChart,
      revenueChart,
      recentServices: formattedRecentServices,
    };
  },
  ['dashboard-data'],
  {
    revalidate: 300, // Cache for 5 minutes
    tags: ['dashboard'],
  }
);

/**
 * Refresh dashboard data
 */
export async function refreshDashboardData() {
  'use server';

  // Revalidate the dashboard cache
  const { revalidateTag } = await import('next/cache');
  revalidateTag('dashboard', 'default');

  return { success: true };
}