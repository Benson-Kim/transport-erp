/**
 * Stats Cards Component
 * Display key metrics with trend indicators
 */

'use client';

import { useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  CheckCircle2,
  Euro,
  Percent
} from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { cn } from '@/lib/utils/cn';
import { formatCurrency, formatPercentage } from '@/lib/utils/formatting';

interface StatsData {
  activeServices: number;
  activeServicesChange: number;
  completedServices: number;
  completedServicesChange: number;
  totalRevenue: number;
  totalRevenueChange: number;
  averageMargin: number;
  averageMarginAmount: number;
  averageMarginChange: number;
  totalServices: number;
}

interface StatsCardsProps {
  stats: StatsData;
}

export function StatsCards({ stats }: StatsCardsProps) {
  const cards = useMemo(
    () => [
      {
        id: 'active-services',
        label: 'Active Services',
        value: stats.activeServices.toString(),
        change: stats.activeServicesChange,
        icon: Activity,
        iconColor: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-100 dark:bg-blue-900/20',
        href: '/services?status=active',
      },
      {
        id: 'completed-services',
        label: 'Completed Services',
        value: stats.completedServices.toString(),
        change: stats.completedServicesChange,
        icon: CheckCircle2,
        iconColor: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-100 dark:bg-green-900/20',
        href: '/services?status=completed',
      },
      {
        id: 'total-revenue',
        label: 'Total Revenue',
        value: formatCurrency(stats.totalRevenue),
        change: stats.totalRevenueChange,
        icon: Euro,
        iconColor: 'text-purple-600 dark:text-purple-400',
        bgColor: 'bg-purple-100 dark:bg-purple-900/20',
        href: '/reports/revenue',
      },
      {
        id: 'average-margin',
        label: 'Average Margin',
        value: formatPercentage(stats.averageMargin),
        subValue: formatCurrency(stats.averageMarginAmount),
        change: stats.averageMarginChange,
        icon: Percent,
        iconColor: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-100 dark:bg-amber-900/20',
        href: '/reports/margins',
      },
    ],
    [stats]
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <StatsCard key={card.id} {...card} />
      ))}
    </div>
  );
}

interface StatsCardProps {
  label: string;
  value: string;
  subValue?: string;
  change: number;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  bgColor: string;
  href: string;
}

function StatsCard({
  label,
  value,
  subValue,
  change,
  icon: Icon,
  iconColor,
  bgColor,
  href,
}: StatsCardProps) {
  const isPositive = change >= 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <Card className="hover:shadow-lg transition-all duration-200 cursor-pointer group">
      <a href={href} className="block">
        <CardHeader
          title={label}
          className="flex flex-row items-center justify-between space-y-0 pb-2"
        >
          <div className={cn('rounded-lg p-2', bgColor)}>
            <Icon className={cn('h-4 w-4', iconColor)} />
          </div>
        </CardHeader>

        <CardBody>
          <div className="space-y-1">
            <div className="text-2xl font-bold group-hover:text-primary transition-colors">
              {value}
            </div>
            {subValue && (
              <div className="text-sm text-muted-foreground">{subValue}</div>
            )}
            <div className="flex items-center space-x-1">
              <TrendIcon
                className={cn(
                  'h-3 w-3',
                  isPositive
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              />
              <span
                className={cn(
                  'text-xs font-medium',
                  isPositive
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                )}
              >
                {Math.abs(change).toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">
                from last period
              </span>
            </div>
          </div>
        </CardBody>
      </a>
    </Card>
  );
}