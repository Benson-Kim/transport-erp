/**
 * Formatting utilities
 */

const locale = globalThis.window === undefined ? 'en-US' : navigator.language;

/**
 * Format currency
 */
export function formatCurrency(amount: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format percentage
 */
export function formatPercentage(value: number): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

/**
 * Format number
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Format distance in kilometers
 */
export function formatDistance(value: number): string {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'kilometer',
    unitDisplay: 'short', // outputs like "12 km"
  }).format(value);
}
