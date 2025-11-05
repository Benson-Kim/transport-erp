/**
 * Input Component
 * Accessible text input with extensive features
 */

'use client'
import { InputHTMLAttributes, forwardRef, useState, useCallback, ReactNode } from 'react';
import { X, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ComponentSize, ComponentStatus, InputType } from '@/types/ui';

export interface InputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'size' | 'type' | 'prefix' | 'suffix'
  > {
  type?: InputType;
  size?: ComponentSize;
  status?: ComponentStatus;
  error?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  clearable?: boolean;
  showPasswordToggle?: boolean;
  showCharacterCount?: boolean;
  maxCharacters?: number;
  onClear?: () => void;
}


const sizeClasses = {
  sm: 'h-8 text-xs',
  md: 'h-10 text-sm',
  lg: 'h-12 text-base',
};

const statusClasses = {
  default: '',
  success: 'border-green-500 focus:border-green-500',
  warning: 'border-yellow-500 focus:border-yellow-500',
  error: 'border-danger focus:border-danger',
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      type = 'text',
      size = 'md',
      status = 'default',
      error,
      prefix,
      suffix,
      clearable = false,
      showPasswordToggle = false,
      showCharacterCount = false,
      maxCharacters,
      disabled,
      readOnly,
      value,
      onChange,
      onClear,
      className,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const [internalValue, setInternalValue] = useState(value || '');

    const effectiveType = type === 'password' && showPassword ? 'text' : type;
    const hasError = status === 'error' || !!error;
    const characterCount = String(internalValue).length;

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      
      if (maxCharacters && newValue.length > maxCharacters) {
        return;
      }
      
      setInternalValue(newValue);
      onChange?.(e);
    }, [onChange, maxCharacters]);

    const handleClear = useCallback(() => {
      setInternalValue('');
      onClear?.();
      
      // Create synthetic event
      const input = document.querySelector(`input[value="${internalValue}"]`) as HTMLInputElement;
      if (input && onChange) {
        const event = new Event('change', { bubbles: true });
        Object.defineProperty(event, 'target', { value: input, writable: false });
        onChange(event as any);
      }
    }, [internalValue, onChange, onClear]);

    const togglePassword = useCallback(() => {
      setShowPassword(prev => !prev);
    }, []);

    return (
      <div className="relative w-full">
        <div className={cn(
          'relative flex items-center',
          disabled && 'opacity-60 cursor-not-allowed'
        )}>
          {prefix && (
            <div className="absolute left-3 flex items-center pointer-events-none">
              <span className="text-neutral-500 text-sm">{prefix}</span>
            </div>
          )}
          
          <input
            ref={ref}
            type={effectiveType}
            value={internalValue}
            onChange={handleChange}
            disabled={disabled}
            readOnly={readOnly}
            className={cn(
              'input',
              sizeClasses[size],
              statusClasses[status],
              hasError && 'input-error',
              prefix && 'pl-10',
              (suffix || clearable || showPasswordToggle) && 'pr-10',
              className
            )}
            aria-invalid={hasError}
            aria-describedby={error ? `${props.id}-error` : undefined}
            {...props}
          />
          
          <div className="absolute right-3 flex items-center gap-1">
            {clearable && internalValue && !disabled && !readOnly && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 hover:bg-neutral-100 rounded transition-colors"
                aria-label="Clear input"
              >
                <X size={16} className="text-neutral-500" />
              </button>
            )}
            
            {type === 'password' && showPasswordToggle && (
              <button
                type="button"
                onClick={togglePassword}
                className="p-1 hover:bg-neutral-100 rounded transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff size={16} className="text-neutral-500" />
                ) : (
                  <Eye size={16} className="text-neutral-500" />
                )}
              </button>
            )}
            
            {suffix && (
              <span className="text-neutral-500 text-sm">{suffix}</span>
            )}
          </div>
        </div>
        
        {(error || showCharacterCount) && (
          <div className="flex items-center justify-between mt-1">
            {error && (
              <div id={`${props.id}-error`} className="flex items-center gap-1 text-danger text-xs" role="alert">
                <AlertCircle size={12} />
                <span>{error}</span>
              </div>
            )}
            
            {showCharacterCount && (
              <div className={cn(
                'text-xs ml-auto',
                maxCharacters && characterCount >= maxCharacters
                  ? 'text-danger'
                  : 'text-neutral-500'
              )}>
                {characterCount}{maxCharacters ? `/${maxCharacters}` : ''}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';