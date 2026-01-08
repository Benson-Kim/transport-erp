/**
 * Toast Component
 * Notification toast with auto-dismiss and animations
 */

'use client';
import { useEffect, useState } from 'react';

import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils/cn';

export interface ToastProps {
  id: string;
  title: string;
  description?: string;
  variant?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  onClose: (id: string) => void;
}

const variants = {
  success: {
    icon: CheckCircle,
    className: 'bg-white border-l-4 border-l-green-500',
    iconColor: 'text-green-500',
  },
  error: {
    icon: AlertCircle,
    className: 'bg-white border-l-4 border-l-red-500',
    iconColor: 'text-red-500',
  },
  warning: {
    icon: AlertTriangle,
    className: 'bg-white border-l-4 border-l-yellow-500',
    iconColor: 'text-yellow-500',
  },
  info: {
    icon: Info,
    className: 'bg-white border-l-4 border-l-blue-500',
    iconColor: 'text-blue-500',
  },
};

export function Toast({
  id,
  title,
  description,
  variant = 'info',
  duration = 5000,
  action,
  onClose,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const { icon: Icon, className, iconColor } = variants[variant];

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));

    if (duration <= 0) return undefined;

    const timer = setTimeout(() => handleClose(), duration);
    return () => clearTimeout(timer);
  }, [duration]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(() => {
      onClose(id);
    }, 200);
  };

  return createPortal(
    <div
      role="alert"
      aria-live="polite"
      className={cn(
        'pointer-events-auto w-full max-w-sm rounded-lg shadow-lg',
        'transform transition-all duration-200 ease-out',
        isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0',
        className
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', iconColor)} />

        <div className="flex-1">
          <h4 className="text-sm font-medium text-neutral-900">{title}</h4>
          {description && <p className="mt-1 text-sm text-neutral-500">{description}</p>}
          {action && (
            <button
              onClick={action.onClick}
              className="mt-2 text-sm font-medium text-primary hover:text-primary-hover"
            >
              {action.label}
            </button>
          )}
        </div>

        <button
          onClick={handleClose}
          className="flex-shrink-0 rounded-lg p-1 hover:bg-neutral-100 transition-colors"
          aria-label="Close notification"
        >
          <X size={16} className="text-neutral-500" />
        </button>
      </div>
    </div>,
    document.body
  );
}

// Toast Container Component
interface ToastContainerProps {
  toasts: ToastProps[];
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  onClose: (id: string) => void;
}

const positionClasses = {
  'top-right': 'top-4 right-4',
  'top-left': 'top-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
};

export function ToastContainer({ toasts, position = 'top-right', onClose }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return createPortal(
    <div className={cn('fixed z-50 pointer-events-none', positionClasses[position])}>
      <div className="flex flex-col gap-2">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} onClose={onClose} />
        ))}
      </div>
    </div>,
    document.body
  );
}
