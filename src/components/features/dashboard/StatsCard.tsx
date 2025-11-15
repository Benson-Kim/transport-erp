/**
 * Stats Cards Component
 * Display key metrics with trend indicators
 */

'use client';

import { useMemo, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  CheckCircle2,
  Euro,
  Percent,
  ArrowUpRight,
  ArrowDown,
  ArrowUp,
  RefreshCw,
} from 'lucide-react';
import { Card, Tooltip, Skeleton, Button } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { formatCurrency, formatPercentage, formatNumber } from '@/lib/utils/formatting';
import Link from 'next/link';
import { StatsCardsProps, StatsData } from '@/types/dashboard';



export function StatsCards({
  stats,
  loading = false,
  error = null,
  onRefresh,
  compact = false,
}: StatsCardsProps) {
  // const router = useRouter();
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const cards = useMemo(
    () => [
      {
        id: 'active-services',
        label: 'Active Services',
        value: stats.activeServices.toString(),
        change: stats.activeServicesChange,
        icon: Activity,
        iconColor: 'text-blue-600 dark:text-blue-400',
        iconBg: 'bg-blue-100 dark:bg-blue-900/20',
        href: '/services?status=active',
        tooltip: {
          title: 'Active Services',
          description: 'Services currently in progress or confirmed',
          details: [
            `${stats.activeServices} services active`,
            `${stats.activeServicesChange >= 0 ? '+' : ''}${formatPercentage(stats.activeServicesChange)} from last period`,
          ],
        },
      },
      {
        id: 'completed-services',
        label: 'Completed Services',
        value: stats.completedServices.toString(),
        change: stats.completedServicesChange,
        icon: CheckCircle2,
        iconColor: 'text-green-600 dark:text-green-400',
        iconBg: 'bg-green-100 dark:bg-green-900/20',
        href: '/services?status=completed',
        tooltip: {
          title: 'Completed Services',
          description: 'Successfully completed services',
          details: [
            `${stats.completedServices} services completed`,
            `${((stats.completedServices / stats.totalServices) * 100).toFixed(1)}% completion rate`,
          ],
        },
      },
      {
        id: 'total-revenue',
        label: 'Total Revenue',
        value: formatCurrency(stats.totalRevenue),
        change: stats.totalRevenueChange,
        icon: Euro,
        iconColor: 'text-purple-600 dark:text-purple-400',
        iconBg: 'bg-purple-100 dark:bg-purple-900/20',
        href: '/reports/revenue',
        tooltip: {
          title: 'Total Revenue',
          description: 'Total income generated in the period',
          details: [
            `Revenue: ${formatCurrency(stats.totalRevenue)}`,
            `Growth: ${stats.totalRevenueChange >= 0 ? '+' : ''}${formatPercentage(stats.totalRevenueChange)}`,
            stats.totalServices > 0
              ? `Avg per service: ${formatCurrency(stats.totalRevenue / stats.totalServices)}`
              : null,
          ].filter(Boolean),
        },
      },
      {
        id: 'average-margin',
        label: 'Average Margin',
        value: formatPercentage(stats.averageMargin),
        subValue: formatCurrency(stats.averageMarginAmount),
        change: stats.averageMarginChange,
        icon: Percent,
        iconColor: 'text-amber-600 dark:text-amber-400',
        iconBg: 'bg-amber-100 dark:bg-amber-900/20',
        href: '/reports/margins',
        tooltip: {
          title: 'Average Margin',
          description: 'Average profit margin across all services',
          details: [
            `Margin rate: ${formatPercentage(stats.averageMargin)}`,
            `Margin amount: ${formatCurrency(stats.averageMarginAmount)}`,
            `Change: ${stats.averageMarginChange >= 0 ? '+' : ''}${formatPercentage(stats.averageMarginChange)}`,
          ],
        },
      },
    ],
    [stats]
  );

  // Loading state
  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} padding="md">
            <div className="flex items-center justify-between mb-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-3 w-20" />
          </Card>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card padding="lg">
        <div className="text-center py-4">
          <p className="text-red-600 font-medium mb-2">Failed to load statistics</p>
          <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
          {onRefresh && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRefresh}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              Retry
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className={cn('grid gap-4', compact ? 'grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4')}>
      {cards.map((card) => (
        <Tooltip
          key={card.id}
          content={
            <div className="space-y-2 max-w-xs">
              <div>
                <div className="font-semibold">{card.tooltip.title}</div>
                <div className="text-xs opacity-90">{card.tooltip.description}</div>
              </div>
              <div className="space-y-1 pt-1 border-t border-white/10">
                {card.tooltip.details.map((detail, i) => (
                  <div key={i} className="text-xs opacity-75">
                    {detail}
                  </div>
                ))}
              </div>
              <div className="text-xs opacity-60 pt-1">Click to view details →</div>
            </div>
          }
          position="top"
        >
          <Link
            href={card.href}
            onMouseEnter={() => setHoveredCard(card.id)}
            onMouseLeave={() => setHoveredCard(null)}
          >
            <Card
              className={cn(
                'transition-all cursor-pointer relative overflow-hidden',
                'hover:shadow-lg hover:-translate-y-1',
                'group',
                hoveredCard === card.id && 'ring-2 ring-primary ring-opacity-50'
              )}
              padding={compact ? 'sm' : 'md'}
            >
              {/* Hover Indicator */}
              <div
                className={cn(
                  'absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity',
                  'text-muted-foreground'
                )}
              >
                <ArrowUpRight className="h-3 w-3" />
              </div>

              {/* Content */}
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={cn(
                      'font-medium text-muted-foreground',
                      compact ? 'text-xs' : 'text-sm'
                    )}
                  >
                    {card.label}
                  </span>
                  <div
                    className={cn(
                      'rounded-lg transition-transform group-hover:scale-110',
                      card.iconBg,
                      compact ? 'p-1.5' : 'p-2'
                    )}
                  >
                    <card.icon className={cn(card.iconColor, compact ? 'h-3 w-3' : 'h-4 w-4')} />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <div
                      className={cn(
                        'font-bold text-foreground group-hover:text-primary transition-colors',
                        compact ? 'text-xl' : 'text-2xl'
                      )}
                    >
                      {card.value}
                    </div>

                    {card.subValue && (
                      <div className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
                        {card.subValue}
                      </div>
                    )}
                  </div>

                  {/* Trend Indicator */}
                  <div className={cn('flex items-center gap-1', compact ? 'text-xs' : 'text-sm')}>
                    <div
                      className={cn(
                        'flex items-center gap-0.5',
                        card.change >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      )}
                    >
                      {card.change >= 0 ? (
                        <TrendingUp className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                      ) : (
                        <TrendingDown className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                      )}
                      <span className="font-medium">{formatPercentage(Math.abs(card.change))}</span>
                    </div>
                    <span className="text-muted-foreground">vs last period</span>
                  </div>
                </div>
              </div>

              {/* Background Pattern */}
              <div
                className={cn(
                  'absolute inset-0 flex items-center justify-center opacity-5 group-hover:opacity-10 transition-opacity',
                  card.iconColor.replace('text-', 'text-')
                )}
              >
                <card.icon className="h-24 w-24" />
              </div>


            </Card>
          </Link>
        </Tooltip>
      ))}
    </div>
  );
}

// Mini Stats for Sidebar or Header
export function MiniStats({ stats }: { stats: StatsData }) {
  const items = [
    {
      label: 'Revenue',
      value: formatCurrency(stats.totalRevenue),
      change: stats.totalRevenueChange,
    },
    {
      label: 'Services',
      value: formatNumber(stats.activeServices),
      change: stats.activeServicesChange,
    },
    {
      label: 'Margin',
      value: formatPercentage(stats.averageMargin),
      change: stats.averageMarginChange,
    },
  ];

  return (
    <div className="flex items-center gap-4">
      {items.map((item, i) => (
        <div key={item.label} className="flex items-center gap-4">
          {i > 0 && <div className="h-4 w-px bg-neutral-200 dark:bg-neutral-700" />}
          <Tooltip
            content={`${item.label}: ${item.change >= 0 ? '+' : ''}${item.change}% from last period`}
            position="bottom"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{item.label}</span>
              <span className="text-sm font-semibold">{item.value}</span>
              {item.change !== 0 && (
                <span
                  className={cn('text-xs', item.change >= 0 ? 'text-green-600' : 'text-red-600')}
                >
                  {/* {item.change >= 0 ? '↑' : '↓'} */}
                  {item.change >= 0 ? (
                    <ArrowUp className='h-3 w-3' />
                  ) : (
                    <ArrowDown className='h-3 w-3' />
                  )}
                </span>
              )}
            </div>
          </Tooltip>
        </div>
      ))}
    </div>
  );
}
