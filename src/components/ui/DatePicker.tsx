/**
 * DatePicker Component
 * Accessible date picker with calendar dropdown
 */

'use client';

import { forwardRef, useState, useRef, useEffect } from 'react';

import { format, parse, isValid, isBefore, isAfter } from 'date-fns';
import { Calendar as CalendarIcon, X } from 'lucide-react';

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

    // Sync input value with selected date
    useEffect(() => {
      if (selectedDate && isValid(selectedDate)) {
        setInputValue(format(selectedDate, dateFormat));
      } else {
        setInputValue('');
      }
    }, [selectedDate, dateFormat]);

    // Handle manual input
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target;
      setInputValue(value);

      // Try to parse the date
      if (value.length === dateFormat.length) {
        const parsed = parse(value, dateFormat, new Date());
        if (isValid(parsed)) {
          // Check constraints
          if (minDate && isBefore(parsed, minDate)) return;
          if (maxDate && isAfter(parsed, maxDate)) return;
          if (disabledDates?.(parsed)) return;

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

    const handleDateSelect = (date: Date) => {
      setSelectedDate(date);
      onChange?.(date);
      setIsOpen(false);
    };

    // Handle click outside
    useEffect(() => {
      if (!isOpen) return;

      const handleClickOutside = (e: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          setIsOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Generate calendar days (simplified - you'd want a proper calendar component)
    const generateCalendarDays = () => {
      const today = new Date();
      const days = [];

      // This is a simplified calendar - in production, use a proper calendar library
      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);

        const isDisabled =
          (minDate && isBefore(date, minDate)) ??
          (maxDate && isAfter(date, maxDate)) ??
          disabledDates?.(date);

        days.push({
          date,
          isDisabled,
          isToday: i === 0,
          isSelected: selectedDate?.toDateString() === date.toDateString(),
        });
      }

      return days;
    };

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
          <div className="absolute z-50 mt-1 w-64 bg-white border border-neutral-200 rounded-md shadow-lg p-3">
            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                <div key={day} className="text-xs font-medium text-neutral-500 text-center">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {generateCalendarDays()
                .slice(0, 28)
                .map(({ date, isDisabled, isToday, isSelected }) => (
                  <button
                    key={date.toISOString()}
                    type="button"
                    onClick={() => !isDisabled && handleDateSelect(date)}
                    disabled={isDisabled}
                    className={cn(
                      'h-8 text-sm rounded hover:bg-neutral-100 transition-colors',
                      isDisabled && 'opacity-50 cursor-not-allowed',
                      isToday && 'font-semibold',
                      isSelected && 'bg-primary text-white hover:bg-primary-hover'
                    )}
                  >
                    {date.getDate()}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';
