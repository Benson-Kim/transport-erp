// components/features/services/ServiceRow.tsx
'use client';

import { memo } from 'react';

import { useRouter } from 'next/navigation';

import {
  Eye,
  Edit,
  Copy,
  Trash2,
  FileText,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  Users,
  Building2,
  MapPin,
  Receipt,
  Truck,
  Calendar,
} from 'lucide-react';

import { deleteService } from '@/actions/service-actions';
import type { UserRole } from '@/app/generated/prisma';
import { ServiceStatus } from '@/app/generated/prisma';
import { Button, DropdownMenu, Tooltip, Checkbox, Amount } from '@/components/ui';
import { hasPermission } from '@/lib/permissions';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/date-formats';
import { formatCurrency, formatPercentage } from '@/lib/utils/formatting';
import type { ServiceData } from '@/types/service';

import { ServiceStatusBadge } from './ServiceStatusBadge';

interface ServiceRowProps {
  service: ServiceData;
  index: number;
  isSelected: boolean;
  isHovered: boolean;
  isExpanded: boolean;
  onSelect: (event: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onToggleExpand: () => void;
  userRole: UserRole;
  style?: React.CSSProperties;
}

export const ServiceRow = memo(
  ({
    service,
    index,
    isSelected,
    isHovered,
    isExpanded,
    onSelect,
    onMouseEnter,
    onMouseLeave,
    onToggleExpand,
    userRole,
    style,
  }: ServiceRowProps) => {
    const router = useRouter();

    // Permissions
    const canEdit = hasPermission(userRole, 'services', 'edit');
    const canDelete = hasPermission(userRole, 'services', 'delete');
    const canViewDetails = hasPermission(userRole, 'services', 'view');
    const canGenerateInvoice = hasPermission(userRole, 'invoices', 'create');
    const canGenerateLoadingOrder = hasPermission(userRole, 'loading_orders', 'create');

    // Calculations
    const marginPercent = service.saleAmount > 0 ? (service.margin / service.saleAmount) * 100 : 0;

    // Actions
    const handleRowClick = (e: React.MouseEvent) => {
      // Don't navigate if clicking on checkbox or actions
      if ((e.target as HTMLElement).closest('[data-no-row-click]')) return;

      if (canViewDetails) {
        router.push(`/services/${service.id}`);
      }
    };

    const handleEdit = () => router.push(`/services/${service.id}/edit`);
    const handleDuplicate = () => router.push(`/services/new?duplicate=${service.id}`);

    const handleDelete = async () => {
      if (!confirm('Are you sure you want to delete this service?')) return;

      try {
        await deleteService(service.id);
        toast.success('Service deleted successfully');
        router.refresh();
      } catch (error) {
        console.log(error);
        toast.error('Failed to delete service');
      }
    };

    const handleGenerateInvoice = () => {
      if (service.status !== ServiceStatus.COMPLETED) {
        toast.error('Service must be completed to generate invoice');
        return;
      }
      router.push(`/invoices/new?serviceId=${service.id}`);
    };

    const handleGenerateLoadingOrder = () => {
      router.push(`/loading-orders/new?serviceId=${service.id}`);
    };

    // Build dropdown menu items
    const menuItems = [
      canViewDetails && {
        id: 'view',
        label: 'View Details',
        icon: <Eye className="h-4 w-4" />,
        onClick: () => router.push(`/services/${service.id}`),
      },
      canEdit && {
        id: 'edit',
        label: 'Edit',
        icon: <Edit className="h-4 w-4" />,
        onClick: handleEdit,
      },
      {
        id: 'duplicate',
        label: 'Duplicate',
        icon: <Copy className="h-4 w-4" />,
        onClick: handleDuplicate,
      },
      { id: 'divider-1', divider: true },
      canGenerateInvoice && {
        id: 'invoice',
        label: 'Generate Invoice',
        icon: <Receipt className="h-4 w-4" />,
        onClick: handleGenerateInvoice,
        disabled: service.status !== ServiceStatus.COMPLETED,
        tooltip:
          service.status === ServiceStatus.COMPLETED
            ? undefined
            : 'Service must be completed first',
      },
      canGenerateLoadingOrder && {
        id: 'loadingOrder',
        label: 'Generate Loading Order',
        icon: <FileText className="h-4 w-4" />,
        onClick: handleGenerateLoadingOrder,
      },
      canDelete && { id: 'divider-2', divider: true },
      canDelete && {
        id: 'delete',
        label: 'Delete',
        icon: <Trash2 className="h-4 w-4" />,
        onClick: handleDelete,
        danger: true,
      },
    ].filter(Boolean);

    return (
      <>
        <tr
          className={cn(
            'border-b transition-colors cursor-pointer group',
            isSelected && 'bg-primary/5',
            isHovered && !isSelected && 'bg-muted/50',
            index % 2 === 1 &&
              !isSelected &&
              !isHovered &&
              'bg-neutral-50/50 dark:bg-neutral-900/50'
          )}
          onClick={handleRowClick}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          style={style}
        >
          {/* Checkbox */}
          <td
            className="sticky left-0 z-10 bg-white dark:bg-neutral-950 p-3 w-12"
            data-no-row-click
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => {}}
              onClick={onSelect}
              aria-label={`Select service ${service.serviceNumber}`}
            />
          </td>

          {/* Service Number */}
          <td className="sticky left-12 z-10 bg-white dark:bg-neutral-950 p-3">
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand();
                }}
                className="p-0.5 hover:bg-neutral-100 rounded transition-colors"
                data-no-row-click
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
              <Tooltip content={`View service ${service.serviceNumber}`}>
                <span className="font-medium text-primary hover:underline">
                  {service.serviceNumber}
                </span>
              </Tooltip>
            </div>
          </td>

          {/* Date */}
          <td className="p-3">
            <Tooltip content={formatDate.relative(service.date)}>
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span className="text-sm">{formatDate.dayMonth(service.date)}</span>
              </div>
            </Tooltip>
          </td>

          {/* Client */}
          <td className="p-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium truncate max-w-[150px]">
                  {service.clientName}
                </div>
                <div className="text-xs text-muted-foreground">{service.clientCode}</div>
              </div>
            </div>
          </td>

          {/* Supplier */}
          <td className="p-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium truncate max-w-[150px]">
                  {service.supplierName}
                </div>
                <div className="text-xs text-muted-foreground">{service.supplierCode}</div>
              </div>
            </div>
          </td>

          {/* Driver */}
          <td className="p-3">
            <div className="flex items-center gap-1.5">
              <Truck className="h-3 w-3 text-muted-foreground" />
              <span className="text-sm">
                {service.driverName || (
                  <span className="text-muted-foreground italic">Not assigned</span>
                )}
              </span>
            </div>
          </td>

          {/* Registration */}
          <td className="p-3">
            <span className="text-sm font-mono">{service.vehiclePlate || '-'}</span>
          </td>

          {/* Cost */}
          <td className="p-3 text-right">
            <Tooltip content="Service cost">
              <span className="text-sm font-medium tabular-nums">
                {formatCurrency(service.costAmount)}
              </span>
            </Tooltip>
          </td>

          {/* Sale */}
          <td className="p-3 text-right">
            <Tooltip content="Sale price">
              <span className="text-sm font-medium tabular-nums">
                <Amount value={service.saleAmount} />
              </span>
            </Tooltip>
          </td>

          {/* Margin */}
          <td className="p-3 text-right">
            <div className="flex flex-col items-end gap-0.5">
              <span>
                {' '}
                <Amount value={service.margin} />{' '}
              </span>
              <span
                className={cn(
                  'text-xs tabular-nums',
                  marginPercent >= 0 ? 'text-green-600/70' : 'text-red-600/70'
                )}
              >
                {formatPercentage(marginPercent)}
              </span>
            </div>
          </td>

          {/* Status */}
          <td className="p-3 text-center">
            <ServiceStatusBadge status={service.status} size="sm" />
          </td>

          {/* Actions */}
          <td className="p-3 text-center" data-no-row-click>
            <DropdownMenu
              trigger={
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              }
              align="right"
              items={menuItems as any}
            />
          </td>
        </tr>

        {/* Expanded Row Details */}
        {isExpanded && (
          <tr className="bg-neutral-50 dark:bg-neutral-900">
            <td colSpan={13} className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <h4 className="font-medium text-sm mb-2">Route Details</h4>
                  <dl className="space-y-1 text-sm">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3 w-3 text-muted-foreground mt-0.5" />
                      <div>
                        <dt className="text-xs text-muted-foreground">Origin → Destination</dt>
                        <dd className="font-medium">
                          {service.origin} → {service.destination}
                        </dd>
                      </div>
                    </div>
                  </dl>
                </div>

                <div>
                  <h4 className="font-medium text-sm mb-2">Financial</h4>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Cost:</dt>
                      <dd> {formatCurrency(service.costAmount)} </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Sale:</dt>
                      <dd>
                        {' '}
                        <Amount value={service.saleAmount} />
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Margin:</dt>
                      <dd>
                        {' '}
                        <Amount value={service.margin} />
                        <span
                          className={cn(
                            'font-medium',
                            service.margin >= 0 ? 'text-green-600' : 'text-red-600'
                          )}
                        >
                          ({formatPercentage(marginPercent)})
                        </span>
                      </dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h4 className="font-medium text-sm mb-2">Timestamps</h4>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Created:</dt>
                      <dd>{service.createdAt && formatDate.dateTime(service.createdAt)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Updated:</dt>
                      <dd>{service.updatedAt && formatDate.dateTime(service.updatedAt)}</dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h4 className="font-medium text-sm mb-2">Quick Actions</h4>
                  <div className="flex flex-wrap gap-2">
                    {canEdit && (
                      <Button size="sm" variant="secondary" onClick={handleEdit}>
                        Edit
                      </Button>
                    )}
                    {canGenerateInvoice && service.status === ServiceStatus.COMPLETED && (
                      <Button size="sm" variant="secondary" onClick={handleGenerateInvoice}>
                        Invoice
                      </Button>
                    )}
                    {canGenerateLoadingOrder && (
                      <Button size="sm" variant="secondary" onClick={handleGenerateLoadingOrder}>
                        Loading Order
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </td>
          </tr>
        )}
      </>
    );
  }
);
