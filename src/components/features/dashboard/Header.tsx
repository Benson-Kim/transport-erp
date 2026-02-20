// components/features/dashboard/DashboardClientComponents.tsx
'use client';

import { useRouter } from 'next/navigation';

import { Sparkles, RefreshCw, Info, Plus, ArrowRight } from 'lucide-react';

import { PageHeader, Alert, Button, Card, CardBody, EmptyState } from '@/components/ui';
import { formatPercentage } from '@/lib/utils/formatting';
import { refreshDashboardData } from '@/actions/dashboard-actions';

interface DashboardHeaderProps {
  userName: string;
  isNewUser: boolean;
  description: string;
}

export function DashboardHeader({ userName, isNewUser, description }: DashboardHeaderProps) {
  return (
    <PageHeader
      title={
        <div className="flex items-center gap-2">
          <span>Welcome back, {userName}</span>
          {!isNewUser && <Sparkles className="h-5 w-5 text-yellow-500" />}
        </div>
      }
      description={description}
    />
  );
}

export function DashboardRefreshButton() {

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => refreshDashboardData()}
      icon={<RefreshCw className="h-4 w-4" />}
    >
      <span className="hidden sm:inline">Refresh</span>
    </Button>
  );
}

interface DashboardErrorAlertProps {
  errorMessage: string;
}

export function DashboardErrorAlert({ errorMessage }: DashboardErrorAlertProps) {
  return (
    <Alert
      variant="error"
      icon={<Info className="h-4 w-4" />}
      title="Failed to load dashboard data"
    >
      {errorMessage}. Please try refreshing the page or contact support if the problem persists.
    </Alert>
  );
}

export function NewUserWelcome() {
  const router = useRouter();

  return (
    <EmptyState
      icon={<Sparkles size={48} />}
      title="Welcome to Enterprise Dashboard!"
      description="Your dashboard is ready. Start by creating your first service or importing existing data to see insights and analytics."
      action={{
        label: 'Create First Service',
        onClick: () => router.push('/services/new'),
        icon: <Plus size={16} />,
      }}
      secondaryAction={{
        label: 'Import Data',
        onClick: () => router.push('/import'),
      }}
    />
  );
}

interface PerformanceTipProps {
  averageMargin: number;
}

export function PerformanceTip({ averageMargin }: PerformanceTipProps) {
  const router = useRouter();

  return (
    <Card variant="bordered">
      <CardBody className="p-4">
        <div className="flex items-start gap-3">
          <Info className="h-4 w-4 text-blue-600 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Performance Tip</p>
            <p className="text-xs text-muted-foreground">
              Your average margin is {formatPercentage(averageMargin)}. Consider reviewing services
              with margins below this threshold.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-xs"
              icon={<ArrowRight className="h-3 w-3 ml-1" />}
              onClick={() => router.push('/reports/margins')}
            >
              View Margin Report
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
