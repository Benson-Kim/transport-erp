/**
 * Input Component
 * Accessible form input with error states
 */

'use client';

import * as React from 'react';
import { cn } from '@/lib/utils/cn';
import { cva, type VariantProps } from 'class-variance-authority';

const inputVariants = cva(
  'flex w-full rounded-md border bg-background text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border-neutral-300 focus-visible:ring-primary-500 dark:border-neutral-700',
        error:
          'border-error-500 focus-visible:ring-error-500 dark:border-error-500',
        success:
          'border-success-500 focus-visible:ring-success-500 dark:border-success-500',
      },
      inputSize: {
        default: 'h-10 px-3 py-2',
        sm: 'h-9 px-2.5 py-1.5 text-xs',
        lg: 'h-11 px-4 py-3',
        xl: 'h-12 px-4 py-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      inputSize: 'default',
    },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  error?: boolean;
  success?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = 'text',
      variant,
      inputSize,
      error,
      success,
      leftIcon,
      rightIcon,
      leftAddon,
      rightAddon,
      ...props
    },
    ref
  ) => {
    const computedVariant = error ? 'error' : success ? 'success' : variant;
    
    const input = (
      <input
        type={type}
        className={cn(
          inputVariants({ variant: computedVariant, inputSize }),
          leftIcon && 'pl-10',
          rightIcon && 'pr-10',
          className
        )}
        ref={ref}
        aria-invalid={error ? 'true' : 'false'}
        {...props}
      />
    );

    if (leftIcon || rightIcon || leftAddon || rightAddon) {
      return (
        <div className="relative flex items-center">
          {leftAddon && (
            <span className="flex h-10 items-center rounded-l-md border border-r-0 border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
              {leftAddon}
            </span>
          )}
          {leftIcon && (
            <span className="pointer-events-none absolute left-3 flex items-center text-neutral-500 dark:text-neutral-400">
              {leftIcon}
            </span>
          )}
          {input}
          {rightIcon && (
            <span className="pointer-events-none absolute right-3 flex items-center text-neutral-500 dark:text-neutral-400">
              {rightIcon}
            </span>
          )}
          {rightAddon && (
            <span className="flex h-10 items-center rounded-r-md border border-l-0 border-neutral-300 bg-neutral-50 px-3 text-sm text-neutral-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
              {rightAddon}
            </span>
          )}
        </div>
      );
    }

    return input;
  }
);

Input.displayName = 'Input';

export { Input, inputVariants };