/**
 * Radio Component
 * Accessible radio button group
 */

import type { InputHTMLAttributes} from 'react';
import { forwardRef } from 'react';

import { cn } from '@/lib/utils/cn';
import type { Option } from '@/types/ui';

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  options: Option[];
  error?: string;
  orientation?: 'horizontal' | 'vertical';
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  (
    {
      options,
      error,
      orientation = 'vertical',
      name,
      value,
      onChange,
      disabled,
      className,
      ...props
    },
    ref
  ) => (
      <div className="w-full">
        <div
          className={cn(
            'flex gap-4',
            orientation === 'vertical' && 'flex-col',
            orientation === 'horizontal' && 'flex-row flex-wrap'
          )}
          role="radiogroup"
          aria-invalid={!!error}
          aria-describedby={error ? `${name}-error` : undefined}
        >
          {options.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex items-center gap-2 cursor-pointer',
                (disabled || option.disabled) && 'cursor-not-allowed opacity-50'
              )}
            >
              <input
                ref={ref}
                type="radio"
                name={name}
                value={option.value}
                checked={value === option.value}
                onChange={onChange}
                disabled={disabled || option.disabled}
                className={cn(
                  'h-4 w-4 text-primary border-neutral-300',
                  'focus:ring-2 focus:ring-primary focus:ring-offset-2',
                  'disabled:cursor-not-allowed',
                  error && 'border-danger',
                  className
                )}
                {...props}
              />
              <div>
                <div className="text-sm font-medium text-neutral-700">{option.label}</div>
                {option.description && (
                  <div className="text-xs text-neutral-500">{option.description}</div>
                )}
              </div>
            </label>
          ))}
        </div>

        {error && (
          <div id={`${name}-error`} className="mt-2 text-danger text-xs" role="alert">
            {error}
          </div>
        )}
      </div>
    )
);

Radio.displayName = 'Radio';
