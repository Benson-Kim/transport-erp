// components/ui/Amount.tsx
'use client';

import { cn } from '@/lib/utils/cn';
import { formatCurrency } from '@/lib/utils/formatting';

interface AmountProps {
  value: number;
  currency?: string;
  size?: 'sm' | 'md' | 'lg';
  showSign?: boolean;
  className?: string;
}

export function Amount({
  value,
  currency = 'EUR',
  size = 'md',
  showSign = false,
  className,
}: Readonly<AmountProps>) {
  const isPositive = value > 0;
  const isNegative = value < 0;

  const sizeClasses = {
    sm: 'amount text-xs',
    md: 'amount',
    lg: 'amount-large',
  };

  const getAmountColor = () => {
    if (isPositive) return 'text-positive';
    if (isNegative) return 'text-negative';
    return 'text-neutral-amount';
  };

  const getSign = () => {
    if (showSign && isPositive) return '+';
    if (isNegative) return '-';
    return '';
  };

  const colorClass = getAmountColor();

  const formattedValue = formatCurrency(Math.abs(value), currency);
  const sign = getSign();

  return (
    <span className={cn(sizeClasses[size], colorClass, 'font-mono tabular-nums', className)}>
      {sign}
      {formattedValue}
    </span>
  );
}
