import { DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { ServiceStatus, UserRole } from '@prisma/client';
import { hasPermission } from '@/lib/permissions';
import {
  Edit2,
  Copy,
  Trash2,
  Eye,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { ServiceData } from '@/types/service';
import { createElement } from 'react';

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
  edit: createElement(Edit2, { className: "h-4 w-4"}),
  copy: createElement(Copy, { className: "h-4 w-4"}),
  delete: createElement(Trash2, { className: "h-4 w-4"}),
  complete: createElement(CheckCircle2, { className: "h-4 w-4"}),
  reopen: createElement(RotateCcw, { className: "h-4 w-4"}),
};


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

  // Basic rule logic

  const isCompleted = service.status === ServiceStatus.COMPLETED;
const isCancelled = service.status === ServiceStatus.CANCELLED;
const isArchived = service.status === ServiceStatus.INVOICED;


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
    const editDisabled = isCompleted || isCancelled || isArchived;

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
          disabled: isArchived,
        },
      ],
    });
  }

  // ---- Optional workflow actions ----
  if (canEdit && !isArchived) {
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
        icon:icons.reopen,
        onClick: handlers.onReopen,
        tooltip: 'Reopen this completed service for editing',
      });
    }
  }

  // ---- Deletion options ----
  if (canDelete) {
    items.push({ id: 'divider', divider: true, label:'' });
    items.push({
      id: 'delete',
      label: 'Delete Service',
      icon: icons.delete,
      onClick: handlers.onDelete,
      danger: true,
      tooltip: isArchived
        ? 'Archived services cannot be deleted'
        : 'Permanently delete this service',
      disabled: isArchived,
    });
  }

  return items;
}
