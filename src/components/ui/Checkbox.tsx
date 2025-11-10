/**
 * Checkbox Component
 * Accessible checkbox with label support + controlled state
 */

import { InputHTMLAttributes, forwardRef } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
  error?: string;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
}


export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      label,
      description,
      error,
      indeterminate = false,
      disabled,
      className,
      onCheckedChange,
      ...props
    },
    ref
  ) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked);
      props.onChange?.(e);
    };

    return (
      <div className="flex items-start gap-3">
        <div className="relative flex items-center">
          <input
            ref={ref}
            type="checkbox"
            disabled={disabled}
            onChange={handleChange}
            className={cn(
              'peer h-4 w-4 rounded border-neutral-300 text-primary',
              'focus:ring-2 focus:ring-primary focus:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              error && 'border-danger',
              'sr-only',
              className
            )}
            aria-invalid={!!error}
            aria-describedby={
              error
                ? `${props.id}-error`
                : description
                ? `${props.id}-description`
                : undefined
            }
            {...props}
          />

          <div
            className={cn(
              'h-4 w-4 rounded border-2 border-neutral-300',
              'peer-checked:bg-primary peer-checked:border-primary',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2',
              'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
              error && 'border-danger',
              'flex items-center justify-center'
            )}
          >
            {indeterminate ? (
              <Minus size={10} className="text-white" />
            ) : (
              <Check size={10} className="text-white opacity-0 peer-checked:opacity-100" />
            )}
          </div>
        </div>

        {(label || description || error) && (
          <div className="flex-1">
            {label && (
              <label
                htmlFor={props.id}
                className={cn(
                  'block text-sm font-medium text-neutral-700',
                  disabled && 'cursor-not-allowed opacity-50'
                )}
              >
                {label}
              </label>
            )}
            {description && (
              <p id={`${props.id}-description`} className="text-xs text-neutral-500 mt-0.5">
                {description}
              </p>
            )}
            {error && (
              <p id={`${props.id}-error`} className="text-xs text-danger mt-0.5" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
