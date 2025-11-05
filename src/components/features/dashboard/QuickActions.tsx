/**
 * Quick Actions Component
 * Common actions and shortcuts
 */

'use client';

import Link from 'next/link';
import { UserRole } from '@prisma/client';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';

interface QuickActionsProps {
  userRole: UserRole;
}

export function QuickActions({ userRole }: QuickActionsProps) {
  const permissions = usePermissions();

  const actions = [
    {
      id: 'new-service',
      label: 'New Service',
      icon: Plus,
      href: '/services/new',
      variant: 'primary' as const,
      show: permissions.can('services', 'create'),
    },
    {
      id: 'loading-order',
      label: 'Generate Loading Order',
      icon: FileText,
      href: '/loading-orders/new',
      variant: 'secondary' as const,
      show: permissions.can('loading_orders', 'create'),
    },
    {
      id: 'invoice',
      label: 'Generate Invoice',
      icon: Receipt,
      href: '/invoices/new',
      variant: 'secondary' as const,
      show: permissions.can('invoices', 'create'),
    },
    {
      id: 'clients',
      label: 'Manage Clients',
      icon: Users,
      href: '/clients',
      variant: 'secondary' as const,
      show: permissions.can('clients', 'view'),
    },
    {
      id: 'suppliers',
      label: 'Manage Suppliers',
      icon: Building2,
      href: '/suppliers',
      variant: 'secondary' as const,
      show: permissions.can('suppliers', 'view'),
    },
    {
      id: 'reports',
      label: 'View Reports',
      icon: TrendingUp,
      href: '/reports',
      variant: 'secondary' as const,
      show: permissions.can('reports', 'view'),
    },
  ];

  const shortcuts = [
    {
      label: 'Import Data',
      icon: Upload,
      onClick: () => console.log('Import data'),
      show: permissions.isAdmin,
    },
    {
      label: 'Export Report',
      icon: Download,
      onClick: () => console.log('Export report'),
      show: permissions.can('reports', 'export'),
    },
    {
      label: 'Send Notifications',
      icon: Send,
      onClick: () => console.log('Send notifications'),
      show: permissions.isManager,
    },
    {
      label: 'Settings',
      icon: Settings,
      href: '/settings',
      show: permissions.can('settings', 'view'),
    },
  ];

  const visibleActions = actions.filter((action) => action.show);
  const visibleShortcuts = shortcuts.filter((shortcut) => shortcut.show);

  return (
    <div className="space-y-6">
      {/* Primary Actions */}
      <Card variant='bordered'>
        <CardHeader title='Quick Actions' />
        <CardBody className="space-y-2">
          {visibleActions.map((action) => (
            <Link key={action.id} href={action.href} className="block">
              <Button
                variant={action.variant}
                className="w-full justify-start"
                size="sm"
              >
                <action.icon className="mr-2 h-4 w-4" />
                {action.label}
              </Button>
            </Link>
          ))}
        </CardBody>
      </Card>

      {/* Shortcuts */}
      {visibleShortcuts.length > 0 && (
        <Card variant='bordered'>
          <CardHeader title='Shortcuts' />
          
          <CardBody>
            <div className="grid grid-cols-2 gap-2">
              {visibleShortcuts.map((shortcut) => (
                <Button
                  key={shortcut.label}
                  variant="primary"
                  size="sm"
                  className="h-20 flex-col gap-1"
                  onClick={shortcut.onClick}
                  asChild={!!shortcut.href}
                >
                  {shortcut.href ? (
                    <Link href={shortcut.href}>
                      <shortcut.icon className="h-5 w-5" />
                      <span className="text-xs">{shortcut.label}</span>
                    </Link>
                  ) : (
                    <>
                      <shortcut.icon className="h-5 w-5" />
                      <span className="text-xs">{shortcut.label}</span>
                    </>
                  )}
                </Button>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Help & Support */}
      <Card variant='bordered'>
        <CardHeader title='>Need Help?' />
        
        <CardBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Get started with our guides and documentation.
          </p>
          <div className="space-y-2">
            <Link href="/help/getting-started" className="block">
              <Button variant="ghost" className="h-auto p-0 text-sm">
                Getting Started Guide <ArrowRight />
              </Button>
            </Link>
            <Link href="/help/video-tutorials" className="block">
              <Button variant="ghost" className="h-auto p-0 text-sm">
                Video Tutorials <ArrowRight />
              </Button>
            </Link>
            <Link href="/help/contact" className="block">
              <Button variant="ghost" className="h-auto p-0 text-sm">
                Contact Support <ArrowRight />
              </Button>
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}