import { DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { UserRole, ServiceStatus } from '@/app/generated/prisma';
import { hasPermission } from '@/lib/permissions';
import {
  Edit2,
  Copy,
  Trash2,
  Eye,
  CheckCircle2,
  RotateCcw,
  Clock,
  AlertCircle,
  Truck,
  CheckCircle,
  XCircle,
  FileText,
  Archive,
} from 'lucide-react';
import { ServiceData } from '@/types/service';
import { createElement, JSX } from 'react';

interface Handlers {
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMarkCompleted?: () => void;
  onReopen?: () => void;
}

const icons = {
  view: createElement(Eye, { className: 'h-4 w-4' }),
  edit: createElement(Edit2, { className: "h-4 w-4" }),
  copy: createElement(Copy, { className: "h-4 w-4" }),
  delete: createElement(Trash2, { className: "h-4 w-4" }),
  complete: createElement(CheckCircle2, { className: "h-4 w-4" }),
  reopen: createElement(RotateCcw, { className: "h-4 w-4" }),
};

const SERVICE_STATUS_META: Record<ServiceStatus, {
  label: string;
  color: string;
  description: string;
  variant: 'active' | 'completed' | 'cancelled' | 'billed' | 'default';
  icon: React.ElementType;
}> = {
  [ServiceStatus.DRAFT]: { label: 'Draft', color: 'secondary', description: 'Service is being prepared', variant: 'default', icon: Clock },
  [ServiceStatus.CONFIRMED]: { label: 'Confirmed', color: 'warning', description: 'Service has been confirmed', variant: 'active', icon: AlertCircle },
  [ServiceStatus.IN_PROGRESS]: { label: 'In Progress', color: 'warning', description: 'Service is currently in progress', variant: 'active', icon: Truck },
  [ServiceStatus.COMPLETED]: { label: 'Completed', color: 'success', description: 'Service has been completed', variant: 'completed', icon: CheckCircle },
  [ServiceStatus.CANCELLED]: { label: 'Cancelled', color: 'danger', description: 'Service was cancelled', variant: 'cancelled', icon: XCircle },
  [ServiceStatus.INVOICED]: { label: 'Invoiced', color: 'neutral', description: 'Service has been invoiced', variant: 'billed', icon: FileText },
  [ServiceStatus.ARCHIVED]: { label: 'Archived', color: 'neutral', description: 'Service has been archived', variant: 'billed', icon: Archive },
};

export const getStatusColor = (s: ServiceStatus) => SERVICE_STATUS_META[s]?.color || 'secondary';
export const getStatusLabel = (s: ServiceStatus) => SERVICE_STATUS_META[s]?.label || s;
export const getStatusDescription = (s: ServiceStatus) => SERVICE_STATUS_META[s]?.description || 'Unknown status';
export const getStatusVariant = (s: ServiceStatus) => SERVICE_STATUS_META[s]?.variant || 'default';
export function getStatusIcon(s: ServiceStatus): JSX.Element {
  const IconComponent = SERVICE_STATUS_META[s]?.icon || AlertCircle;
  return createElement(IconComponent, { className: "h-3 w-3" });
}

/**
 * Dynamically builds a dropdown menu for a service row
 * based on user permissions and service context (status, etc.)
 */
export function buildServiceActionsMenu(
  service: ServiceData,
  userRole: UserRole,
  handlers: Handlers
): DropdownMenuItem[] {
  const canEdit = hasPermission(userRole, 'services', 'edit');
  const canDelete = hasPermission(userRole, 'services', 'delete');

  const isCompleted = service.status === ServiceStatus.COMPLETED;
  const isCancelled = service.status === ServiceStatus.CANCELLED;

  const items: DropdownMenuItem[] = [
    {
      id: 'view',
      label: 'View Details',
      icon: icons.view,
      onClick: handlers.onView,
      tooltip: 'View full service details',
    },
  ];

  // ---- Conditional editing options ----
  if (canEdit) {
    const editDisabled = isCompleted || isCancelled;

    items.push({
      id: 'edit-group',
      label: 'Modify',
      icon: icons.edit,
      tooltip: editDisabled
        ? 'Editing disabled for finalized services'
        : 'Edit or duplicate this service',
      disabled: editDisabled,
      submenu: [
        {
          id: 'edit',
          label: 'Edit Service',
          icon: icons.edit,
          onClick: handlers.onEdit,
          disabled: editDisabled,
        },
        {
          id: 'duplicate',
          label: 'Duplicate Service',
          icon: icons.copy,
          onClick: handlers.onDuplicate,
        },
      ],
    });

    if (!isCompleted && handlers.onMarkCompleted) {
      items.push({
        id: 'complete',
        label: 'Mark as Completed',
        icon: icons.complete,
        onClick: handlers.onMarkCompleted,
        tooltip: 'Set this service as completed',
      });
    } else if (isCompleted && handlers.onReopen) {
      items.push({
        id: 'reopen',
        label: 'Reopen Service',
        icon: icons.reopen,
        onClick: handlers.onReopen,
        tooltip: 'Reopen this completed service for editing',
      });
    }
  }

  // ---- Deletion options ----
  if (canDelete) {
    items.push({ id: 'divider', divider: true, });
    items.push({
      id: 'delete',
      label: 'Delete Service',
      icon: icons.delete,
      onClick: handlers.onDelete,
      danger: true,
      tooltip: 'Permanently delete this service',
    });
  }

  return items;
}
