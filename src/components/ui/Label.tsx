/**
 * Label Component
 * Accessible form label with required indicator
 */

'use client';

import * as React from 'react';

import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils/cn';

const labelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
  {
    variants: {
      variant: {
        default: 'text-neutral-900 dark:text-neutral-100',
        error: 'text-error-600 dark:text-error-400',
        success: 'text-success-600 dark:text-success-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement>,
    VariantProps<typeof labelVariants> {
  required?: boolean;
  optional?: boolean;
  helperText?: string;
  error?: boolean;
  success?: boolean;
}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  (
    { className, variant, required, optional, helperText, error, success, children, ...props },
    ref
  ) => {
    const computedVariant = error ? 'error' : success ? 'success' : variant;

    return (
      <div className="space-y-1">
        <label
          ref={ref}
          className={cn(labelVariants({ variant: computedVariant }), className)}
          {...props}
        >
          {children}
          {required && (
            <span className="ml-1 text-error-500" aria-label="required">
              *
            </span>
          )}
          {optional && (
            <span className="ml-1 text-neutral-500 text-xs" aria-label="optional">
              (optional)
            </span>
          )}
        </label>
        {helperText && (
          <p
            className={cn(
              'text-xs',
              error
                ? 'text-error-600 dark:text-error-400'
                : success
                  ? 'text-success-600 dark:text-success-400'
                  : 'text-neutral-500 dark:text-neutral-400'
            )}
          >
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Label.displayName = 'Label';

export { Label, labelVariants };
