/**
 * Select Component
 * Native and custom dropdown with advanced features
 */

'use client';
import {
  SelectHTMLAttributes,
  forwardRef,
  useState,
  useRef,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { ChevronDown, X, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ComponentSize, Option } from '@/types/ui';

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'prefix'> {
  options: Option[];
  size?: ComponentSize;
  error?: string;
  prefix?: ReactNode;
  clearable?: boolean;
  searchable?: boolean;
  loading?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  renderCustom?: boolean;
  onClear?: () => void;
}

const sizeClasses = {
  sm: 'h-8 text-xs',
  md: 'h-10 text-sm',
  lg: 'h-12 text-base',
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      options,
      size = 'md',
      error,
      prefix,
      clearable = false,
      searchable = false,
      loading = false,
      placeholder = 'Select an option',
      emptyMessage = 'No options found',
      renderCustom = true,
      value,
      onChange,
      onClear,
      disabled,
      className,
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const selectedOption = options.find((opt) => opt.value === value);
    const filteredOptions = searchTerm
      ? options.filter((opt) => opt.label.toLowerCase().includes(searchTerm.toLowerCase()))
      : options;

    // Group options if groups are defined
    const groupedOptions = filteredOptions.reduce(
      (acc, option) => {
        const group = option.group || 'default';
        if (!acc[group]) acc[group] = [];
        acc[group].push(option);
        return acc;
      },
      {} as Record<string, Option[]>
    );

    const handleSelect = useCallback(
      (option: Option) => {
        if (option.disabled) return;

        // Create synthetic event
        const event = {
          target: { value: option.value },
        } as React.ChangeEvent<HTMLSelectElement>;

        onChange?.(event);
        setIsOpen(false);
        setSearchTerm('');
      },
      [onChange]
    );

    const handleClear = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onClear?.();

        // Create synthetic event with empty value
        const event = {
          target: { value: '' },
        } as React.ChangeEvent<HTMLSelectElement>;

        onChange?.(event);
      },
      [onChange, onClear]
    );

    // Handle keyboard navigation
    useEffect(() => {
      if (!isOpen) return;

      const handleKeyDown = (e: KeyboardEvent) => {
        switch (e.key) {
          case 'Escape':
            setIsOpen(false);
            break;
          case 'ArrowDown':
          case 'ArrowUp':
            e.preventDefault();
            // Implement keyboard navigation logic
            break;
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

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

    // Focus search input when opened
    useEffect(() => {
      if (isOpen && searchable && searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, [isOpen, searchable]);

    // Native select fallback
    if (!renderCustom) {
      return (
        <div className="relative w-full ">
          <div
            className={cn(
              'relative flex items-center',
              disabled && 'opacity-60 cursor-not-allowed'
            )}
          >
            {prefix && (
              <div className="absolute  left-3 flex items-center pointer-events-none">
                <span className="text-neutral-500 text-sm">{prefix}</span>
              </div>
            )}
            <select
              ref={ref}
              value={value}
              onChange={onChange}
              disabled={disabled}
              className={cn(
                'input',
                sizeClasses[size],
                error && 'input-error',
                prefix && 'pl-10',
                className
              )}
              aria-invalid={!!error}
              aria-describedby={error ? `${props.id}-error` : undefined}
              {...props}
            >
              <option value="">{placeholder}</option>
              {options.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </select>
            {error && (
              <div id={`${props.id}-error`} className="mt-1 text-danger text-xs" role="alert">
                {error}
              </div>
            )}
          </div>
        </div>
      );
    }

    // Custom dropdown implementation
    return (
      <div className="relative w-full" ref={dropdownRef}>
        <div
          onClick={() => !disabled && setIsOpen(!isOpen)}
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className={cn(
            'input flex items-center justify-between cursor-pointer',
            sizeClasses[size],
            error && 'input-error',
            disabled && 'input-disabled cursor-not-allowed',
            className
          )}
        >
          <span className={cn('truncate', !selectedOption && 'text-neutral-400')}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>

          <div className="flex items-center gap-1">
            {clearable && value && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 hover:bg-neutral-100 rounded transition-colors"
                aria-label="Clear selection"
              >
                <X size={16} className="text-neutral-500" />
              </button>
            )}
            <ChevronDown
              size={16}
              className={cn('text-neutral-500 transition-transform', isOpen && 'rotate-180')}
            />
          </div>
        </div>

        {error && (
          <div id={`${props.id}-error`} className="mt-1 text-danger text-xs" role="alert">
            {error}
          </div>
        )}

        {isOpen && (
          <div
            className={cn(
              'absolute z-50 w-full mt-1 bg-white border border-neutral-200 rounded-md shadow-lg',
              'max-h-60 overflow-auto'
            )}
          >
            {searchable && (
              <div className="p-2 border-b border-neutral-200">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-sm border border-neutral-200 rounded focus:border-primary focus:outline-none"
                    placeholder="Search options..."
                  />
                </div>
              </div>
            )}

            <div role="listbox">
              {loading ? (
                <div className="px-3 py-2 text-sm text-neutral-500">Loading...</div>
              ) : filteredOptions.length === 0 ? (
                <div className="px-3 py-2 text-sm text-neutral-500">{emptyMessage}</div>
              ) : (
                Object.entries(groupedOptions).map(([group, groupOptions]) => (
                  <div key={group}>
                    {group !== 'default' && (
                      <div className="px-3 py-1 text-xs font-semibold text-neutral-500 uppercase">
                        {group}
                      </div>
                    )}
                    {groupOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => handleSelect(option)}
                        disabled={option.disabled}
                        className={cn(
                          'w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 transition-colors',
                          'flex items-center justify-between',
                          option.disabled && 'opacity-50 cursor-not-allowed',
                          option.value === value && 'bg-primary-50 text-primary'
                        )}
                        role="option"
                        aria-selected={option.value === value}
                      >
                        <div className="flex items-center gap-2">
                          {option.icon && <span>{option.icon}</span>}
                          <div>
                            <div>{option.label}</div>
                            {option.description && (
                              <div className="text-xs text-neutral-500">{option.description}</div>
                            )}
                          </div>
                        </div>
                        {option.value === value && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
