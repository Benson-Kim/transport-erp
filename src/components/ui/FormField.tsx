/**
 * FormField Component
 * Wrapper component for form inputs with label, error, and helper text
 */

import { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { AlertCircle, Info } from 'lucide-react';

export interface FormFieldProps {
  children: ReactNode;
  label?: ReactNode;
  required?: boolean;
  error?: string;
  helperText?: string;
  className?: string;
  id?: string;
}

export function FormField({
  children,
  label,
  required = false,
  error,
  helperText,
  className,
  id,
}: Readonly<FormFieldProps>) {
  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <label htmlFor={id} className="form-label flex items-center gap-1">
          {label}
          {required && (
            <span className="text-danger" aria-label="required">
              *
            </span>
          )}
        </label>
      )}

      {children}

      {error && (
        <div className="flex items-center gap-1 text-danger text-xs" role="alert">
          <AlertCircle size={12} />
          <span>{error}</span>
        </div>
      )}

      {helperText && !error && (
        <div className="flex items-center gap-1 text-neutral-500 text-xs">
          <Info size={12} />
          <span>{helperText}</span>
        </div>
      )}
    </div>
  );
}
