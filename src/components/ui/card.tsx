/**
 * Card Component
 * Flexible container component with variants
 */

import { ReactNode, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';
import { Skeleton } from './Skeleton';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'bordered' | 'elevated';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  loading?: boolean;
  error?: Error | null;
  children: ReactNode;
}

export function Card({
  variant = 'default',
  padding = 'md',
  loading = false,
  error = null,
  children,
  className,
  ...props
}: CardProps) {
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  const variantClasses = {
    default: 'card',
    bordered: 'card border-2',
    elevated: 'card shadow-lg',
  };

  if (loading) {
    return (
      <div className={cn(variantClasses[variant], paddingClasses[padding], className)} {...props}>
        <CardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(variantClasses[variant], paddingClasses[padding], className)} {...props}>
        <CardError error={error} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        variantClasses[variant],
        paddingClasses[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// Card Header
interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children?: ReactNode;
}

export function CardHeader({
  title,
  subtitle,
  action,
  children,
  className,
  ...props
}: CardHeaderProps) {
  if (children) {
    return (
      <div className={cn('px-6 py-4 border-b border-neutral-200', className)} {...props}>
        {children}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center justify-between px-6 py-4 border-b border-neutral-200', className)} {...props}>
      <div>
        {title && <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>}
        {subtitle && <p className="text-sm text-neutral-600 mt-1">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// Card Body
interface CardBodyProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CardBody({ children, className, ...props }: CardBodyProps) {
  return (
    <div className={cn('p-6', className)} {...props}>
      {children}
    </div>
  );
}

// Card Footer
interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  align?: 'left' | 'center' | 'right';
}

export function CardFooter({
  children,
  align = 'right',
  className,
  ...props
}: CardFooterProps) {
  const alignClasses = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-6 py-4 border-t border-neutral-200',
        alignClasses[align],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

// Card Loading Skeleton
function CardSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-6 w-1/3 mb-2" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  );
}

// Card Error State
function CardError({ error }: { error: Error }) {
  return (
    <div className="text-center py-4">
      <p className="text-red-600 font-medium">Error loading content</p>
      <p className="text-sm text-neutral-600 mt-1">{error.message}</p>
    </div>
  );
}

// Export sub-components
Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;