/**
 * DatePicker Component (#53)
 *
 * Text input + react-day-picker calendar. The previous hand-rolled
 * calendar rendered only "today + 29 days" (no month navigation, no past
 * dates - unusable for recording completed services) and combined its
 * min/max/custom constraints with `??`, which silently skipped later
 * checks. react-day-picker was already a dependency (drift map).
 */

'use client';

import { forwardRef, useEffect, useRef, useState } from 'react';

import { format, parse, isValid, isBefore, isAfter } from 'date-fns';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import { DayPicker, type Matcher } from 'react-day-picker';

import { cn } from '@/lib/utils/cn';
import type { ComponentSize } from '@/types/ui';

export interface DatePickerProps {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  size?: ComponentSize;
  error?: string;
  placeholder?: string;
  dateFormat?: string;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
  clearable?: boolean;
  disabledDates?: (date: Date) => boolean;
  className?: string;
  id?: string;
}

const sizeClasses = {
  sm: 'h-8 text-xs',
  md: 'h-10 text-sm',
  lg: 'h-12 text-base',
};

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
  (
    {
      value,
      onChange,
      size = 'md',
      error,
      placeholder = 'DD/MM/YYYY',
      dateFormat = 'dd/MM/yyyy',
      minDate,
      maxDate,
      disabled,
      clearable = true,
      disabledDates,
      className,
      id,
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [selectedDate, setSelectedDate] = useState<Date | null>(value ?? null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (!ref) return;
      if (typeof ref === 'function') ref(inputRef.current);
      else ref.current = inputRef.current;
    }, [ref]);

    // #52: SYNC from the prop (was seeded once) - edit prefill and
    // programmatic form resets must render.
    useEffect(() => {
      setSelectedDate(value ?? null);
    }, [value]);

    // Sync input text with selected date
    useEffect(() => {
      if (selectedDate && isValid(selectedDate)) {
        setInputValue(format(selectedDate, dateFormat));
      } else {
        setInputValue('');
      }
    }, [selectedDate, dateFormat]);

    /** Constraints composed with || (#53): every check runs. */
    const isDateDisallowed = (date: Date): boolean =>
      Boolean(
        (minDate && isBefore(date, minDate)) ||
          (maxDate && isAfter(date, maxDate)) ||
          disabledDates?.(date)
      );

    // Handle manual input
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const text = e.target.value;
      setInputValue(text);

      if (text.length === dateFormat.length) {
        const parsed = parse(text, dateFormat, new Date());
        if (isValid(parsed) && !isDateDisallowed(parsed)) {
          setSelectedDate(parsed);
          onChange?.(parsed);
        }
      }
    };

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedDate(null);
      setInputValue('');
      onChange?.(null);
    };

    const handleDateSelect = (date: Date | undefined) => {
      if (!date) return;
      setSelectedDate(date);
      onChange?.(date);
      setIsOpen(false);
    };

    // Handle click outside
    useEffect(() => {
      if (!isOpen) return undefined;

      const handleClickOutside = (e: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // DayPicker matchers: independent constraints, never short-circuited.
    const disabledMatchers: Matcher[] = [
      ...(minDate ? [{ before: minDate }] : []),
      ...(maxDate ? [{ after: maxDate }] : []),
      ...(disabledDates ? [disabledDates] : []),
    ];

    return (
      <div className="relative w-full" ref={dropdownRef}>
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            disabled={disabled}
            placeholder={placeholder}
            className={cn(
              'input pr-20',
              sizeClasses[size],
              error && 'input-error',
              disabled && 'input-disabled',
              className
            )}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            id={id}
          />

          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {clearable && selectedDate && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 hover:bg-neutral-100 rounded transition-colors"
                aria-label="Clear date"
              >
                <X size={16} className="text-neutral-500" />
              </button>
            )}

            <button
              type="button"
              onClick={() => !disabled && setIsOpen(!isOpen)}
              disabled={disabled}
              className="p-1 hover:bg-neutral-100 rounded transition-colors"
              aria-label="Open calendar"
              aria-expanded={isOpen}
              aria-haspopup="dialog"
            >
              <CalendarIcon size={16} className="text-neutral-500" />
            </button>
          </div>
        </div>

        {error && (
          <div id={`${id}-error`} className="mt-1 text-danger text-xs" role="alert">
            {error}
          </div>
        )}

        {isOpen && (
          <div className="absolute z-50 mt-1 rounded-md border border-neutral-200 bg-white p-2 shadow-lg">
            <DayPicker
              mode="single"
              selected={selectedDate ?? undefined}
              onSelect={handleDateSelect}
              defaultMonth={selectedDate ?? new Date()}
              disabled={disabledMatchers}
              showOutsideDays
              weekStartsOn={1}
              classNames={{
                today: 'font-semibold text-primary',
                selected: 'bg-primary text-white rounded-md',
              }}
            />
          </div>
        )}
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';
