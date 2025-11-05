/**
 * Textarea Component
 * Multi-line text input with auto-resize option
 */

'use client'
import { TextareaHTMLAttributes, forwardRef, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils/cn';
import { ComponentSize } from '@/types/ui';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  size?: ComponentSize;
  error?: string;
  autoResize?: boolean;
  minRows?: number;
  maxRows?: number;
  showCharacterCount?: boolean;
  maxCharacters?: number;
}

const sizeClasses = {
  sm: 'text-xs p-2',
  md: 'text-sm p-3',
  lg: 'text-base p-4',
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      size = 'md',
      error,
      autoResize = false,
      minRows = 3,
      maxRows = 10,
      showCharacterCount = false,
      maxCharacters,
      value,
      onChange,
      className,
      ...props
    },
    ref
  ) => {
    const internalRef = useRef<HTMLTextAreaElement | null>(null);
    
    // Auto-resize functionality
    useEffect(() => {
      if (!autoResize || !internalRef.current) return;
      
      const textarea = internalRef.current;
      textarea.style.height = 'auto';
      const scrollHeight = textarea.scrollHeight;
      const lineHeight = parseInt(getComputedStyle(textarea).lineHeight);
      const maxHeight = lineHeight * maxRows;
      
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }, [value, autoResize, maxRows]);

    const characterCount = value ? String(value).length : 0;

    return (
      <div className="w-full">
        <textarea
          ref={(node) => {
            internalRef.current = node;
            if (ref) {
              if (typeof ref === 'function') {
                ref(node);
              } else {
                ref.current = node;
              }
            }
          }}
          value={value}
          onChange={onChange}
          rows={minRows}
          className={cn(
            'input',
            'resize-none',
            sizeClasses[size],
            error && 'input-error',
            className
          )}
          maxLength={maxCharacters}
          aria-invalid={!!error}
          aria-describedby={error ? `${props.id}-error` : undefined}
          {...props}
        />
        
        <div className="flex items-center justify-between mt-1">
          {error && (
            <div id={`${props.id}-error`} className="text-danger text-xs" role="alert">
              {error}
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
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';