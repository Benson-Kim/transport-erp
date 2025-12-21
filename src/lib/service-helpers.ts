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
import { designTokens } from './design-tokens';

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
  edit: createElement(Edit2, { className: 'h-4 w-4' }),
  copy: createElement(Copy, { className: 'h-4 w-4' }),
  delete: createElement(Trash2, { className: 'h-4 w-4' }),
  complete: createElement(CheckCircle2, { className: 'h-4 w-4' }),
  reopen: createElement(RotateCcw, { className: 'h-4 w-4' }),
};

export const SERVICE_STATUS_CONFIG: Record<
  ServiceStatus,
  {
    label: string;
    colors: {
      text: string;
      bg: string;
      border: string;
    };
    description: string;
    variant: 'active' | 'completed' | 'cancelled' | 'billed' | 'archived' | 'default';
    icon: React.ElementType;
  }
> = {
  [ServiceStatus.DRAFT]: {
    label: 'Draft',
    colors: {
      bg: designTokens.colors.neutral[100],
      text: designTokens.colors.neutral[600],
      border: designTokens.colors.neutral[300],
    },
    description: 'Service is being prepared',
    variant: 'default',
    icon: Clock,
  },
  [ServiceStatus.CONFIRMED]: {
    label: 'Confirmed',
    colors: {
      bg: designTokens.colors.status.active.bg,
      text: designTokens.colors.status.active.text,
      border: designTokens.colors.status.active.border,
    },
    description: 'Service has been confirmed',
    variant: 'active',
    icon: AlertCircle,
  },
  [ServiceStatus.IN_PROGRESS]: {
    label: 'In Progress',
    colors: {
      bg: designTokens.colors.feedback.warning.bg,
      text: designTokens.colors.feedback.warning.text,
      border: designTokens.colors.feedback.warning.border,
    },
    description: 'Service is currently in progress',
    variant: 'active',
    icon: Truck,
  },
  [ServiceStatus.COMPLETED]: {
    label: 'Completed',
    colors: {
      bg: designTokens.colors.status.completed.bg,
      text: designTokens.colors.status.completed.text,
      border: designTokens.colors.status.completed.border,
    },
    description: 'Service has been completed',
    variant: 'completed',
    icon: CheckCircle,
  },
  [ServiceStatus.CANCELLED]: {
    label: 'Cancelled',
    colors: {
      bg: designTokens.colors.status.cancelled.bg,
      text: designTokens.colors.status.cancelled.text,
      border: designTokens.colors.status.cancelled.border,
    },
    description: 'Service was cancelled',
    variant: 'cancelled',
    icon: XCircle,
  },
  [ServiceStatus.INVOICED]: {
    label: 'Invoiced',
    colors: {
      bg: designTokens.colors.status.billed.bg,
      text: designTokens.colors.status.billed.text,
      border: designTokens.colors.status.billed.border,
    },
    description: 'Service has been invoiced',
    variant: 'billed',
    icon: FileText,
  },
  [ServiceStatus.ARCHIVED]: {
    label: 'Archived',
    colors: {
      bg: designTokens.colors.neutral[200],
      text: designTokens.colors.neutral[600],
      border: designTokens.colors.neutral[400],
    },
    description: 'Service has been archived',
    variant: 'archived',
    icon: Archive,
  },
};

export const getStatusConfig = (s: ServiceStatus) => SERVICE_STATUS_CONFIG[s];
export const getStatusVariant = (s: ServiceStatus) =>
  SERVICE_STATUS_CONFIG[s]?.variant ?? 'default';
export const getStatusLabel = (s: ServiceStatus) => SERVICE_STATUS_CONFIG[s]?.label ?? s;
export const getStatusDescription = (s: ServiceStatus) =>
  SERVICE_STATUS_CONFIG[s]?.description ?? 'Unknown status';
export function getStatusIcon(s: ServiceStatus): JSX.Element {
  const IconComponent = SERVICE_STATUS_CONFIG[s]?.icon || AlertCircle;
  return createElement(IconComponent, { className: 'h-3 w-3' });
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
    items.push({ id: 'divider', divider: true });
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

export const STATUS_URL_MAP: Record<string, ServiceStatus | undefined> = {
  draft: ServiceStatus.DRAFT,
  confirmed: ServiceStatus.CONFIRMED,
  in_progress: ServiceStatus.IN_PROGRESS,
  completed: ServiceStatus.COMPLETED,
  cancelled: ServiceStatus.CANCELLED,
  invoiced: ServiceStatus.INVOICED,
  archived: ServiceStatus.ARCHIVED,
};

export const STATUS_LABEL_MAP: Record<ServiceStatus, string> = {
  [ServiceStatus.DRAFT]: 'Draft',
  [ServiceStatus.CONFIRMED]: 'Confirmed',
  [ServiceStatus.IN_PROGRESS]: 'In Progress',
  [ServiceStatus.COMPLETED]: 'Completed',
  [ServiceStatus.CANCELLED]: 'Cancelled',
  [ServiceStatus.INVOICED]: 'Invoiced',
  [ServiceStatus.ARCHIVED]: 'Archived',
};
