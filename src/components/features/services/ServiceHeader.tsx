// components/features/services/ServiceHeader.tsx
'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { format } from 'date-fns';
import {
  Edit,
  Copy,
  Trash2,
  CheckCircle2,
  FileText,
  MoreVertical,
  Printer,
  Share2,
  Archive,
  Mail,
} from 'lucide-react';

import type { UserRole } from '@/app/generated/prisma';
import type { DropdownMenuItem } from '@/components/ui';
import { Button, Badge, DropdownMenu } from '@/components/ui';
// import { ServiceActions } from './ServiceActions';
import { hasPermission } from '@/lib/permissions';
import { getStatusLabel, getStatusVariant } from '@/lib/service-helpers';

import { ServiceActions } from './ServiceActions';

interface ServiceHeaderProps {
  service: any;
  userRole: UserRole;
  userId: string;
}

export function ServiceHeader({ service, userRole }: ServiceHeaderProps) {
  const router = useRouter();
  const [serviceActionType, setServiceActionType] = useState<string | null>(null);
  const [showServiceAction, setShowServiceAction] = useState(false);

  const canEdit = hasPermission(userRole, 'services', 'edit');
  const canEditCompleted = hasPermission(userRole, 'services', 'edit_completed');
  const canDelete = hasPermission(userRole, 'services', 'delete');
  const canComplete = hasPermission(userRole, 'services', 'mark_completed');
  const canGenerateDocs = hasPermission(userRole, 'documents', 'export');

  const isCompleted = service.status === 'COMPLETED';
  const isCancelled = service.status === 'CANCELLED';

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `Service ${service.serviceNumber}`,
        text: `Service details for ${service.serviceNumber}`,
        url: window.location.href,
      });
    } else {
      // Fallback - copy to clipboard
      navigator.clipboard.writeText(window.location.href);
      // Show toast notification
    }
  };

  const dropdownItems: DropdownMenuItem[] = [
    {
      id: 'print',
      label: 'Print',
      icon: <Printer className="h-4 w-4" />,
      onClick: handlePrint,
    },
    {
      id: 'share',
      label: 'Share',
      icon: <Share2 className="h-4 w-4" />,
      onClick: handleShare,
    },
  ];

  if (canGenerateDocs) {
    dropdownItems.push({
      id: 'send-email',
      label: 'Send by Email',
      icon: <Mail className="h-4 w-4" />,
      onClick: () => {
        setServiceActionType('send-email');
        setShowServiceAction(true);
      },
    });
  }

  if (canComplete && !isCancelled) {
    dropdownItems.push({
      id: 'archive',
      label: 'Archive',
      icon: <Archive className="h-4 w-4" />,
      onClick: () => {
        setServiceActionType('archive');
        setShowServiceAction(true);
      },
    });
  }

  if (canDelete && !service.invoice) {
    dropdownItems.push(
      {
        id: 'divider-delete',
        divider: true,
      },
      {
        id: 'delete',
        label: 'Delete Service',
        icon: <Trash2 className="h-4 w-4" />,
        onClick: () => {
          setServiceActionType('delete');
          setShowServiceAction(true);
        },
        danger: true,
      }
    );
  }

  return (
    <div className="space-y-4 print:space-y-2">
      {/* Breadcrumbs */}
      {/* <Breadcrumbs className="print:hidden">
        <BreadcrumbItem href="/dashboard">Dashboard</BreadcrumbItem>
        <BreadcrumbItem href="/services">Services</BreadcrumbItem>
        <BreadcrumbItem current>{service.serviceNumber}</BreadcrumbItem>
      </Breadcrumbs> */}

      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border p-6 print:shadow-none print:border-0">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          {/* Service Info */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-neutral-900">{service.serviceNumber}</h1>
              <Badge variant={getStatusVariant(service.status)} size="lg">
                {getStatusLabel(service.status)}
              </Badge>
              {service.urgent && (
                <Badge variant="cancelled" size="lg">
                  Urgent
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{format(new Date(service.date), 'PPP')}</span>
              <span>•</span>
              <span>{service.client.name}</span>
              <span>•</span>
              <span>{service.supplier.name}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 print:hidden">
            {/* Primary Actions */}
            {canEdit && (!isCompleted || canEditCompleted) && !isCancelled && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/services/${service.id}/edit`)}
                icon={<Edit className="h-4 w-4 mr-2" />}
              >
                Edit
              </Button>
            )}

            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => router.push(`/services/new?duplicate=${service.id}`)}
                icon={<Copy className="h-4 w-4 mr-2" />}
              >
                Duplicate
              </Button>
            )}

            {canComplete && !isCompleted && !isCancelled && (
              <ServiceActions
                service={service}
                action="complete"
                trigger={
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<CheckCircle2 className="h-4 w-4 mr-2" />}
                  >
                    Complete
                  </Button>
                }
              />
            )}

            {canGenerateDocs && (
              <ServiceActions
                service={service}
                action="generate-loading-order"
                trigger={
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<FileText className="h-4 w-4 mr-2" />}
                  >
                    Loading Order
                  </Button>
                }
              />
            )}

            {/* More Actions Dropdown */}
            <DropdownMenu
              trigger={
                <Button variant="secondary" size="sm" icon={<MoreVertical className="h-4 w-4" />} />
              }
              items={dropdownItems}
              align="right"
            />

            {/* Hidden ServiceActions modal trigger */}
            {showServiceAction && serviceActionType && (
              <ServiceActions
                service={service}
                action={serviceActionType as any}
                trigger={<span className="hidden" />}
                onSuccess={() => {
                  setShowServiceAction(false);
                  setServiceActionType(null);
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
