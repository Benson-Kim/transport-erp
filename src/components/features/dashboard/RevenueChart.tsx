/**
 * Revenue Chart Component
 * Line chart showing revenue trends
 */

'use client';

import { useMemo } from 'react';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Euro } from 'lucide-react';
import { useTheme } from 'next-themes';
import { formatCurrency } from '@/lib/utils/formatting';

interface ChartData {
  month: string;
  revenue: number;
  cost: number;
  margin: number;
}

interface RevenueChartProps {
  data: ChartData[];
}

export function RevenueChart({ data }: RevenueChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

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

  const totalRevenue = useMemo(
    () => data.reduce((sum, item) => sum + item.revenue, 0),
    [data]
  );

  const totalMargin = useMemo(
    () => data.reduce((sum, item) => sum + item.margin, 0),
    [data]
  );

  const avgMarginPercent = useMemo(
    () => (totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0),
    [totalRevenue, totalMargin]
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border bg-background p-3 shadow-md">
          <p className="font-medium">{label}</p>
          <div className="mt-1 space-y-1">
            {payload.map((entry: any) => (
              <div key={entry.name} className="flex items-center gap-2 text-sm">
                <div
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: entry.stroke }}
                />
                <span className="capitalize text-muted-foreground">
                  {entry.name}:
                </span>
                <span className="font-medium">
                  {formatCurrency(entry.value)}
                </span>
              </div>
            ))}
            {payload[0]?.payload && (
              <div className="mt-1 border-t pt-1">
                <span className="text-sm text-muted-foreground">
                  Margin %:{' '}
                </span>
                <span className="text-sm font-medium">
                  {(
                    (payload[0].payload.margin / payload[0].payload.revenue) *
                    100
                  ).toFixed(1)}
                  %
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  const handleExport = () => {
    const csv = [
      ['Month', 'Revenue', 'Cost', 'Margin'],
      ...data.map((row) => [row.month, row.revenue, row.cost, row.margin]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'revenue-chart.csv';
    a.click();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
          <CardTitle>Revenue Trends</CardTitle>
          <p className="text-sm text-muted-foreground">
            Monthly revenue and margin analysis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-sm">
            <Euro className="h-4 w-4 text-purple-600" />
            <span className="font-medium">{formatCurrency(totalRevenue)}</span>
            <span className="text-muted-foreground">
              ({avgMarginPercent.toFixed(1)}% margin)
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            className="h-8"
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart
            data={data}
            margin={{ top: 5, right: 30, left: 5, bottom: 5 }}
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
            <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
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
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="line"
              wrapperStyle={{
                paddingTop: '20px',
                fontSize: '12px',
              }}
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke={colors.revenue}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorRevenue)"
              name="Revenue"
            />
            <Area
              type="monotone"
              dataKey="margin"
              stroke={colors.margin}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorMargin)"
              name="Margin"
            />
            <Line
              type="monotone"
              dataKey="cost"
              stroke={colors.cost}
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
              name="Cost"
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}