/**
 * Badge Component
 * Status indicator with variants
 */

import { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface BadgeProps {
  variant?: 'active' | 'completed' | 'cancelled' | 'billed' | 'archived' | 'default';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  pulse?: boolean;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const variants = {
  active: 'badge-active',
  completed: 'badge-completed',
  cancelled: 'badge-cancelled',
  billed: 'badge-billed',
  archived: 'bg-neutral-100 text-neutral-700 border-neutral-300',
  default: 'bg-neutral-100 text-neutral-700 border-neutral-300',
};

const sizes = {
  sm: 'h-5 px-2 text-xs gap-1',
  md: 'h-6 px-3 gap-1.5',
  lg: 'h-7 px-4 text-sm gap-2',
};

export function Badge({
  variant = 'default',
  size = 'md',
  dot = false,
  pulse = false,
  icon,
  children,
  className,
}: Readonly<BadgeProps>) {
  return (
    <span className={cn('badge', variants[variant], sizes[size], className)}>
      {dot && (
        <span className="relative flex h-2 w-2">
          {pulse && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          )}
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}
