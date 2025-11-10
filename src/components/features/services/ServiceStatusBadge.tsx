'use client';

import { ServiceStatus } from '@/app/generated/prisma';
import { Badge } from '@/components/ui';
import { SERVICE_STATUS_CONFIG } from '@/lib/service-helpers';
import { cn } from '@/lib/utils/cn';
import { createElement } from 'react';

interface ServiceStatusBadgeProps {
  status: ServiceStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  className?: string;
}

export function ServiceStatusBadge({
  status,
  size = 'md',
  showIcon = true,
  className: externalClassName,
}: ServiceStatusBadgeProps) {
  const meta = SERVICE_STATUS_CONFIG[status] || {
    label: status,
    icon: null,
    bgColor: 'bg-gray-100',
    color: 'text-gray-800',
  };

  const { label, icon: Icon, bgColor, color } = meta;

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
        bgColor,
        color,
        sizeClasses[size],
        externalClassName
      )}
      icon={
        showIcon && Icon
          ? createElement(Icon, {
              className: cn(
                size === 'sm' && 'h-3 w-3',
                size === 'md' && 'h-3.5 w-3.5',
                size === 'lg' && 'h-4 w-4'
              ),
            })
          : undefined
      }
    >
      {label}
    </Badge>
  );
}
