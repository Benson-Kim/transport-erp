/**
 * Revenue Chart Component
 * Line chart showing revenue trends
 */

'use client';

import { useMemo, useState } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import {
  Download,
  Euro,
  TrendingUp,
  TrendingDown,
  Info,
  BarChart3,
  FileSpreadsheet,
  RefreshCw
} from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  Button,
  Tooltip,
  EmptyState,
  ErrorState, Card, CardHeader, CardBody
} from '@/components/ui';
import { formatCurrency } from '@/lib/utils/formatting';
import { cn } from '@/lib/utils/cn';

interface ChartData {
  month: string;
  revenue: number;
  cost: number;
  margin: number;
}

interface RevenueChartProps {
  data?: ChartData[];
  loading?: boolean;
  error?: Error | null;
  onRefresh?: () => void;
  onImportData?: () => void;
  showImportOption?: boolean;
}

export function RevenueChart({
  data = [],
  loading = false,
  error = null,
  onRefresh,
  onImportData,
  showImportOption = false
}: RevenueChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [isExporting, setIsExporting] = useState(false);

  const colors = useMemo(
    () => ({
      revenue: isDark ? '#8b5cf6' : '#7c3aed',
      cost: isDark ? '#f59e0b' : '#d97706',
      margin: isDark ? '#10b981' : '#059669',
      grid: isDark ? '#374151' : '#e5e7eb',
      text: isDark ? '#9ca3af' : '#6b7280',
    }),
    [isDark]
  );

  const stats = useMemo(() => {
    // Early return with default values if no data
    if (!data || data.length === 0) {
      return {
        totalRevenue: 0,
        totalMargin: 0,
        totalCost: 0,
        avgMarginPercent: 0,
        trend: 0,
        periodStart: '',
        periodEnd: '',
      };
    }

    const totalRevenue = data.reduce((sum, item) => sum + item.revenue, 0);
    const totalMargin = data.reduce((sum, item) => sum + item.margin, 0);
    const totalCost = data.reduce((sum, item) => sum + item.cost, 0);
    const avgMarginPercent = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

    // Calculate trend (comparing last month to previous)
    let trend = 0;
    if (data.length >= 2) {
      const lastMonth = data[data.length - 1];
      const previousMonth = data[data.length - 2];

      if (lastMonth && previousMonth && previousMonth.revenue > 0) {
        trend = ((lastMonth.revenue - previousMonth.revenue) / previousMonth.revenue) * 100;
      }
    }

    return {
      totalRevenue,
      totalMargin,
      totalCost,
      avgMarginPercent,
      trend,
      periodStart: data[0]?.month || '',
      periodEnd: data[data.length - 1]?.month || '',
    };
  }, [data]);

  const CustomChartTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-neutral-200 bg-background p-3 shadow-md">
          <p className="font-medium text-sm mb-2">{label}</p>
          <div className="space-y-1">
            {payload.map((entry: any) => (
              <div key={entry.name} className="flex items-center justify-between gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: entry.stroke }}
                  />
                  <span className="text-muted-foreground">
                    {entry.name}
                  </span>
                </div>
                <span className="font-medium tabular-nums">
                  {formatCurrency(entry.value)}
                </span>
              </div>
            ))}
            {payload[0]?.payload && (
              <div className="mt-2 pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Margin %</span>
                  <span className="font-medium tabular-nums">
                    {payload[0].payload.revenue > 0
                      ? ((payload[0].payload.margin / payload[0].payload.revenue) * 100).toFixed(1)
                      : '0.0'}%
                  </span>
                </div>
              </div>
            )}
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
      // Simulate export delay for better UX
      await new Promise(resolve => setTimeout(resolve, 500));

      const csv = [
        ['Month', 'Revenue', 'Cost', 'Margin', 'Margin %'],
        ...data.map((row) => [
          row.month,
          row.revenue,
          row.cost,
          row.margin,
          row.revenue > 0 ? ((row.margin / row.revenue) * 100).toFixed(2) + '%' : '0%'
        ]),
      ]
        .map((row) => row.join(','))
        .join('\n');

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `revenue-chart-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  // Header action with stats
  const headerAction = data.length > 0 ? (
    <div className="flex items-center gap-4">
      {/* Stats badges */}
      <div className="flex items-center gap-3">
        {/* Revenue Badge */}
        <Tooltip
          content={
            <div className="space-y-1">
              <div className="font-semibold">Total Revenue</div>
              <div className="text-xs opacity-90">
                Period: {stats.periodStart} - {stats.periodEnd}
              </div>
              <div className="text-xs opacity-90">
                Cost: {formatCurrency(stats.totalCost)}
              </div>
            </div>
          }
          position="bottom"
        >
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 rounded-lg cursor-help">
            <Euro className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <span className="text-sm font-semibold text-purple-900 dark:text-purple-200">
              {formatCurrency(stats.totalRevenue)}
            </span>
          </div>
        </Tooltip>

        {/* Trend Badge */}
        <Tooltip
          content={
            <div className="space-y-1">
              <div className="font-semibold">
                {stats.trend >= 0 ? 'Growth' : 'Decline'} Trend
              </div>
              <div className="text-xs opacity-90">
                Compared to previous month
              </div>
              {data.length >= 2 && (
                <div className="text-xs opacity-90">
                  {data[data.length - 2]?.month}: {formatCurrency(data[data.length - 2]?.revenue || 0)} →{' '}
                  {data[data.length - 1]?.month}: {formatCurrency(data[data.length - 1]?.revenue || 0)}
                </div>
              )}
            </div>
          }
          position="bottom"
        >
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-help",
            stats.trend >= 0
              ? "bg-green-50 dark:bg-green-900/20"
              : "bg-red-50 dark:bg-red-900/20"
          )}>
            {stats.trend >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
            )}
            <span className={cn(
              "text-sm font-semibold",
              stats.trend >= 0
                ? "text-green-900 dark:text-green-200"
                : "text-red-900 dark:text-red-200"
            )}>
              {Math.abs(stats.trend).toFixed(1)}%
            </span>
          </div>
        </Tooltip>
      </div>

      <div className="h-8 w-px bg-neutral-200 dark:bg-neutral-700" />

      {/* Average Margin */}
      <Tooltip
        content={
          <div className="space-y-1">
            <div className="font-semibold">Average Margin</div>
            <div className="text-xs opacity-90">
              Total Margin: {formatCurrency(stats.totalMargin)}
            </div>
            <div className="text-xs opacity-90">
              Calculated as (Margin / Revenue) × 100
            </div>
          </div>
        }
        position="bottom"
      >
        <div className="flex items-center gap-1 text-sm cursor-help">
          <span className="text-muted-foreground">Avg. Margin: </span>
          <span className="font-semibold">{stats.avgMarginPercent.toFixed(1)}%</span>
          <Info className="h-3 w-3 text-muted-foreground" />
        </div>
      </Tooltip>

      {/* Export button */}
      <Tooltip
        content="Download data as CSV file"
        position="bottom"
      >
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
      title: "Failed to load revenue data",
      description: "We couldn't fetch your revenue data. Please check your connection and try again.",
      variant: "full" as const,
    };

    // Only add onRetry if onRefresh exists
    if (onRefresh) {
      errorStateProps.onRetry = onRefresh;
    }

    return (
      <Card variant="elevated" padding="none">
        <CardHeader
          title="Revenue Trends"
          subtitle="Monthly revenue, cost and margin analysis"
        />
        <CardBody>
          <ErrorState {...errorStateProps} />
        </CardBody>
      </Card>
    );
  }

  // Show empty state if no data
  if (!loading && !error && (!data || data.length === 0)) {
    return (
      <Card variant="elevated" padding="none">
        <CardHeader
          title="Revenue Trends"
          subtitle="Monthly revenue, cost and margin analysis"
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
            title="No revenue data available"
            description="Start tracking your revenue to see trends and insights here. You can import existing data or wait for the first transactions to appear."
            action={
              showImportOption && onImportData
                ? {
                  label: 'Import Data',
                  onClick: onImportData,
                  icon: <FileSpreadsheet size={16} />,
                }
                : onRefresh
                  ? {
                    label: 'Refresh Data',
                    onClick: onRefresh,
                    icon: <RefreshCw size={16} />,
                  }
                  : undefined
            }
            secondaryAction={
              showImportOption && onImportData && onRefresh
                ? {
                  label: 'Refresh',
                  onClick: onRefresh,
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
        title="Revenue Trends"
        subtitle="Monthly revenue, cost and margin analysis"
        action={headerAction}
      />
      <CardBody className="pt-2">
        {/* Legend Pills with Tooltips */}
        <div className="flex items-center gap-4 mb-4">
          <Tooltip content="Total income generated" position="top">
            <div className="flex items-center gap-2 cursor-help">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.revenue }} />
              <span className="text-sm text-muted-foreground">Revenue</span>
            </div>
          </Tooltip>

          <Tooltip content="Profit after costs (Revenue - Cost)" position="top">
            <div className="flex items-center gap-2 cursor-help">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.margin }} />
              <span className="text-sm text-muted-foreground">Margin</span>
            </div>
          </Tooltip>

          <Tooltip content="Operating expenses" position="top">
            <div className="flex items-center gap-2 cursor-help">
              <div className="w-3 h-0.5" style={{ backgroundColor: colors.cost, opacity: 0.7 }} />
              <span className="text-sm text-muted-foreground">Cost</span>
            </div>
          </Tooltip>
        </div>

        {/* Chart */}
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart
            data={data}
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
          >
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors.revenue} stopOpacity={0.3} />
                <stop offset="95%" stopColor={colors.revenue} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorMargin" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={colors.margin} stopOpacity={0.3} />
                <stop offset="95%" stopColor={colors.margin} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={colors.grid}
              vertical={false}
            />
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
              tickFormatter={(value) => `€${(value / 1000).toFixed(0)}k`}
            />
            <RechartsTooltip content={<CustomChartTooltip />} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={colors.revenue}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorRevenue)"
            />
            <Area
              type="monotone"
              dataKey="margin"
              stroke={colors.margin}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorMargin)"
            />
            <Line
              type="monotone"
              dataKey="cost"
              stroke={colors.cost}
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              opacity={0.7}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardBody>
    </Card>
  );
}