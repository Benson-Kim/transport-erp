/**
 * Class Name Utility
 * Combines clsx for conditional classes with tailwind-merge for proper overrides
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge class names with proper Tailwind CSS precedence
 * @param inputs - Class values to merge
 * @returns Merged class string
 *
 * @example
 * cn('px-2 py-1', 'px-4') // Returns: 'py-1 px-4'
 * cn('text-red-500', condition && 'text-blue-500') // Conditional classes
 * cn(['text-sm', 'font-bold'], { 'opacity-50': isDisabled }) // Arrays and objects
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Variants helper for component styling
 * Creates a function that merges base and variant classes
 */
export function variants<T extends Record<string, Record<string, string>>>(config: {
  base?: string;
  variants: T;
  defaultVariants?: Partial<{ [K in keyof T]: keyof T[K] }>;
}) {
  return (props?: Partial<{ [K in keyof T]: keyof T[K] }>) => {
    const classes = [config.base];

    Object.entries(config.variants).forEach(([variantKey, variantValues]) => {
      const value = props?.[variantKey] ?? config.defaultVariants?.[variantKey];
      if (value && variantValues[value as string]) {
        classes.push(variantValues[value as string]);
      }
    });

    return cn(...classes);
  };
}

/**
 * Focus visible utility
 * Consistent focus styles across the application
 */
export const focusRing = cn(
  'outline-none',
  'ring-2 ring-offset-2',
  'ring-primary-500 ring-offset-background',
  'focus-visible:ring-2 focus-visible:ring-offset-2'
);

/**
 * Common utility class combinations
 */
export const utils = {
  /**
   * Container with responsive padding
   */
  container: cn('mx-auto w-full', 'px-4 sm:px-6 lg:px-8', 'max-w-7xl'),

  /**
   * Card styles
   */
  card: cn(
    'rounded-lg border border-neutral-200',
    'bg-white shadow-sm',
    'dark:border-neutral-800 dark:bg-neutral-950'
  ),

  /**
   * Button base styles
   */
  buttonBase: cn(
    'inline-flex items-center justify-center',
    'rounded-md font-medium',
    'transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2',
    'disabled:pointer-events-none disabled:opacity-50'
  ),

  /**
   * Input base styles
   */
  inputBase: cn(
    'flex w-full rounded-md',
    'border border-neutral-300',
    'bg-white px-3 py-2',
    'text-sm file:border-0',
    'file:bg-transparent file:text-sm file:font-medium',
    'placeholder:text-neutral-500',
    'focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-primary-500 focus-visible:ring-offset-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    'dark:border-neutral-700 dark:bg-neutral-950',
    'dark:placeholder:text-neutral-400'
  ),

  /**
   * Label styles
   */
  label: cn('text-sm font-medium', 'text-neutral-900', 'dark:text-neutral-100'),

  /**
   * Error text styles
   */
  errorText: cn('text-sm text-error-600', 'dark:text-error-400'),

  /**
   * Helper text styles
   */
  helperText: cn('text-sm text-neutral-500', 'dark:text-neutral-400'),

  /**
   * Skeleton loader
   */
  skeleton: cn('animate-pulse rounded-md', 'bg-neutral-200', 'dark:bg-neutral-800'),

  /**
   * Divider line
   */
  divider: cn('border-t border-neutral-200', 'dark:border-neutral-800'),

  /**
   * Overlay background
   */
  overlay: cn(
    'fixed inset-0 z-50',
    'bg-black/50 backdrop-blur-sm',
    'data-[state=open]:animate-fade-in',
    'data-[state=closed]:animate-fade-out'
  ),

  /**
   * Responsive grid
   */
  grid: (cols: { base?: number; sm?: number; md?: number; lg?: number; xl?: number }) => {
    const classes = ['grid gap-4'];

    if (cols.base) classes.push(`grid-cols-${cols.base}`);
    if (cols.sm) classes.push(`sm:grid-cols-${cols.sm}`);
    if (cols.md) classes.push(`md:grid-cols-${cols.md}`);
    if (cols.lg) classes.push(`lg:grid-cols-${cols.lg}`);
    if (cols.xl) classes.push(`xl:grid-cols-${cols.xl}`);

    return cn(...classes);
  },
};

/**
 * Animation utilities
 */
export const animations = {
  /**
   * Fade animations
   */
  fadeIn: 'animate-fade-in',
  fadeOut: 'animate-fade-out',

  /**
   * Slide animations
   */
  slideInFromTop: 'animate-slide-in-from-top',
  slideInFromBottom: 'animate-slide-in-from-bottom',
  slideInFromLeft: 'animate-slide-in-from-left',
  slideInFromRight: 'animate-slide-in-from-right',

  /**
   * Accordion animations
   */
  accordionDown: 'animate-accordion-down',
  accordionUp: 'animate-accordion-up',

  /**
   * Spin animation
   */
  spin: 'animate-spin',
  spinSlow: 'animate-spin-slow',

  /**
   * Pulse animation
   */
  pulse: 'animate-pulse',
};

/**
 * Transition utilities
 */
export const transitions = {
  /**
   * Default transition
   */
  default: 'transition-all duration-200 ease-in-out',

  /**
   * Fast transition
   */
  fast: 'transition-all duration-100 ease-in-out',

  /**
   * Slow transition
   */
  slow: 'transition-all duration-300 ease-in-out',

  /**
   * Color transition
   */
  colors: 'transition-colors duration-200 ease-in-out',

  /**
   * Transform transition
   */
  transform: 'transition-transform duration-200 ease-in-out',

  /**
   * Opacity transition
   */
  opacity: 'transition-opacity duration-200 ease-in-out',
};
