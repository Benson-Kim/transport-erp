'use client';

import type { ServiceStatus } from '@/app/generated/prisma';
import { Badge } from '@/components/ui';
import { getStatusConfig } from '@/lib/service-helpers';
import { cn } from '@/lib/utils/cn';

interface ServiceStatusBadgeProps {
  status: ServiceStatus;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
}

export function ServiceStatusBadge({
  status,
  size = 'md',
  showIcon = true,
  dot = false,
  pulse = false,
  className,
}: Readonly<ServiceStatusBadgeProps>) {
  const config = getStatusConfig(status);

  if (!config) {
    return (
      <Badge variant="default" size={size} className={className ?? ''}>
        {status}
      </Badge>
    );
  }

  const Icon = config.icon;
  const iconElement =
    showIcon && Icon ? (
      <Icon
        className={cn(
          size === 'sm' && 'h-3 w-3',
          size === 'md' && 'h-3.5 w-3.5',
          size === 'lg' && 'h-4 w-4'
        )}
      />
    ) : undefined;
  return (
    <Badge
      variant={config.variant}
      size={size}
      icon={iconElement}
      dot={dot}
      pulse={pulse}
      className={className ?? ''}
    >
      {config.label}
    </Badge>
  );
}
