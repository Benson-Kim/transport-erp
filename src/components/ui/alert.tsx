/**
 * Alert Component
 * Inline alert messages with variants
 */

import { ElementType, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface AlertProps {
  variant?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  children: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
 icon?: ReactNode | ElementType;
  action?: ReactNode;
  className?: string | undefined;
}

const variants = {
  success: {
    container: 'bg-feedback-success-bg border border-feedback-success-border',
    icon: CheckCircle,
    iconColor: 'text-feedback-success-text',
    title: 'text-feedback-success-text',
    content: 'text-green-700',
  },
  error: {
    container: 'bg-feedback-error-bg border border-feedback-error-border',
    icon: AlertCircle,
    iconColor: 'text-feedback-error-text',
    title: 'text-feedback-error-text',
    content: 'text-red-700',
  },
  warning: {
    container: 'bg-feedback-warning-bg border border-feedback-warning-border',
    icon: AlertTriangle,
    iconColor: 'text-feedback-warning-text',
    title: 'text-feedback-warning-text',
    content: 'text-yellow-700',
  },
  info: {
    container: 'bg-feedback-info-bg border border-feedback-info-border',
    icon: Info,
    iconColor: 'text-feedback-info-text',
    title: 'text-feedback-info-text',
    content: 'text-blue-700',
  },
};

export function Alert({
  variant = 'info',
  title,
  children,
  dismissible = false,
  onDismiss,
  icon,
  action,
  className,
}: AlertProps) {
  const styles = variants[variant];
 const DefaultIcon = styles.icon;

  const RenderedIcon =
    typeof icon === 'function' || typeof icon === 'object'
      ? icon
      : DefaultIcon;

  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg p-4',
        styles.container,
        className
      )}
    >
      <div className="flex">
        <div className="flex-shrink-0">
          {typeof RenderedIcon === 'function' ? (
            <RenderedIcon className={cn('h-5 w-5', styles.iconColor)} aria-hidden="true" />
          ) : (
            RenderedIcon
          )}
        </div>
        
        <div className="ml-3 flex-1">
          {title && (
            <h3 className={cn('text-sm font-medium', styles.title)}>
              {title}
            </h3>
          )}
          <div className={cn(
            'text-sm',
            title ? 'mt-2' : '',
            styles.content
          )}>
            {children}
          </div>
          {action && (
            <div className="mt-4">
              {action}
            </div>
          )}
        </div>
        
        {dismissible && onDismiss && (
          <div className="ml-auto pl-3">
            <button
              onClick={onDismiss}
              className={cn(
                'inline-flex rounded-md p-1.5',
                'hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-offset-2',
                variant === 'success' && 'focus:ring-green-500',
                variant === 'error' && 'focus:ring-red-500',
                variant === 'warning' && 'focus:ring-yellow-500',
                variant === 'info' && 'focus:ring-blue-500'
              )}
              aria-label="Dismiss"
            >
              <X className={cn('h-5 w-5', styles.iconColor)} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}