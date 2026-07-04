/**
 * Dashboard Server Actions
 * Server-side data fetching for dashboard
 */

'use server';

import { revalidatePath } from 'next/cache';

import { startOfMonth, endOfMonth, subMonths, subDays } from 'date-fns';

import type { Prisma } from '@/app/generated/prisma';
import { ServiceStatus } from '@/app/generated/prisma';
import prisma from '@/lib/prisma/prisma';
import { RECOGNIZED_REVENUE_STATUSES } from '@/lib/revenue';
import {
  calculatePercentageChange,
  calculateDateRange,
  aggregateServicesByMonth,
  aggregateRevenueByMonth,
} from '@/lib/utils/dashboard-helpers';
import type { DashboardData, DashboardDateRange } from '@/types/dashboard';

type ServiceGroupResult = {
  status: ServiceStatus;
  _count: { _all: number };
};

/**
 * Explicit aggregate payload: the $extends(withAccelerate()) client
 * collapses aggregate()'s inferred payload the same way it collapses
 * groupBy's (see ServiceGroupResult above and !20) - the casts at the call
 * sites state what Postgres actually returns for the requested _sum/_avg
 * selections. The previous-period aggregate does not request _avg.margin;
 * that field is never read from it.
 */
type ServiceRevenueAggregate = {
  _sum: {
    saleAmount: Prisma.Decimal | null;
    costAmount: Prisma.Decimal | null;
    margin: Prisma.Decimal | null;
  };
  _avg: {
    marginPercentage: Prisma.Decimal | null;
    margin: Prisma.Decimal | null;
  };
};

type RecentServices = Prisma.ServiceGetPayload<{
  include: {
    client: {
      select: { name: true };
    };
  };
}>;

/**
 * Get dashboard data (#37/#66).
 *
 * Renders dynamically - NO unstable_cache. The previous wrapper cached
 * under a static ['dashboard-data'] key with revalidate: 300 while no
 * mutation ever revalidated the tag, so money figures lagged edits by up
 * to 5 minutes. The aggregation below is six indexed SQL aggregates (!29);
 * at brokerage volume dynamic rendering is cheap and money is always
 * current. userId stays in the signature for call-site stability; the
 * dashboard is deliberately org-wide (services are not view-scoped).
 */
export async function getDashboardData({
  dateRange,
}: {
  userId: string;
  dateRange: DashboardDateRange;
}): Promise<DashboardData> {
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
      // Current period services. _count must be requested as an object:
      // `_count: true` returns a plain number at runtime, so the
      // `_count._all` reads below silently produced undefined (stats stuck
      // at 0, totalServices NaN).
      prisma.service.groupBy({
        by: ['status'],
        where: {
          date: {
            gte: startDate,
            lte: endDate,
          },
          deletedAt: null,
        },
        _count: { _all: true },
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
        _count: { _all: true },
      }) as unknown as Promise<ServiceGroupResult[]>,

      // Current period revenue (RECOGNIZED_REVENUE_STATUSES - #33)
      prisma.service.aggregate({
        where: {
          date: {
            gte: startDate,
            lte: endDate,
          },
          status: { in: [...RECOGNIZED_REVENUE_STATUSES] },
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
      }) as unknown as Promise<ServiceRevenueAggregate>,

      // Previous period revenue (RECOGNIZED_REVENUE_STATUSES - #33)
      prisma.service.aggregate({
        where: {
          date: {
            gte: previousPeriod.startDate,
            lte: previousPeriod.endDate,
          },
          status: { in: [...RECOGNIZED_REVENUE_STATUSES] },
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
      }) as unknown as Promise<ServiceRevenueAggregate>,

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
      currentServices.find((s) => s.status === ServiceStatus.IN_PROGRESS)?._count._all ?? 0;
    const currentCompleted =
      currentServices.find((s) => s.status === ServiceStatus.COMPLETED)?._count._all ?? 0;
    const previousActive =
      previousServices.find((s) => s.status === ServiceStatus.IN_PROGRESS)?._count._all ?? 0;
    const previousCompleted =
      previousServices.find((s) => s.status === ServiceStatus.COMPLETED)?._count._all ?? 0;

    const stats = {
      activeServices: currentActive,
      activeServicesChange: calculatePercentageChange(previousActive, currentActive),
      completedServices: currentCompleted,
      completedServicesChange: calculatePercentageChange(previousCompleted, currentCompleted),
      totalRevenue: Number(currentRevenue._sum.saleAmount ?? 0),
      totalRevenueChange: calculatePercentageChange(
        Number(previousRevenue._sum.saleAmount ?? 0),
        Number(currentRevenue._sum.saleAmount ?? 0)
      ),
      averageMargin: Number(currentRevenue._avg.marginPercentage ?? 0),
      averageMarginAmount: Number(currentRevenue._avg.margin ?? 0),
      averageMarginChange: calculatePercentageChange(
        Number(previousRevenue._avg.marginPercentage ?? 0),
        Number(currentRevenue._avg.marginPercentage ?? 0)
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
      clientName: service.client?.name ?? service.clientId,
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
}

/**
 * Refresh dashboard data (#37/#66): data is request-fresh (dynamic
 * rendering); revalidating the route drops any client-cached RSC payload
 * so the refresh button is honest.
 */
export async function refreshDashboardData() {
  revalidatePath('/dashboard');

  return { success: true };
}
