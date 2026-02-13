/**
 * Services Chart Component
 * Bar chart showing services per month
 */

'use client';

import { useMemo, useRef, useState } from 'react';
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
import { formatNumber } from '@/lib/utils/formatting';
import { cn } from '@/lib/utils/cn';

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

interface ServiceStats {
  total: number;
  completed: number;
  inProgress: number;
  cancelled: number;
  average: number;
  completionRate: number;
  cancellationRate: number;
  trend: number;
  bestMonth: string | null;
  worstMonth: string | null;
}

export function ServicesChart({
  data = [],
  loading = false,
  error = null,
  onRefresh,
  onViewDetails,
}: Readonly<ServicesChartProps>) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [isExporting, setIsExporting] = useState(false);
  const hoveredBarRef = useRef<string | null>(null);

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

  // Extract helper functions to reduce complexity
  const calculateTrend = (data: ChartData[]): number => {
    if (data.length < 2) return 0;

    const lastMonth = data.at(-1);
    const previousMonth = data.at(-2);

    if (!lastMonth || !previousMonth || previousMonth.total === 0) return 0;

    return ((lastMonth.total - previousMonth.total) / previousMonth.total) * 100;
  };

  const findBestAndWorstMonths = (data: ChartData[]) => {
    if (data.length === 0) return { best: null, worst: null };

    const sorted = [...data].sort((a, b) => b.total - a.total);
    return {
      best: sorted[0]?.month || null,
      worst: sorted.at(-1)?.month || null,
    };
  };

  const stats = useMemo(() => {
    const hasData = data && data.length > 0;

    if (!hasData) {
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
    const trend = calculateTrend(data);
    const { best, worst } = findBestAndWorstMonths(data);

    return {
      total,
      completed,
      inProgress,
      cancelled,
      average,
      completionRate,
      cancellationRate,
      trend,
      bestMonth: best,
      worstMonth: worst,
    };
  }, [data]);

  const exportToCsv = (data: ChartData[], stats: ServiceStats) => {
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
  };

  const handleExport = async () => {
    const hasNoData = !data || data.length === 0;
    if (hasNoData) {
      console.warn('No data to export');
      return;
    }

    setIsExporting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      exportToCsv(data, stats);
    } finally {
      setIsExporting(false);
    }
  };

  // Simplified state checks
  const hasError = !loading && error;
  const hasNoData = !loading && !error && (!data || data.length === 0);

  if (hasError) {
    const errorStateProps: Parameters<typeof ErrorState>[0] = {
      error,
      title: 'Failed to load services data',
      description:
        "We couldn't fetch your services data. Please check your connection and try again.",
      variant: 'full' as const,
      ...(onRefresh && { onRetry: onRefresh }),
    };

    return (
      <Card variant="elevated" padding="none">
        <CardHeader title="Services Overview" subtitle="Monthly service distribution" />
        <CardBody>
          <ErrorState {...errorStateProps} />
        </CardBody>
      </Card>
    );
  }

  if (hasNoData) {
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
        action={
          <HeaderAction
            data={data}
            stats={stats}
            isExporting={isExporting}
            onExport={handleExport}
          />
        }
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
                hoveredBarRef.current = e.activeLabel;
              }
            }}
            onMouseLeave={() => (hoveredBarRef.current = null)}
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
            <RechartsTooltip
              content={<ServiceChartTooltip {...(onViewDetails && { onViewDetails })} />}
            />
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

type TooltipEntry = {
  name: string;
  value: number;
  fill: string;
  payload: {
    total: number;
    completed: number;
  };
};

type ServiceChartTooltipProps = Readonly<{
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  onViewDetails?: (month: string) => void;
}>;

export const ServiceChartTooltip: React.FC<ServiceChartTooltipProps> = ({
  active,
  payload,
  label,
  onViewDetails,
}) => {
  // Only render if tooltip is active and payload exists
  if (!active || !payload || payload.length === 0) return null;

  const firstPayload = payload[0]?.payload;
  if (!firstPayload) return null;

  const total = firstPayload.total;
  const completionRate = total > 0 ? ((firstPayload.completed / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="rounded-lg border border-neutral-200 bg-background p-3 shadow-md">
      <div className="flex items-center justify-between mb-2">
        <p className="font-medium text-sm">{label}</p>
        {onViewDetails && label && (
          <button
            onClick={() => onViewDetails(label)}
            className="text-xs text-primary hover:underline"
          >
            View Details →
          </button>
        )}
      </div>
      <div className="space-y-1">
        {payload.map((entry) => (
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
};

// Extract header action component
interface HeaderActionProps {
  data: ChartData[];
  stats: ServiceStats;
  isExporting: boolean;
  onExport: () => void;
}

const HeaderAction = ({ data, stats, isExporting, onExport }: Readonly<HeaderActionProps>) => {
  if (data.length === 0) return null;

  const trendColor = stats.trend >= 0 ? 'green' : 'red';
  const TrendIcon = stats.trend >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-3">
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

        <Tooltip
          content={
            <div className="space-y-1">
              <div className="font-semibold">{stats.trend >= 0 ? 'Growth' : 'Decline'} Trend</div>
              <div className="text-xs opacity-90">Month-over-month change</div>
              {data.length >= 2 && (
                <div className="text-xs opacity-90">
                  {data.at(-2)?.month}: {data.at(-2)?.total || 0} → {data.at(-1)?.month}:{' '}
                  {data.at(-1)?.total || 0}
                </div>
              )}
            </div>
          }
          position="bottom"
        >
          <div
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-help',
              `bg-${trendColor}-50 dark:bg-${trendColor}-900/20`
            )}
          >
            <TrendIcon className={`h-4 w-4 text-${trendColor}-600 dark:text-${trendColor}-400`} />
            <span
              className={cn(
                'text-sm font-semibold',
                `text-${trendColor}-900 dark:text-${trendColor}-200`
              )}
            >
              {Math.abs(stats.trend).toFixed(1)}%
            </span>
          </div>
        </Tooltip>
      </div>

      <div className="h-8 w-px bg-neutral-200 dark:bg-neutral-700" />

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

      <Tooltip content="Download complete services report" position="bottom">
        <Button
          size="sm"
          variant="secondary"
          onClick={onExport}
          icon={<Download className="h-4 w-4" />}
          iconPosition="left"
          loading={isExporting}
          loadingText="Exporting..."
        >
          Export
        </Button>
      </Tooltip>
    </div>
  );
};
