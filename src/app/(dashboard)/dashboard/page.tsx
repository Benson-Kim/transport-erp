/**
 * Dashboard Page
 * Main dashboard with statistics, charts, and recent activity
 */

import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Metadata } from 'next';
// import { Info, Sparkles, RefreshCw, Plus, ArrowRight } from 'lucide-react';

import { auth } from '@/lib/auth';
import { getDashboardData } from '@/actions/dashboard-actions';
import {
  ErrorBoundary,
  Alert,
  Card,
  CardBody,
} from '@/components/ui';
import {
  DashboardDateRange,
  DashboardSkeleton,
  QuickActions,
  RecentServices,
  RevenueChart,
  ServicesChart,
  StatsCards,
  MiniStats,
  QuickActionsWidget,
  DashboardHeader,
  DashboardRefreshButton,
  DashboardErrorAlert,
  NewUserWelcome,
  PerformanceTip,
} from '@/components/features/dashboard';

export const metadata: Metadata = {
  title: 'Dashboard | Enterprise Dashboard',
  description: 'Overview of your business operations and key metrics',
};

interface DashboardPageProps {
  searchParams: Promise<{
    from?: string;
    to?: string;
    range?: string;
  }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;

  // Check authentication
  const session = await auth();
  if (!session?.user) redirect('/login');

  const dateRange = {
    ...(params.from !== undefined && { from: params.from }),
    ...(params.to !== undefined && { to: params.to }),
    preset: params.range || '30d',
  };

  // Fetch dashboard data with error handling
  let dashboardData;
  let dataError = null;

  try {
    dashboardData = await getDashboardData({
      userId: session.user.id,
      dateRange,
    });
  } catch (error) {
    dataError = error as Error;
    // Provide fallback data structure
    dashboardData = {
      stats: {
        activeServices: 0,
        activeServicesChange: 0,
        completedServices: 0,
        completedServicesChange: 0,
        totalRevenue: 0,
        totalRevenueChange: 0,
        averageMargin: 0,
        averageMarginAmount: 0,
        averageMarginChange: 0,
        totalServices: 0,
      },
      revenueChart: [],
      servicesChart: [],
      recentServices: [],
    };
  }

  // Check if user is new (no data)
  const isNewUser = dashboardData.stats.totalServices === 0 && !dataError;
  const userName = session.user.name?.split(' ')[0] || 'User';

  // Refresh action
  // async function refreshDashboard() {
  //   'use server';
  //   // Revalidate the dashboard data
  //   revalidatePath('/dashboard', 'page');
  // }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6 lg:p-8">
      {/* Page Header with Actions */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          {/* Create a client component wrapper for the title with icon */}
          <DashboardHeader
            userName={userName}
            isNewUser={isNewUser}
            description={
              isNewUser
                ? "Let's get started with your first service"
                : "Here's what's happening with your business today"
            }
          />

          {/* Mini Stats for quick overview */}
          {!isNewUser && !dataError && (
            <div className="mt-4 md:hidden">
              <MiniStats stats={dashboardData.stats} />
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Actions Widget - Desktop only */}
          <div className="hidden lg:block">
            <QuickActionsWidget userRole={session.user.role} />
          </div>

          {/* Date Range Selector */}
          <DashboardDateRange />

          {/* Refresh Button */}
          {!isNewUser && <DashboardRefreshButton />}
        </div>
      </div>

      {/* Error Alert */}
      {dataError && <DashboardErrorAlert errorMessage={dataError.message} />}

      {/* New User Welcome */}
      {isNewUser && !dataError && (
        <Card variant="elevated">
          <CardBody>
            <NewUserWelcome />
          </CardBody>
        </Card>
      )}

      {/* Main Dashboard Content */}
      {!isNewUser && (
        <>
          {/* Stats Cards */}
          <ErrorBoundary
            fallback={
              <Alert variant="error">Failed to load statistics. Please refresh the page.</Alert>
            }
          >
            <Suspense fallback={<DashboardSkeleton.Stats />}>
              <StatsCards stats={dashboardData.stats} loading={false} error={dataError} />
            </Suspense>
          </ErrorBoundary>

          {/* Charts Section */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ErrorBoundary
              fallback={
                <Card>
                  <CardBody>
                    <Alert variant="error">Failed to load services chart</Alert>
                  </CardBody>
                </Card>
              }
            >
              <Suspense fallback={<DashboardSkeleton.Chart />}>
                <ServicesChart
                  data={dashboardData.servicesChart}
                  loading={false}
                  error={dataError}
                />
              </Suspense>
            </ErrorBoundary>

            <ErrorBoundary
              fallback={
                <Card>
                  <CardBody>
                    <Alert variant="error">Failed to load revenue chart</Alert>
                  </CardBody>
                </Card>
              }
            >
              <Suspense fallback={<DashboardSkeleton.Chart />}>
                <RevenueChart
                  data={dashboardData.revenueChart}
                  loading={false}
                  error={dataError}
                  showImportOption={isNewUser}
                />
              </Suspense>
            </ErrorBoundary>
          </div>

          {/* Bottom Section */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ErrorBoundary
                fallback={
                  <Card>
                    <CardBody>
                      <Alert variant="error">Failed to load recent services</Alert>
                    </CardBody>
                  </Card>
                }
              >
                <Suspense fallback={<DashboardSkeleton.Table />}>
                  <RecentServices
                    services={dashboardData.recentServices}
                    loading={false}
                    error={dataError}
                    advanced={true}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>

            {/* Quick Actions (1 column) */}
            <div className="space-y-6">
              <ErrorBoundary
                fallback={
                  <Card>
                    <CardBody>
                      <Alert variant="error">Failed to load quick actions</Alert>
                    </CardBody>
                  </Card>
                }
              >
                <QuickActions userRole={session.user.role} loading={false} error={dataError} />
              </ErrorBoundary>

              {/* Performance Tips - Optional */}
              {dashboardData.stats.totalServices > 10 && (
                <PerformanceTip averageMargin={dashboardData.stats.averageMargin} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
