/**
 * TimeInput Component
 * Time input with format support
 */

'use client';
import { InputHTMLAttributes, forwardRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ComponentSize } from '@/types/ui';

export interface TimeInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  size?: ComponentSize;
  error?: string;
  format?: '12' | '24';
  showSeconds?: boolean;
}

const sizeClasses = {
  sm: 'h-8 text-xs',
  md: 'h-10 text-sm',
  lg: 'h-12 text-base',
};

export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(
  ({ size = 'md', error, format = '24', showSeconds = false, className, ...props }, ref) => {
    const [inputValue, setInputValue] = useState(props.value || '');

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let value = e.target.value.replaceAll(/[^\d:]/g, '');

      // Auto-format as user types
      if (value.length === 2 && !value.includes(':')) {
        value = value + ':';
      }
      if (showSeconds && value.length === 5 && value.split(':').length === 2) {
        value = value + ':';
      }

      setInputValue(value);

      // Call original onChange
      if (props.onChange) {
        e.target.value = value;
        props.onChange(e);
      }
    };

    let placeholder: string;

    if (showSeconds) {
      placeholder = format === '12' ? 'HH:MM:SS AM/PM' : 'HH:MM:SS';
    } else {
      placeholder = format === '12' ? 'HH:MM AM/PM' : 'HH:MM';
    }

    return (
      <div className="relative w-full">
        <div className="relative">
          <input
            ref={ref}
            type="text"
            value={inputValue}
            onChange={handleChange}
            placeholder={placeholder}
            className={cn('input pr-10', sizeClasses[size], error && 'input-error', className)}
            maxLength={showSeconds ? 8 : 5}
            aria-invalid={!!error}
            aria-describedby={error ? `${props.id}-error` : undefined}
            {...props}
          />

          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Clock size={16} className="text-neutral-500" />
          </div>
        </div>

        {error && (
          <div id={`${props.id}-error`} className="mt-1 text-danger text-xs" role="alert">
            {error}
          </div>
        )}
      </div>
    );
  }
);

TimeInput.displayName = 'TimeInput';
