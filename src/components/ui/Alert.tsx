/**
 * Alert Component
 * Inline alert messages with variants
 */

import { ReactNode, isValidElement, createElement } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { LucideIcon } from 'lucide-react';

export interface AlertProps {
  variant?: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  children: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  icon?: ReactNode | LucideIcon;
  action?: ReactNode;
  className?: string;
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
}: Readonly<AlertProps>) {
  const styles = variants[variant];
  const DefaultIcon = styles.icon;

  // Handle icon rendering
  let iconElement: ReactNode;

  if (icon) {
    // If icon is already a React element, use it directly
    if (isValidElement(icon)) {
      iconElement = icon;
    }
    // If icon is a component, create an element from it
    else if (typeof icon === 'function') {
      iconElement = createElement(icon, {
        className: cn('h-5 w-5', styles.iconColor),
        'aria-hidden': true,
      });
    }
    // Otherwise, treat it as a ReactNode
    else {
      iconElement = icon;
    }
  } else {
    // Use default icon
    iconElement = <DefaultIcon className={cn('h-5 w-5', styles.iconColor)} aria-hidden="true" />;
  }

  return (
    <div role="alert" className={cn('rounded-lg p-4', styles.container, className)}>
      <div className="flex">
        <div className="shrink-0">{iconElement}</div>

        <div className="ml-3 flex-1">
          {title && <h3 className={cn('text-sm font-medium', styles.title)}>{title}</h3>}
          <div className={cn('text-sm', title ? 'mt-2' : '', styles.content)}>{children}</div>
          {action && <div className="mt-4">{action}</div>}
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
