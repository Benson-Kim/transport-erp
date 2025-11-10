/**
 * Skeleton Component
 * Loading placeholder with shimmer animation
 */

import { cn } from '@/lib/utils/cn';
import { ReactNode } from 'react';

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
}: SkeletonProps) {
  return (
    <div
      className={cn(
        'skeleton',
        variant === 'circular' && 'rounded-full',
        variant === 'text' && 'rounded h-4',
        animation === 'pulse' && 'animate-pulse',
        animation === 'wave' && 'skeleton-wave',
        className
      )}
      style={{
        width: width ? (typeof width === 'number' ? `${width}px` : width) : undefined,
        height: height ? (typeof height === 'number' ? `${height}px` : height) : undefined,
      }}
      aria-label="Loading..."
      role="status"
    />
  );
}

// Skeleton Group for consistent loading states
interface SkeletonGroupProps {
  count?: number;
  className?: string;
  children?: ReactNode;
}

export function SkeletonGroup({ count = 3, className, children }: SkeletonGroupProps) {
  if (children) {
    return <div className={cn('space-y-3', className)}>{children}</div>;
  }

  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-4 w-full" />
      ))}
    </div>
  );
}