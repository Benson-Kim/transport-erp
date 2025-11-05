/**
 * Badge Component
 * Small status indicators
 */

'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200',
        secondary:
          'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200',
        success:
          'bg-success-100 text-success-800 dark:bg-success-900 dark:text-success-200',
        destructive:
          'bg-error-100 text-error-800 dark:bg-error-900 dark:text-error-200',
        warning:
          'bg-warning-100 text-warning-800 dark:bg-warning-900 dark:text-warning-200',
        info:
          'bg-info-100 text-info-800 dark:bg-info-900 dark:text-info-200',
        outline:
          'border border-current text-neutral-800 dark:text-neutral-200',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };