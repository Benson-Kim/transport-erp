/**
 * Services Chart Component
 * Bar chart showing services per month
 */

'use client';

import { useMemo, useState } from 'react';

import {
  Download,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  BarChart3,
  Info,
  RefreshCw,
  Activity,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';

import {
  Card,
  CardBody,
  CardHeader,
  Button,
  Tooltip,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/formatting';

interface ChartData {
  month: string;
  completed: number;
  inProgress: number;
  cancelled: number;
  total: number;
}

interface ServicesChartProps {
  data?: ChartData[];
  loading?: boolean;
  error?: Error | null;
  onRefresh?: () => void;
  onViewDetails?: (month: string) => void;
}

export function ServicesChart({
  data = [],
  loading = false,
  error = null,
  onRefresh,
  onViewDetails,
}: ServicesChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [isExporting, setIsExporting] = useState(false);
  const [_hoveredBar, setHoveredBar] = useState<string | null>(null);

  const colors = useMemo(
    () => ({
      completed: isDark ? '#10b981' : '#059669',
      inProgress: isDark ? '#3b82f6' : '#2563eb',
      cancelled: isDark ? '#ef4444' : '#dc2626',
      grid: isDark ? '#374151' : '#e5e7eb',
      text: isDark ? '#9ca3af' : '#6b7280',
    }),
    [isDark]
  );

  const stats = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        total: 0,
        completed: 0,
        inProgress: 0,
        cancelled: 0,
        average: 0,
        completionRate: 0,
        cancellationRate: 0,
        trend: 0,
        bestMonth: null as string | null,
        worstMonth: null as string | null,
      };
    }

    const total = data.reduce((sum, item) => sum + item.total, 0);
    const completed = data.reduce((sum, item) => sum + item.completed, 0);
    const inProgress = data.reduce((sum, item) => sum + item.inProgress, 0);
    const cancelled = data.reduce((sum, item) => sum + item.cancelled, 0);
    const average = total / data.length;
    const completionRate = total > 0 ? (completed / total) * 100 : 0;
    const cancellationRate = total > 0 ? (cancelled / total) * 100 : 0;

    // Calculate trend
    let trend = 0;
    if (data.length >= 2) {
      const lastMonth = data[data.length - 1];
      const previousMonth = data[data.length - 2];
      if (lastMonth && previousMonth && previousMonth.total > 0) {
        trend = ((lastMonth.total - previousMonth.total) / previousMonth.total) * 100;
      }
    }

    // Find best and worst months
    let bestMonth: ChartData | null = data[0] || null;
    let worstMonth: ChartData | null = data[0] || null;

    if (bestMonth && worstMonth) {
      data.forEach((month) => {
        if (bestMonth && month.total > bestMonth.total) {
          bestMonth = month;
        }
        if (worstMonth && month.total < worstMonth.total) {
          worstMonth = month;
        }
      });
    }

    return {
      total,
      completed,
      inProgress,
      cancelled,
      average,
      completionRate,
      cancellationRate,
      trend,
      bestMonth: bestMonth?.month || null,
      worstMonth: worstMonth?.month || null,
    };
  }, [data]);

  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload?.length) {
      const {total} = payload[0].payload;
      const completionRate =
        total > 0 ? ((payload[0].payload.completed / total) * 100).toFixed(1) : '0';

      return (
        <div className="rounded-lg border border-neutral-200 bg-background p-3 shadow-md">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-sm">{label}</p>
            {onViewDetails && (
              <button
                onClick={() => onViewDetails(label)}
                className="text-xs text-primary hover:underline"
              >
                View Details →
              </button>
            )}
          </div>
          <div className="space-y-1">
            {payload.map((entry: any) => (
              <div key={entry.name} className="flex items-center justify-between gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.fill }} />
                  <span className="text-muted-foreground">{entry.name}</span>
                </div>
                <span className="font-medium tabular-nums">{formatNumber(entry.value)}</span>
              </div>
            ))}
            <div className="mt-2 pt-2 border-t space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-medium tabular-nums">{formatNumber(total)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Completion</span>
                <span className="font-medium tabular-nums text-green-600 dark:text-green-400">
                  {completionRate}%
                </span>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const handleExport = async () => {
    if (!data || data.length === 0) {
      console.warn('No data to export');
      return;
    }

    setIsExporting(true);

    try {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const csv = [
        ['Month', 'Completed', 'In Progress', 'Cancelled', 'Total', 'Completion Rate'],
        ...data.map((row) => [
          row.month,
          row.completed,
          row.inProgress,
          row.cancelled,
          row.total,
          row.total > 0 ? `${((row.completed / row.total) * 100).toFixed(2)}%` : '0%',
        ]),
        [],
        ['Summary'],
        ['Total Services', stats.total],
        ['Average per Month', stats.average.toFixed(1)],
        ['Completion Rate', `${stats.completionRate.toFixed(2)}%`],
        ['Cancellation Rate', `${stats.cancellationRate.toFixed(2)}%`],
      ]
        .map((row) => row.join(','))
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `services-report-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const headerAction =
    data.length > 0 ? (
      <div className="flex items-center gap-4">
        {/* Service Stats */}
        <div className="flex items-center gap-3">
          {/* Total Services */}
          <Tooltip
            content={
              <div className="space-y-1">
                <div className="font-semibold">Total Services</div>
                <div className="text-xs opacity-90">Completed: {formatNumber(stats.completed)}</div>
                <div className="text-xs opacity-90">
                  In Progress: {formatNumber(stats.inProgress)}
                </div>
                <div className="text-xs opacity-90">Cancelled: {formatNumber(stats.cancelled)}</div>
              </div>
            }
            position="bottom"
          >
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-lg cursor-help">
              <Activity className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                {formatNumber(stats.total)} total
              </span>
            </div>
          </Tooltip>

          {/* Trend Indicator */}
          <Tooltip
            content={
              <div className="space-y-1">
                <div className="font-semibold">{stats.trend >= 0 ? 'Growth' : 'Decline'} Trend</div>
                <div className="text-xs opacity-90">Month-over-month change</div>
                {data.length >= 2 && (
                  <div className="text-xs opacity-90">
                    {data[data.length - 2]?.month}: {data[data.length - 2]?.total || 0} →{' '}
                    {data[data.length - 1]?.month}: {data[data.length - 1]?.total || 0}
                  </div>
                )}
              </div>
            }
            position="bottom"
          >
            <div
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-help',
                stats.trend >= 0
                  ? 'bg-green-50 dark:bg-green-900/20'
                  : 'bg-red-50 dark:bg-red-900/20'
              )}
            >
              {stats.trend >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              )}
              <span
                className={cn(
                  'text-sm font-semibold',
                  stats.trend >= 0
                    ? 'text-green-900 dark:text-green-200'
                    : 'text-red-900 dark:text-red-200'
                )}
              >
                {Math.abs(stats.trend).toFixed(1)}%
              </span>
            </div>
          </Tooltip>
        </div>

        <div className="h-8 w-px bg-neutral-200 dark:bg-neutral-700" />

        {/* Completion Rate */}
        <Tooltip
          content={
            <div className="space-y-1">
              <div className="font-semibold">Completion Rate</div>
              <div className="text-xs opacity-90">
                {formatNumber(stats.completed)} of {formatNumber(stats.total)} services
              </div>
              {stats.bestMonth && (
                <div className="text-xs opacity-90">Best month: {stats.bestMonth}</div>
              )}
            </div>
          }
          position="bottom"
        >
          <div className="flex items-center gap-1.5 text-sm cursor-help">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="font-semibold text-green-900 dark:text-green-200">
              {stats.completionRate.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">completed</span>
          </div>
        </Tooltip>

        {/* Export Button */}
        <Tooltip content="Download complete services report" position="bottom">
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExport}
            icon={<Download className="h-4 w-4" />}
            iconPosition="left"
            loading={isExporting}
            loadingText="Exporting..."
          >
            Export
          </Button>
        </Tooltip>
      </div>
    ) : null;

  // Handle error state
  if (!loading && error) {
    // Build error state props conditionally
    const errorStateProps: Parameters<typeof ErrorState>[0] = {
      error,
      title: 'Failed to load services data',
      description:
        "We couldn't fetch your services data. Please check your connection and try again.",
      variant: 'full' as const,
    };

    // Only add onRetry if onRefresh exists
    if (onRefresh) {
      errorStateProps.onRetry = onRefresh;
    }

    return (
      <Card variant="elevated" padding="none">
        <CardHeader title="Services Overview" subtitle="Monthly service distribution" />
        <CardBody>
          <ErrorState {...errorStateProps} />
        </CardBody>
      </Card>
    );
  }

  // Handle empty state
  if (!loading && !error && (!data || data.length === 0)) {
    return (
      <Card variant="elevated" padding="none">
        <CardHeader
          title="Services Overview"
          subtitle="Monthly service distribution"
          action={
            onRefresh && (
              <Button
                size="sm"
                variant="secondary"
                onClick={onRefresh}
                icon={<RefreshCw className="h-4 w-4" />}
                iconPosition="left"
              >
                Refresh
              </Button>
            )
          }
        />
        <CardBody>
          <EmptyState
            icon={<BarChart3 size={48} />}
            title="No services data available"
            description="Once you start tracking services, you'll see the distribution and trends here."
            action={
              onRefresh
                ? {
                    label: 'Refresh Data',
                    onClick: onRefresh,
                    icon: <RefreshCw size={16} />,
                  }
                : undefined
            }
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <Card
      variant="elevated"
      padding="none"
      loading={loading}
      error={error}
      className="overflow-hidden"
    >
      <CardHeader
        title="Services Overview"
        subtitle="Monthly service distribution and completion rates"
        action={headerAction}
      />
      <CardBody className="pt-2">
        {/* Service Status Legend with Tooltips */}
        <div className="flex items-center gap-4 mb-4">
          <Tooltip content="Successfully completed services" position="top">
            <div className="flex items-center gap-2 cursor-help">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.completed }} />
              <span className="text-sm text-muted-foreground">Completed</span>
              <span className="text-xs font-medium">({stats.completed})</span>
            </div>
          </Tooltip>

          <Tooltip content="Currently active services" position="top">
            <div className="flex items-center gap-2 cursor-help">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: colors.inProgress }}
              />
              <span className="text-sm text-muted-foreground">In Progress</span>
              <span className="text-xs font-medium">({stats.inProgress})</span>
            </div>
          </Tooltip>

          <Tooltip content="Services that were cancelled" position="top">
            <div className="flex items-center gap-2 cursor-help">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.cancelled }} />
              <span className="text-sm text-muted-foreground">Cancelled</span>
              <span className="text-xs font-medium">({stats.cancelled})</span>
            </div>
          </Tooltip>

          <div className="ml-auto">
            <Tooltip content="Average services per month" position="top">
              <div className="flex items-center gap-1 text-sm cursor-help">
                <Info className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Avg:</span>
                <span className="font-semibold">{formatNumber(stats.average)}/month</span>
              </div>
            </Tooltip>
          </div>
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={320}>
          <BarChart
            data={data}
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            onMouseMove={(e: any) => {
              if (e?.activeLabel) {
                setHoveredBar(e.activeLabel);
              }
            }}
            onMouseLeave={() => setHoveredBar(null)}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
            <XAxis
              dataKey="month"
              stroke={colors.text}
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke={colors.text}
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatNumber(value)}
            />
            <RechartsTooltip content={<CustomChartTooltip />} />
            <Bar
              dataKey="completed"
              fill={colors.completed}
              stackId="services"
              radius={[0, 0, 0, 0]}
              name="Completed"
            />
            <Bar
              dataKey="inProgress"
              fill={colors.inProgress}
              stackId="services"
              radius={[0, 0, 0, 0]}
              name="In Progress"
            />
            <Bar
              dataKey="cancelled"
              fill={colors.cancelled}
              stackId="services"
              radius={[4, 4, 0, 0]}
              name="Cancelled"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardBody>
    </Card>
  );
}
