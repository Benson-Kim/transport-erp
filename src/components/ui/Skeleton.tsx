/**
 * Skeleton Component
 * Loading placeholder with shimmer animation
 */

import { cn } from '@/lib/utils/cn';
import { ReactNode, useId } from 'react';

export interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular';
  animation?: 'pulse' | 'wave' | 'none';
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className,
  variant = 'rectangular',
  animation = 'pulse',
  width,
  height,
}: Readonly<SkeletonProps>) {
  const formatSize = (size?: number | string) => (typeof size === 'number' ? `${size}px` : size);
  return (
    <output
      className={cn(
        'skeleton',
        variant === 'circular' && 'rounded-full',
        variant === 'text' && 'rounded h-4',
        animation === 'pulse' && 'animate-pulse',
        animation === 'wave' && 'skeleton-wave',
        className
      )}
      style={{
        width: width ? formatSize(width) : undefined,
        height: height ? formatSize(height) : undefined,
      }}
      aria-label="Loading..."
    />
  );
}

// Skeleton Group for consistent loading states
interface SkeletonGroupProps {
  count?: number;
  className?: string;
  children?: ReactNode;
}

export function SkeletonGroup({ count = 3, className, children }: Readonly<SkeletonGroupProps>) {
  const baseId = useId();
  if (children) {
    return <div className={cn('space-y-3', className)}>{children}</div>;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={`${baseId}-item-${index}`} className="h-4 w-full" />
      ))}
    </div>
  );
}
