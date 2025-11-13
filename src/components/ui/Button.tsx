/**
 * Button Component
 * Accessible button with multiple variants and states
 */

import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ComponentSize } from '@/types/ui';

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
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!isDisabled && onClick) {
        onClick(e);
      }
    };

    const content = (
      <>
        {loading && (
          <RefreshCw
            className="animate-spin"
            size={size === 'sm' ? 14 : size === 'md' ? 16 : 18}
            aria-hidden="true"
          />
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
        className={cn(
          'button',
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && 'w-full',
          'inline-flex items-center justify-center gap-2',
          'transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          isDisabled && 'cursor-not-allowed opacity-60',
          className
        )}
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
