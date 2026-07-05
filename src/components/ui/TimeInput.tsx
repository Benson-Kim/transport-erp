/**
 * TimeInput Component
 * Time input with format support
 */

'use client';
import type { InputHTMLAttributes} from 'react';
import { forwardRef, useState } from 'react';

import { Clock } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import type { ComponentSize } from '@/types/ui';

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
  (
    { size = 'md', error, format = '24', showSeconds = false, className, value, onChange, ...props },
    ref
  ) => {
    // #52: value/onChange are DESTRUCTURED - previously they rode inside
    // {...props}, which was spread AFTER the internal value/onChange and
    // silently overrode them: auto-format was dead in controlled usage and
    // the seeded-once internal state never synced. Controlled when `value`
    // is provided; uncontrolled otherwise - formatting applies in BOTH.
    const [internalValue, setInternalValue] = useState(value ?? '');
    const isControlled = value !== undefined;
    const currentValue = isControlled ? value : internalValue;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let next = e.target.value.replaceAll(/[^\d:]/g, '');

      // Auto-format as user types
      if (next.length === 2 && !next.includes(':')) {
        next = `${next}:`;
      }
      if (showSeconds && next.length === 5 && next.split(':').length === 2) {
        next = `${next}:`;
      }

      if (!isControlled) setInternalValue(next);

      if (onChange) {
        e.target.value = next;
        onChange(e);
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
            value={currentValue}
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
