/**
 * Logo Component
 * Application logo with responsive sizing
 */

'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

interface LogoProps {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  href?: string;
  variant?: 'default' | 'white' | 'dark';
}

export function Logo({
  className,
  showText = true,
  size = 'md',
  href = '/',
  variant = 'default',
}: LogoProps) {
  const sizes = {
    sm: {
      icon: 'h-6 w-6',
      text: 'text-lg',
      container: 'h-6',
    },
    md: {
      icon: 'h-8 w-8',
      text: 'text-xl',
      container: 'h-8',
    },
    lg: {
      icon: 'h-10 w-10',
      text: 'text-2xl',
      container: 'h-10',
    },
    xl: {
      icon: 'h-12 w-12',
      text: 'text-3xl',
      container: 'h-12',
    },
  };

  const colors = {
    default: 'text-primary-600 dark:text-primary-500',
    white: 'text-white',
    dark: 'text-neutral-900',
  };

  const LogoContent = () => (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Logo Icon */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn(sizes[size].icon, colors[variant])}
        aria-hidden="true"
      >
        <path
          d="M12 2L2 7L12 12L22 7L12 2Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 17L12 22L22 17"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2 12L12 17L22 12"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Logo Text */}
      {showText && (
        <span
          className={cn(
            'font-bold tracking-tight',
            sizes[size].text,
            colors[variant]
          )}
        >
          Enterprise
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          'inline-flex items-center transition-opacity hover:opacity-80',
          sizes[size].container
        )}
        aria-label="Enterprise Dashboard Home"
      >
        <LogoContent />
      </Link>
    );
  }

  return <LogoContent />;
}

/**
 * Logo Mark Component
 * Just the icon without text
 */
export function LogoMark({
  className,
  size = 'md',
  variant = 'default',
}: Omit<LogoProps, 'showText' | 'href'>) {
  return <Logo className={className} size={size} variant={variant} showText={false} />;
}