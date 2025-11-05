/**
 * Alert Component
 * Accessible alert messages with variants
 */

'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils/cn';
import { 
  AlertCircle, 
  CheckCircle2, 
  Info, 
  XCircle, 
  X 
} from 'lucide-react';

const alertVariants = cva(
  'relative w-full rounded-lg border p-4',
  {
    variants: {
      variant: {
        default: 'bg-white border-neutral-200 dark:bg-neutral-950 dark:border-neutral-800',
        info: 'bg-info-50 border-info-200 text-info-800 dark:bg-info-950 dark:border-info-800 dark:text-info-200',
        success: 'bg-success-50 border-success-200 text-success-800 dark:bg-success-950 dark:border-success-800 dark:text-success-200',
        warning: 'bg-warning-50 border-warning-200 text-warning-800 dark:bg-warning-950 dark:border-warning-800 dark:text-warning-200',
        destructive: 'bg-error-50 border-error-200 text-error-800 dark:bg-error-950 dark:border-error-800 dark:text-error-200',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & 
    VariantProps<typeof alertVariants> & {
      onClose?: () => void;
      icon?: React.ReactNode;
    }
>(({ className, variant, children, onClose, icon, ...props }, ref) => {
  const defaultIcons = {
    info: <Info className="h-4 w-4" />,
    success: <CheckCircle2 className="h-4 w-4" />,
    warning: <AlertCircle className="h-4 w-4" />,
    destructive: <XCircle className="h-4 w-4" />,
    default: null,
  };

  const displayIcon = icon !== undefined ? icon : defaultIcons[variant || 'default'];

  return (
    <div
      ref={ref}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      <div className="flex">
        {displayIcon && (
          <div className="shrink-0 mr-3">{displayIcon}</div>
        )}
        <div className="flex-1">{children}</div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto -mr-1.5 -mt-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-offset-2"
            aria-label="Close alert"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
});

Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn('mb-1 font-medium leading-none tracking-tight', className)}
    {...props}
  />
));

AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('text-sm [&_p]:leading-relaxed', className)}
    {...props}
  />
));

AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription, alertVariants };