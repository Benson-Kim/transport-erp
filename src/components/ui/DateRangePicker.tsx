/**
 * DateRangePicker Component
 * Enhanced date range selector with presets and better UX
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, ChevronRight } from 'lucide-react';
import {
  subDays,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  isValid,
  parseISO,
} from 'date-fns';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui';
import { formatDate } from '@/lib/utils/date-formats';

export interface DateRangePickerProps {
  id?: string;
  from?: string;
  to?: string;
  onSelect: (range: { from?: string; to?: string }) => void;
  className?: string;
  placeholder?: string;
  maxDate?: string;
  minDate?: string;
  disabled?: boolean;
}

interface PresetRange {
  label: string;
  getValue: () => { from: string; to: string };
}

const presetRanges: PresetRange[] = [
  {
    label: 'Today',
    getValue: () => {
      const today = formatDate.isoDate(new Date());
      return { from: today, to: today };
    },
  },
  {
    label: 'Yesterday',
    getValue: () => {
      const yesterday = formatDate.isoDate(subDays(new Date(), 1));
      return { from: yesterday, to: yesterday };
    },
  },
  {
    label: 'Last 7 days',
    getValue: () => ({
      from: formatDate.isoDate(subDays(new Date(), 6)),
      to: formatDate.isoDate(new Date()),
    }),
  },
  {
    label: 'Last 30 days',
    getValue: () => ({
      from: formatDate.isoDate(subDays(new Date(), 29)),
      to: formatDate.isoDate(new Date()),
    }),
  },
  {
    label: 'This month',
    getValue: () => ({
      from: formatDate.isoDate(startOfMonth(new Date())),
      to: formatDate.isoDate(endOfMonth(new Date())),
    }),
  },
  {
    label: 'Last month',
    getValue: () => {
      const lastMonth = subDays(startOfMonth(new Date()), 1);
      return {
        from: formatDate.isoDate(startOfMonth(lastMonth)),
        to: formatDate.isoDate(endOfMonth(lastMonth)),
      };
    },
  },
  {
    label: 'This year',
    getValue: () => ({
      from: formatDate.isoDate(startOfYear(new Date())),
      to: formatDate.isoDate(endOfYear(new Date())),
    }),
  },
];

export function DateRangePicker({
  from,
  to,
  onSelect,
  className,
  placeholder = 'Select date range',
  maxDate,
  minDate,
  disabled = false,
}: Readonly<DateRangePickerProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [localFrom, setLocalFrom] = useState(from || '');
  const [localTo, setLocalTo] = useState(to || '');
  const [activeTab, setActiveTab] = useState<'preset' | 'custom'>('preset');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Update local state when props change
  useEffect(() => {
    setLocalFrom(from || '');
    setLocalTo(to || '');
  }, [from, to]);

  // Handle click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleApply = () => {
    // Validate dates
    if (localFrom && localTo && new Date(localFrom) > new Date(localTo)) {
      // Swap dates if from is after to
      onSelect({ from: localTo, to: localFrom });
    } else {
      onSelect({ from: localFrom, to: localTo });
    }
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const handleClear = () => {
    setLocalFrom('');
    setLocalTo('');
    onSelect({ from: '', to: '' });
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const handlePresetSelect = (preset: PresetRange) => {
    const range = preset.getValue();
    setLocalFrom(range.from);
    setLocalTo(range.to);
    onSelect(range);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  const isValidDate = (dateStr: string): Date | null => {
    try {
      const date = parseISO(dateStr);
      return isValid(date) ? date : null;
    } catch {
      return null;
    }
  };

  const formatDateRange = (
    fromDate: Date,
    toDate: Date,
    fromStr: string,
    tostr: string
  ): string => {
    // Same day
    if (fromStr === tostr) {
      return formatDate.short(fromDate);
    }

    // Same year
    if (fromDate.getFullYear() === toDate.getFullYear()) {
      return `${formatDate.dayMonth(fromDate)} - ${formatDate.short(toDate)}`;
    }

    // Different years
    return `${formatDate.short(fromDate)} - ${formatDate.short(toDate)}`;
  };

  const displayText = useMemo(() => {
    if (!from && !to) return placeholder;

    const fromDate = from ? isValidDate(from) : null;
    const toDate = to ? isValidDate(to) : null;

    if (fromDate && toDate) {
      return formatDateRange(fromDate, toDate, from!, to!);
    }

    if (fromDate) {
      return `From ${formatDate.short(fromDate)}`;
    }

    if (toDate) {
      return `Until ${formatDate.short(toDate)}`;
    }

    return placeholder;
  }, [from, to, placeholder]);

  const hasValue = from || to;

  return (
    <div className={cn('relative inline-block', className)} ref={dropdownRef}>
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        icon={
          <Calendar className={cn('h-4 w-4', hasValue ? 'text-primary-600' : 'text-neutral-400')} />
        }
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'justify-start gap-2 font-normal',
          hasValue && 'text-primary-900 bg-primary-50 hover:bg-primary-100',
          !hasValue && 'text-neutral-600',
          isOpen && 'ring-2 ring-primary ring-offset-1'
        )}
        aria-label="Select date range"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="whitespace-nowrap">{displayText}</span>
        {/* <ChevronDown className={cn(
                    "h-4 w-4 ml-auto transition-transform duration-200",
                    hasValue ? "text-primary-600" : "text-neutral-400",
                    isOpen && "rotate-180"
                )} /> */}
      </Button>

      {isOpen && (
        <div
          className={cn(
            'absolute z-50 mt-2 bg-white border border-neutral-200 rounded-lg shadow-lg',
            'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-200'
          )}
        >
          {/* Tab Navigation */}
          <div className="flex border-b border-neutral-200">
            <button
              type="button"
              onClick={() => setActiveTab('preset')}
              className={cn(
                'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === 'preset'
                  ? 'text-primary-600 border-b-2 border-primary-600 -mb-0.5'
                  : 'text-neutral-600 hover:text-neutral-900'
              )}
            >
              Quick Select
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('custom')}
              className={cn(
                'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === 'custom'
                  ? 'text-primary-600 border-b-2 border-primary-600 -mb-0.5'
                  : 'text-neutral-600 hover:text-neutral-900'
              )}
            >
              Custom Range
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-3">
            {activeTab === 'preset' ? (
              <div className="space-y-1 min-w-[200px]">
                {presetRanges.map((preset) => {
                  const range = preset.getValue();
                  const isActive = range.from === from && range.to === to;

                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => handlePresetSelect(preset)}
                      className={cn(
                        'w-full px-3 py-2 text-sm text-left rounded-md transition-colors',
                        'flex items-center justify-between group',
                        isActive
                          ? 'bg-primary-100 text-primary-900 font-medium'
                          : 'hover:bg-neutral-100 text-neutral-700'
                      )}
                    >
                      <span>{preset.label}</span>
                      {isActive && <ChevronRight className="h-4 w-4 text-primary-600" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4 w-80">
                <div>
                  <label
                    htmlFor="fromDate"
                    className="block text-sm font-medium text-neutral-700 mb-1.5"
                  >
                    From Date
                  </label>
                  <input
                    id="fromDate"
                    type="date"
                    value={localFrom}
                    onChange={(e) => setLocalFrom(e.target.value)}
                    min={minDate}
                    max={maxDate || localTo}
                    className={cn(
                      'w-full px-3 py-2 text-sm border rounded-lg transition-colors',
                      'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                      'hover:border-neutral-400'
                    )}
                  />
                </div>

                <div>
                  <label
                    htmlFor="toDate"
                    className="block text-sm font-medium text-neutral-700 mb-1.5"
                  >
                    To Date
                  </label>
                  <input
                    id="toDate"
                    type="date"
                    value={localTo}
                    onChange={(e) => setLocalTo(e.target.value)}
                    min={minDate || localFrom}
                    max={maxDate}
                    className={cn(
                      'w-full px-3 py-2 text-sm border rounded-lg transition-colors',
                      'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                      'hover:border-neutral-400'
                    )}
                  />
                </div>

                {/* Quick stats when dates are selected */}
                {localFrom && localTo && (
                  <div className="p-2 bg-neutral-50 rounded-lg text-xs text-neutral-600">
                    {(() => {
                      const days =
                        Math.ceil(
                          (new Date(localTo).getTime() - new Date(localFrom).getTime()) /
                            (1000 * 60 * 60 * 24)
                        ) + 1;
                      return `${days} day${days === 1 ? '' : 's'} selected`;
                    })()}
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-neutral-200">
                  <Button size="sm" variant="ghost" onClick={handleClear} className="flex-1">
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={handleApply}
                    disabled={!localFrom && !localTo}
                    className="flex-1"
                  >
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
