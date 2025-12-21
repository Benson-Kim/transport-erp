/**
 * Modal Component
 * Accessible dialog with focus trap and animations
 */

'use client';
import type { ReactNode } from 'react';
import { Fragment, useEffect, useRef } from 'react';

import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

import { useEscapeKey, useFocusTrap, useScrollLock } from '@/hooks';
import { cn } from '@/lib/utils/cn';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  initialFocus?: React.RefObject<HTMLElement>;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[95vw] md:max-w-[90vw]',
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocus,
  className,
  ...ariaProps
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Lock scroll when modal is open
  useScrollLock(isOpen);

  // Handle escape key
  useEscapeKey(() => {
    if (closeOnEscape && isOpen) {
      onClose();
    }
  });

  // Focus trap
  useFocusTrap(modalRef as React.RefObject<HTMLElement>, isOpen);

  // Store and restore focus
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;

      // Set initial focus
      setTimeout(() => {
        if (initialFocus?.current) {
          initialFocus.current.focus();
        } else {
          const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          firstFocusable?.focus();
        }
      }, 100);
    } else {
      // Restore focus when closing
      previousActiveElement.current?.focus();
    }
  }, [isOpen, initialFocus]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  // Portal render
  return createPortal(
    <Fragment>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
          'animate-in fade-in duration-200'
        )}
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
        onClick={handleBackdropClick}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaProps['aria-label'] || title}
          aria-describedby={
            ariaProps['aria-describedby'] || description ? 'modal-description' : undefined
          }
          className={cn(
            'relative w-full bg-white rounded-lg shadow-modal',
            'animate-in zoom-in-95 fade-in duration-200',
            sizeClasses[size],
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <ModalHeader showCloseButton={showCloseButton} onClose={onClose}>
              {title}
            </ModalHeader>
          )}

          {/* Description */}
          {description && (
            <p id="modal-description" className="px-6 -mt-2 text-sm text-neutral-500">
              {description}
            </p>
          )}

          {/* Content */}
          {children}
        </div>
      </div>
    </Fragment>,
    document.body
  );
}

// Modal Header Component
interface ModalHeaderProps {
  children?: ReactNode;
  showCloseButton?: boolean;
  onClose?: () => void;
  className?: string;
}

export function ModalHeader({
  children,
  showCloseButton = true,
  onClose,
  className,
}: ModalHeaderProps) {
  return (
    <div className={cn('flex items-center justify-between p-6 pb-4', className)}>
      <h2 className="text-lg font-semibold text-neutral-900">{children}</h2>
      {showCloseButton && onClose && (
        <button
          onClick={onClose}
          className={cn(
            'rounded-lg p-1 hover:bg-neutral-100 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
          )}
          aria-label="Close dialog"
        >
          <X size={20} className="text-neutral-500" />
        </button>
      )}
    </div>
  );
}

// Modal Body Component
interface ModalBodyProps {
  children: ReactNode;
  className?: string;
}

export function ModalBody({ children, className }: ModalBodyProps) {
  return <div className={cn('px-6 py-4', className)}>{children}</div>;
}

// Modal Footer Component
interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

export function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-200',
        className
      )}
    >
      {children}
    </div>
  );
}

Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;
