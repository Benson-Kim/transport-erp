/**
 * Utility barrel for src/lib/utils.
 *
 * Components import from '@/lib/utils' (the canonical path); this barrel
 * re-exports the canonical implementations so there is ONE source per
 * concern. Consolidation of the duplicate cn.ts copies is #57's scope.
 */
export { formatCurrency, formatPercent, formatPercentPoints, formatNumber, formatDistance } from './formatting';
export { formatDate, toDate } from './date-formats';
export { cn } from './cn';