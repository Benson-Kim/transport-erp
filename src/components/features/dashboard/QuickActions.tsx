/**
 * Quick Actions Component
 * Common actions and shortcuts
 */

'use client';

import { useState, useMemo } from 'react';

import Link from 'next/link';

import {
  Plus,
  FileText,
  Receipt,
  Users,
  Building2,
  TrendingUp,
  Settings,
  Download,
  Upload,
  Send,
  ArrowRight,
  HelpCircle,
  Sparkles,
  Zap,
  BookOpen,
  Video,
  MessageSquare,
  ExternalLink,
  ChevronRight,
  Loader2,
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
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  console.log('User Role in QuickActions:', userRole);

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

  const shortcuts = useMemo(
    () => [
      {
        id: 'import',
        label: 'Import Data',
        description: 'Bulk import from Excel or CSV',
        icon: Upload,
        onClick: async () => {
          setLoadingAction('import');
          await new Promise((resolve) => setTimeout(resolve, 1000));
          console.log('Import data');
          setLoadingAction(null);
        },
        show: permissions.isAdmin,
        color: 'bg-cyan-500',
      },
      {
        id: 'export',
        label: 'Export Report',
        description: 'Download reports in various formats',
        icon: Download,
        onClick: async () => {
          setLoadingAction('export');
          await new Promise((resolve) => setTimeout(resolve, 1000));
          console.log('Export report');
          setLoadingAction(null);
        },
        show: permissions.can('reports', 'export'),
        color: 'bg-teal-500',
      },
      {
        id: 'notifications',
        label: 'Send Notifications',
        description: 'Send bulk notifications to users',
        icon: Send,
        onClick: async () => {
          setLoadingAction('notifications');
          await new Promise((resolve) => setTimeout(resolve, 1000));
          console.log('Send notifications');
          setLoadingAction(null);
        },
        show: permissions.isManager,
        color: 'bg-amber-500',
      },
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

  const helpResources = [
    {
      id: 'getting-started',
      label: 'Getting Started Guide',
      description: 'Learn the basics',
      icon: BookOpen,
      href: '/help/getting-started',
      external: false,
    },
    {
      id: 'video-tutorials',
      label: 'Video Tutorials',
      description: 'Watch and learn',
      icon: Video,
      href: '/help/video-tutorials',
      external: false,
    },
    {
      id: 'contact-support',
      label: 'Contact Support',
      description: '24/7 assistance',
      icon: MessageSquare,
      href: '/help/contact',
      external: false,
    },
  ];

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
              {visibleShortcuts.map((shortcut) => {
                const isLoading = loadingAction === shortcut.id;

                return (
                  <Tooltip key={shortcut.id} content={shortcut.description} position="top">
                    {shortcut.href ? (
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
                    ) : (
                      <button
                        onClick={shortcut.onClick}
                        disabled={isLoading}
                        className={cn(
                          'relative h-24 w-full rounded-lg border-2 border-neutral-200',
                          'hover:border-primary hover:shadow-md transition-all',
                          'dark:border-neutral-700 dark:hover:border-primary',
                          'flex flex-col items-center justify-center gap-2 p-4',
                          'group disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                      >
                        <div
                          className={cn(
                            'p-2 rounded-lg transition-colors',
                            shortcut.color,
                            'bg-opacity-10 group-hover:bg-opacity-20'
                          )}
                        >
                          {isLoading ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <shortcut.icon className="h-5 w-5" />
                          )}
                        </div>
                        <span className="text-xs font-medium text-center">
                          {isLoading ? 'Processing...' : shortcut.label}
                        </span>
                      </button>
                    )}
                  </Tooltip>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Help & Support */}
      <Card variant="elevated" padding="none">
        <CardHeader
          title="Need Help?"
          subtitle="Resources and support options"
          action={
            <Tooltip content="Get help anytime" position="left">
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </Tooltip>
          }
        />
        <CardBody>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Access guides, tutorials, and direct support to help you get the most out of the
              platform.
            </p>

            <div className="grid gap-2">
              {helpResources.map((resource) => (
                <Link
                  key={resource.id}
                  href={resource.href}
                  className="group"
                  {...(resource.external && {
                    target: '_blank',
                    rel: 'noopener noreferrer',
                  })}
                >
                  <div
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg',
                      'border border-neutral-200 dark:border-neutral-700',
                      'hover:border-primary hover:bg-neutral-50 dark:hover:bg-neutral-900',
                      'transition-all'
                    )}
                  >
                    <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
                      <resource.icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{resource.label}</span>
                        {resource.external && (
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{resource.description}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>

            {/* Quick contact */}
            <div className="pt-3 border-t flex items-center justify-between">
              <div className="text-xs text-muted-foreground">Need immediate assistance?</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open('mailto:support@example.com', '_blank')}
              >
                Email Support
                <ExternalLink className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
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
