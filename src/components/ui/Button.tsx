/**
 * Button Component
 * Accessible button with multiple variants and states
 */

import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
import { cloneElement, forwardRef, isValidElement } from 'react';

import { RefreshCw } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import type { ComponentSize } from '@/types/ui';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: ComponentSize;
  loading?: boolean;
  loadingText?: string;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right' | 'center';
  fullWidth?: boolean;
  asChild?: boolean;
}

const variantClasses = {
  primary: 'button-primary',
  secondary: 'button-secondary',
  danger: 'button-danger',
  ghost: 'button-ghost',
};

const sizeClasses = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      loadingText,
      disabled,
      icon,
      iconPosition = 'left',
      fullWidth = false,
      children,
      className,
      onClick,
      type = 'button',
      asChild = false,
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const composedClassName = cn(
      'button',
      variantClasses[variant],
      sizeClasses[size],
      fullWidth && 'w-full',
      'inline-flex items-center justify-center gap-2',
      'transition-all duration-150',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      isDisabled && 'cursor-not-allowed opacity-60',
      className
    );

    // #55: Slot composition. asChild was DECLARED but unimplemented - it
    // leaked onto the DOM (<button aschild>) and callers got <button><a>
    // nesting. With asChild the CHILD (typically next/link) receives the
    // button styling itself; icon/loading rendering is the caller's
    // responsibility in this mode (one interactive element, no nesting).
    if (asChild && isValidElement(children)) {
      const child = children as ReactElement<React.HTMLAttributes<HTMLElement>>;
      return cloneElement(child, {
        className: cn(composedClassName, child.props.className),
        ...(isDisabled ? { 'aria-disabled': true } : {}),
      });
    }

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!isDisabled && onClick) {
        onClick(e);
      }
    };

    const content = (
      <>
        {loading && (
          <RefreshCw className="animate-spin" size={size === 'sm' ? 14 : 16} aria-hidden="true" />
        )}
        {!loading && icon && iconPosition === 'left' && (
          <span className="icon" aria-hidden="true">
            {icon}
          </span>
        )}
        {loading && loadingText ? loadingText : children}
        {!loading && icon && iconPosition === 'right' && (
          <span className="icon" aria-hidden="true">
            {icon}
          </span>
        )}
      </>
    );

    return (
      <button
        ref={ref}
        type={type}
        className={composedClassName}
        disabled={isDisabled}
        onClick={handleClick}
        aria-busy={loading}
        aria-disabled={isDisabled}
        {...props}
      >
        {content}
      </button>
    );
  }
);

Button.displayName = 'Button';
