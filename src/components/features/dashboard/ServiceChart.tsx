/**
 * Services Chart Component
 * Bar chart showing services per month
 */

'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Download, TrendingUp } from 'lucide-react';
import { useTheme } from 'next-themes';
import { formatNumber } from '@/lib/utils/formatting';

interface ChartData {
  month: string;
  completed: number;
  inProgress: number;
  cancelled: number;
  total: number;
}

interface ServicesChartProps {
  data: ChartData[];
}

export function ServicesChart({ data }: ServicesChartProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

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

  const total = useMemo(
    () => data.reduce((sum, item) => sum + item.total, 0),
    [data]
  );

  const average = useMemo(
    () => (data.length > 0 ? total / data.length : 0),
    [data, total]
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
                  style={{ backgroundColor: entry.fill }}
                />
                <span className="capitalize text-muted-foreground">
                  {entry.name}:
                </span>
                <span className="font-medium">{entry.value}</span>
              </div>
            ))}
            <div className="mt-1 border-t pt-1">
              <span className="text-sm text-muted-foreground">Total: </span>
              <span className="text-sm font-medium">
                {payload[0].payload.total}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  const handleExport = () => {
    // Implement CSV export
    const csv = [
      ['Month', 'Completed', 'In Progress', 'Cancelled', 'Total'],
      ...data.map((row) => [
        row.month,
        row.completed,
        row.inProgress,
        row.cancelled,
        row.total,
      ]),
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'services-chart.csv';
    a.click();
  };

  return (
    <Card>
      <CardHeader title='Services Overview' subtitle='Monthly service distribution' className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-sm">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="font-medium">{formatNumber(average)}</span>
            <span className="text-muted-foreground">avg/month</span>
          </div>
          <Button
            variant="secondary"
            onClick={handleExport}
            className="h-8"
            aria-label='export services data'
          >
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart
            data={data}
            margin={{ top: 5, right: 30, left: 5, bottom: 5 }}
          >
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
              tickFormatter={(value) => `${value}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="rect"
              wrapperStyle={{
                paddingTop: '20px',
                fontSize: '12px',
              }}
            />
            <Bar
              dataKey="completed"
              fill={colors.completed}
              stackId="a"
              radius={[0, 0, 0, 0]}
              name="Completed"
            />
            <Bar
              dataKey="inProgress"
              fill={colors.inProgress}
              stackId="a"
              radius={[0, 0, 0, 0]}
              name="In Progress"
            />
            <Bar
              dataKey="cancelled"
              fill={colors.cancelled}
              stackId="a"
              radius={[4, 4, 0, 0]}
              name="Cancelled"
            />
          </BarChart>
        </ResponsiveContainer>
      </CardBody>
    </Card>
  );
}