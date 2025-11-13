// components/ui/Amount.tsx
'use client';

import { cn } from '@/lib/utils/cn';

interface AmountProps {
  value: number;
  currency?: string;
  size?: 'sm' | 'md' | 'lg';
  showSign?: boolean;
  className?: string;
}

export function Amount({
  value,
  currency = '$',
  size = 'md',
  showSign = false,
  className,
}: AmountProps) {
  const isPositive = value > 0;
  const isNegative = value < 0;

  const sizeClasses = {
    sm: 'amount text-xs',
    md: 'amount',
    lg: 'amount-large',
  };

  const colorClass = isPositive
    ? 'text-positive'
    : isNegative
      ? 'text-negative'
      : 'text-neutral-amount';

  const formattedValue = Math.abs(value).toFixed(2);
  const sign = showSign && isPositive ? '+' : value < 0 ? '-' : '';

  return (
    <span className={cn(sizeClasses[size], colorClass, className)}>
      {sign}
      {currency}
      {formattedValue}
    </span>
  );
}
