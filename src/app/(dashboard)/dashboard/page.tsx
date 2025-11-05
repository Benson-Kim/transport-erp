/**
 * Dashboard Page
 * Main dashboard with statistics, charts, and recent activity
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { getDashboardData } from '@/actions/dashboard-actions';
import { format } from 'date-fns';

import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Alert } from '@/components/ui/Alert';
import { Skeleton } from '@/components/ui/Skeleton';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { formatCurrency } from '@/lib/utils/formatting';
import { TrendingUp, TrendingDown, Truck, CheckCircle2, Euro, Percent, Info } from 'lucide-react';
import { DashboardDateRange, DashboardSkeleton, QuickActions, RecentServices, RevenueChart, ServicesChart, StatsCards } from '@/components/features/dashboard';
import { ErrorBoundary, PageHeader } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Dashboard | Enterprise Dashboard',
  description: 'Overview of your business operations and key metrics',
};

interface DashboardPageProps {
  searchParams: {
    from?: string;
    to?: string;
    range?: string;
  };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  // Check authentication
  const session = await auth();
  if (!session?.user) redirect('/login');

  const dateRange = {
    from: searchParams.from || undefined,
    to: searchParams.to || undefined,
    preset: searchParams.range || '30d',
  };

  // Fetch dashboard data
  const dashboardData = await getDashboardData({
    userId: session.user.id,
    dateRange,
  });

  // Check if user is new (no data)
  const isNewUser = dashboardData.stats.totalServices === 0;

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PageHeader
          title={`Welcome back, ${session.user.name?.split(' ')[0] || 'User'}`}
          description="Here's what's happening with your business today"
        />
        <DashboardDateRange />
      </div>

      {/* New User Welcome */}
      {isNewUser && (
        <Alert>
          <Info className="h-4 w-4" />
            Welcome to Enterprise Dashboard! Start by creating your first service or importing existing data.
        </Alert>
      )}

      {/* Stats Cards */}
      <ErrorBoundary fallback="Failed to load statistics">
        <Suspense fallback={<DashboardSkeleton.Stats />}>
          <StatsCards stats={dashboardData.stats} />
        </Suspense>
      </ErrorBoundary>

      {/* Charts Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ErrorBoundary fallback="Failed to load services chart">
          <Suspense fallback={<DashboardSkeleton.Chart />}>
            <ServicesChart data={dashboardData.servicesChart} />
          </Suspense>
        </ErrorBoundary>

        <ErrorBoundary fallback="Failed to load revenue chart">
          <Suspense fallback={<DashboardSkeleton.Chart />}>
            <RevenueChart data={dashboardData.revenueChart} />
          </Suspense>
        </ErrorBoundary>
      </div>

      {/* Bottom Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Services (2 columns) */}
        <div className="lg:col-span-2">
          <ErrorBoundary fallback="Failed to load recent services">
            <Suspense fallback={<DashboardSkeleton.Table />}>
              <RecentServices 
                services={dashboardData.recentServices}
                isLoading={false}
              />
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Quick Actions (1 column) */}
        <div>
          <ErrorBoundary fallback="Failed to load quick actions">
            <QuickActions userRole={session.user.role} />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}