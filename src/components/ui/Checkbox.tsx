/**
 * Checkbox Component
 * Accessible checkbox with label support + controlled state
 */

'use client';

import type { InputHTMLAttributes } from 'react';
import { forwardRef, useCallback, useEffect, useRef } from 'react';

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
    // #52/#55: `indeterminate` is a DOM PROPERTY, not an attribute - it was
    // accepted as a prop and never applied, so the tri-state select-all
    // header never rendered (or announced) mixed state.
    const innerRef = useRef<HTMLInputElement | null>(null);
    const setRefs = useCallback(
      (node: HTMLInputElement | null) => {
        innerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      },
      [ref]
    );

    useEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked);
      props.onChange?.(e);
    };

    return (
      <div className="flex items-start gap-3">
        <div className="relative flex items-center">
          <input
            ref={setRefs}
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
              error ? `${props.id}-error` : description ? `${props.id}-description` : undefined
            }
            {...props}
          />

          <div
            className={cn(
              'h-4 w-4 rounded border-2 border-neutral-300',
              'peer-checked:bg-primary peer-checked:border-primary',
              // #52: peer-* only styles SIBLINGS of the input; the Check icon
              // is a grandchild, so its own peer-checked:opacity-100 never
              // fired and the mark was invisible. The wrapper drives it.
              'peer-checked:[&_svg]:opacity-100',
              indeterminate && 'bg-primary border-primary',
              'peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2',
              'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
              error && 'border-danger',
              'flex items-center justify-center'
            )}
          >
            {indeterminate ? (
              <Minus size={10} className="text-white" />
            ) : (
              <Check size={10} className="text-white opacity-0" />
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
