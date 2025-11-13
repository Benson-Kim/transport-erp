/**
 * ErrorState Component
 * Error display with retry functionality
 */

import { AlertTriangle, RefreshCw, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Alert, Button } from '@/components/ui';

export interface ErrorStateProps {
  error?: Error | string | null;
  title?: string;
  description?: string;
  onRetry?: () => void;
  variant?: 'inline' | 'full' | 'card';
  className?: string;
}

export function ErrorState({
  error,
  title = 'An error occurred',
  description,
  onRetry,
  variant = 'full',
  className,
}: ErrorStateProps) {
  const errorMessage = error
    ? typeof error === 'string'
      ? error
      : error.message
    : description || 'Something went wrong. Please try again.';

  if (variant === 'inline') {
    return (
      <Alert variant="error" title={title} dismissible={false} className={className ?? ''}>
        <p>{errorMessage}</p>
        {onRetry && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onRetry}
            icon={<RefreshCw size={14} />}
            className="mt-3"
          >
            Try Again
          </Button>
        )}
      </Alert>
    );
  }

  if (variant === 'card') {
    return (
      <div className={cn('card p-6', className)}>
        <div className="flex items-start gap-4">
          <div className="text-red-500">
            <XCircle size={24} />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-neutral-900 mb-1">{title}</h3>
            <p className="text-sm text-neutral-600">{errorMessage}</p>
            {onRetry && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onRetry}
                icon={<RefreshCw size={14} />}
                className="mt-4"
              >
                Try Again
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Full variant (default)
  return (
    <div
      className={cn('flex flex-col items-center justify-center py-12 px-6 text-center', className)}
    >
      <div className="text-red-500 mb-4">
        <AlertTriangle size={48} />
      </div>

      <h3 className="text-lg font-medium text-neutral-900 mb-2">{title}</h3>

      <p className="text-sm text-neutral-600 mb-6 max-w-md">{errorMessage}</p>

      {onRetry && (
        <Button onClick={onRetry} variant="secondary" icon={<RefreshCw size={16} />}>
          Try Again
        </Button>
      )}
    </div>
  );
}
