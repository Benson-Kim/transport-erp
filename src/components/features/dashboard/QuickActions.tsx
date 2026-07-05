/**
 * Quick Actions Component
 * Common actions and shortcuts
 */

'use client';

import { useMemo } from 'react';

import Link from 'next/link';

import {
  Plus,
  FileText,
  Receipt,
  Users,
  Building2,
  TrendingUp,
  Settings,
  ArrowRight,
  Sparkles,
  Zap,
  ChevronRight,
} from 'lucide-react';

import type { UserRole } from '@/app/generated/prisma';
import { Button, Card, CardBody, CardHeader, Tooltip, EmptyState, Badge } from '@/components/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { cn } from '@/lib/utils/cn';

type QuickActionsProps = Readonly<{
  userRole: UserRole;
  loading?: boolean;
  error?: Error | null;
  onRefresh?: () => void;
}>;

export function QuickActions({
  userRole,
  loading = false,
  error = null,
  onRefresh,
}: QuickActionsProps) {
  const permissions = usePermissions();

  const actions = useMemo(
    () => [
      {
        id: 'new-service',
        label: 'New Service',
        description: 'Create a new transportation service',
        icon: Plus,
        href: '/services/new',
        variant: 'primary' as const,
        color: 'bg-blue-500',
        show: permissions.can('services', 'create'),
        badge: 'Quick',
        hotkey: 'N',
      },
      {
        id: 'loading-order',
        label: 'Loading Order',
        description: 'Generate a new loading order document',
        icon: FileText,
        href: '/loading-orders/new',
        variant: 'secondary' as const,
        color: 'bg-purple-500',
        show: permissions.can('loading_orders', 'create'),
        hotkey: 'L',
      },
      {
        id: 'invoice',
        label: 'Create Invoice',
        description: 'Generate invoice for completed services',
        icon: Receipt,
        href: '/invoices/new',
        variant: 'secondary' as const,
        color: 'bg-green-500',
        show: permissions.can('invoices', 'create'),
        hotkey: 'I',
      },
      {
        id: 'clients',
        label: 'Manage Clients',
        description: 'View and manage client information',
        icon: Users,
        href: '/clients',
        variant: 'secondary' as const,
        color: 'bg-orange-500',
        show: permissions.can('clients', 'view'),
      },
      {
        id: 'suppliers',
        label: 'Manage Suppliers',
        description: 'View and manage supplier relationships',
        icon: Building2,
        href: '/suppliers',
        variant: 'secondary' as const,
        color: 'bg-indigo-500',
        show: permissions.can('suppliers', 'view'),
      },
      {
        id: 'reports',
        label: 'View Reports',
        description: 'Access analytics and reports',
        icon: TrendingUp,
        href: '/reports',
        variant: 'secondary' as const,
        color: 'bg-pink-500',
        show: permissions.can('reports', 'view'),
        badge: 'Updated',
      },
    ],
    [permissions]
  );

  // #58: Import/Export/Notifications were dead affordances - a fake 1s
  // spinner and NOTHING else. A shown control must work or be removed;
  // reintroduce each only alongside its real implementation.
  const shortcuts = useMemo(
    () => [
      {
        id: 'settings',
        label: 'Settings',
        description: 'Configure system preferences',
        icon: Settings,
        href: '/settings',
        show: permissions.can('settings', 'view'),
        color: 'bg-gray-500',
      },
    ],
    [permissions]
  );

  const visibleActions = actions.filter((action) => action.show);
  const visibleShortcuts = shortcuts.filter((shortcut) => shortcut.show);

  // Show empty state if user has no permissions
  if (!loading && !error && visibleActions.length === 0 && visibleShortcuts.length === 0) {
    return (
      <Card variant="elevated" padding="none">
        <CardHeader title="Quick Actions" subtitle="Available actions and shortcuts" />
        <CardBody>
          <EmptyState
            icon={<Zap size={48} />}
            title="No actions available"
            description="You don't have permission to perform any quick actions. Contact your administrator for access."
            action={
              onRefresh
                ? {
                    label: 'Refresh Permissions',
                    onClick: onRefresh,
                    icon: <ArrowRight size={16} />,
                  }
                : undefined
            }
          />
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Primary Actions */}
      {visibleActions.length > 0 && (
        <Card variant="elevated" padding="none">
          <CardHeader
            title="Quick Actions"
            subtitle="Frequently used actions"
            action={
              <Tooltip content="Press Alt + letter for keyboard shortcuts" position="left">
                <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-help">
                  <Sparkles className="h-3 w-3" />
                  <span>Shortcuts enabled</span>
                </div>
              </Tooltip>
            }
          />
          <CardBody>
            <div className="grid gap-2">
              {visibleActions.map((action) => (
                <Tooltip
                  key={action.id}
                  content={
                    <div className="space-y-1">
                      <div className="font-medium">{action.description}</div>
                      {action.hotkey && (
                        <div className="text-xs opacity-75">Shortcut: Alt + {action.hotkey}</div>
                      )}
                    </div>
                  }
                  position="top"
                >
                  <Link href={action.href} className="block">
                    <Button
                      variant={action.variant}
                      className="w-full justify-start group hover:shadow-md transition-all"
                      size="md"
                      icon={
                        <ChevronRight className="h-4 w-4 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                      }
                    >
                      <div
                        className={cn(
                          'flex items-center mr-3 p-1.5 rounded-lg bg-white/10',
                          'group-hover:bg-white/20 transition-colors'
                        )}
                      >
                        <action.icon className="h-4 w-4 mr-3" />
                        <span className="flex-1 text-left">{action.label}</span>
                        {action.badge && (
                          <Badge variant="default" size="sm" className="ml-2">
                            {action.badge}
                          </Badge>
                        )}
                      </div>
                    </Button>
                  </Link>
                </Tooltip>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Shortcuts Grid */}
      {visibleShortcuts.length > 0 && (
        <Card variant="elevated" padding="none">
          <CardHeader title="Shortcuts" subtitle="Quick access to common tasks" />
          <CardBody>
            <div className="grid grid-cols-2 gap-3">
              {visibleShortcuts.map((shortcut) => (
                <Tooltip key={shortcut.id} content={shortcut.description} position="top">
                  <Link href={shortcut.href} className="block">
                    <div
                      className={cn(
                        'relative h-24 rounded-lg border-2 border-neutral-200',
                        'hover:border-primary hover:shadow-md transition-all cursor-pointer',
                        'dark:border-neutral-700 dark:hover:border-primary',
                        'flex flex-col items-center justify-center gap-2 p-4',
                        'group'
                      )}
                    >
                      <div
                        className={cn(
                          'p-2 rounded-lg transition-colors',
                          shortcut.color,
                          'bg-opacity-10 group-hover:bg-opacity-20'
                        )}
                      >
                        <shortcut.icon className="h-5 w-5" />
                      </div>
                      <span className="text-xs font-medium text-center">{shortcut.label}</span>
                    </div>
                  </Link>
                </Tooltip>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* #58: the Help & Support card was a dead-affordance cluster - the
          /help/* routes do not exist and mailto:support@example.com was a
          placeholder. Reintroduce it WITH real destinations or not at all. */}
    </div>
  );
}

// Role-based Quick Actions Widget (Compact Version)
export function QuickActionsWidget({ userRole: _userRole }: Readonly<{ userRole: UserRole }>) {
  const permissions = usePermissions();

  const topActions = [
    {
      id: 'new-service',
      label: 'New Service',
      icon: Plus,
      href: '/services/new',
      show: permissions.can('services', 'create'),
    },
    {
      id: 'invoice',
      label: 'Invoice',
      icon: Receipt,
      href: '/invoices/new',
      show: permissions.can('invoices', 'create'),
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: TrendingUp,
      href: '/reports',
      show: permissions.can('reports', 'view'),
    },
  ].filter((a) => a.show);

  if (topActions.length === 0) return null;

  return (
    <div className="flex gap-2">
      {topActions.map((action) => (
        <Tooltip key={action.id} content={action.label} position="bottom">
          <Link href={action.href}>
            <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
              <action.icon className="h-4 w-4" />
            </Button>
          </Link>
        </Tooltip>
      ))}
    </div>
  );
}
