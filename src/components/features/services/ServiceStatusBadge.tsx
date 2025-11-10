/**
 * Service Status Badge Component
 * Visual indicator for service status
 */

'use client';

import { ServiceStatus } from '@/app/generated/prisma';
import { 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  XCircle,
  Truck,
  Receipt,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui';

interface ServiceStatusBadgeProps {
  status: ServiceStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export function ServiceStatusBadge({ 
  status, 
  size = 'md',
  showIcon = true 
}: ServiceStatusBadgeProps) {
  const config = {
    DRAFT: {
      label: 'Draft',
      icon: FileText,
      className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
    },
    CONFIRMED: {
      label: 'Confirmed',
      icon: AlertCircle,
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    },
    IN_PROGRESS: {
      label: 'In Progress',
      icon: Truck,
      className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    },
    COMPLETED: {
      label: 'Completed',
      icon: CheckCircle,
      className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    },
    INVOICED: {
      label: 'Invoiced',
      icon: Receipt,
      className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    },
    CANCELLED: {
      label: 'Cancelled',
      icon: XCircle,
      className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    },
  };

  const { label, icon: Icon, className } = config[status];

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-0.5',
    lg: 'text-base px-3 py-1',
  };

  return (
    <Badge
      variant="active"
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        className,
        sizeClasses[size]
      )}
      icon={showIcon && <Icon className={cn(
        size === 'sm' && 'h-3 w-3',
        size === 'md' && 'h-3.5 w-3.5',
        size === 'lg' && 'h-4 w-4'
      )} />}
    >
      {label}
    </Badge>
  );
}