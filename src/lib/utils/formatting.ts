/**
 * Formatting utilities (#26).
 *
 * Locale is resolved per call with a deterministic default. It is never
 * derived from navigator.language at module load: that value differs between
 * the server render ('en-US' fallback) and the browser, which caused a
 * hydration mismatch on every formatted number.
 */

const DEFAULT_LOCALE = 'en-US';

/**
 * Format a money amount with exactly 2 fraction digits.
 * formatCurrency(1234.56) -> "€1,234.56". Currency and locale are per-call
 * parameters so per-record Company/Client currency and language can be
 * honoured by callers that have them.
 */
export function formatCurrency(
  amount: number,
  currency: string = 'EUR',
  locale: string = DEFAULT_LOCALE
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a FRACTION in [0, 1] as a percentage: formatPercent(0.6) -> "60%".
 * If the value is already in percent points (18.5 meaning 18.5%), use
 * formatPercentPoints instead - passing points here renders 100x too large.
 */
export function formatPercent(fraction: number, locale: string = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(fraction);
}

/**
 * Format PERCENT POINTS: formatPercentPoints(18.5) -> "18.5%",
 * formatPercentPoints(21) -> "21%". If the value is a fraction in [0, 1]
 * (e.g. completed / total), use formatPercent instead - passing a fraction
 * here renders 100x too small.
 */
export function formatPercentPoints(points: number, locale: string = DEFAULT_LOCALE): string {
  return formatPercent(points / 100, locale);
}

/**
 * Format number
 */
export function formatNumber(value: number, locale: string = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Format distance in kilometers, e.g. "12 km".
 */
export function formatDistance(value: number, locale: string = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'kilometer',
    unitDisplay: 'short',
  }).format(value);
}
