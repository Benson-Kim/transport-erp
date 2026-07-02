/**
 * Canonical pricing module (#25).
 *
 * Single source of truth for every money computation in the app: margin,
 * margin %, markup %, ROI, VAT, IRPF and totals. Pure module - no
 * 'use server', no I/O - so it is unit-testable and usable from BOTH client
 * components (PricingCalculator, ServiceForm) and the server actions.
 *
 * All arithmetic is performed in Prisma's Decimal (decimal.js) - money never
 * passes through JS binary floats. The only sanctioned exit to `number` is
 * decimalToNumber(), for display/DTO boundaries; the money-path lint rule
 * (eslint.config.mjs, project:money-paths) forbids Number(...) elsewhere.
 *
 * Rounding: half-up to 2 decimal places for money amounts, matching the
 * seed's canonical Math.round(x * 100) / 100 (prisma/seed.ts) and the
 * Decimal(10,2) database columns.
 */

import { Decimal } from '@/app/generated/prisma/runtime/library';

export type MoneyInput = Decimal | number | string;

export const ZERO = new Decimal(0);

/** Convert any accepted money input to Decimal. Throws on non-finite input. */
export function toDecimal(value: MoneyInput): Decimal {
  const decimal = value instanceof Decimal ? value : new Decimal(value);
  if (!decimal.isFinite()) {
    throw new TypeError(`Invalid money value: ${String(value)}`);
  }
  return decimal;
}

/** Round to 2 decimal places, half-up (seed-canonical money rounding). */
export function round2(value: MoneyInput): Decimal {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Gross margin: sale - cost, 2dp. cost === 0 is a valid input (margin = sale). */
export function margin(sale: MoneyInput, cost: MoneyInput): Decimal {
  return round2(toDecimal(sale).minus(toDecimal(cost)));
}

/**
 * Margin in percent POINTS of the sale: (sale - cost) / sale * 100, 2dp.
 * Returns 0 only when sale <= 0 (undefined ratio) - NOT when cost is 0:
 * cost = 0 yields 100%. This replaces the falsy-cost guard bug where
 * `sale && cost ? ... : 0` showed margin 0 for a legitimately free cost.
 */
export function marginPercentage(sale: MoneyInput, cost: MoneyInput): Decimal {
  const saleDecimal = toDecimal(sale);
  if (saleDecimal.lessThanOrEqualTo(0)) {
    return ZERO;
  }
  return round2(saleDecimal.minus(toDecimal(cost)).dividedBy(saleDecimal).times(100));
}

/** Markup in percent points of the cost: (sale - cost) / cost * 100, 2dp. 0 when cost <= 0. */
export function markupPercentage(sale: MoneyInput, cost: MoneyInput): Decimal {
  const costDecimal = toDecimal(cost);
  if (costDecimal.lessThanOrEqualTo(0)) {
    return ZERO;
  }
  return round2(toDecimal(sale).minus(costDecimal).dividedBy(costDecimal).times(100));
}

/** Return on investment: (sale - cost) / cost, 2dp. 0 when cost <= 0. */
export function roi(sale: MoneyInput, cost: MoneyInput): Decimal {
  const costDecimal = toDecimal(cost);
  if (costDecimal.lessThanOrEqualTo(0)) {
    return ZERO;
  }
  return round2(toDecimal(sale).minus(costDecimal).dividedBy(costDecimal));
}

/** VAT amount for a net amount at a rate in percent points (21 -> 21%), 2dp. */
export function vatAmount(net: MoneyInput, ratePoints: MoneyInput): Decimal {
  return round2(toDecimal(net).times(toDecimal(ratePoints)).dividedBy(100));
}

/** IRPF retention (Spain) for a net amount at a rate in percent points, 2dp. */
export function irpfAmount(net: MoneyInput, ratePoints: MoneyInput): Decimal {
  return round2(toDecimal(net).times(toDecimal(ratePoints)).dividedBy(100));
}

/** Net + VAT, 2dp. */
export function totalWithVat(net: MoneyInput, ratePoints: MoneyInput): Decimal {
  return round2(toDecimal(net).plus(vatAmount(net, ratePoints)));
}

/**
 * Sale price that yields a target margin percentage:
 * sale = cost / (1 - points / 100), 2dp. Target must be in [0, 100).
 */
export function saleForTargetMarginPercentage(
  cost: MoneyInput,
  targetPoints: MoneyInput
): Decimal {
  const points = toDecimal(targetPoints);
  if (points.isNegative() || points.greaterThanOrEqualTo(100)) {
    throw new RangeError('Target margin percentage must be in [0, 100)');
  }
  return round2(toDecimal(cost).dividedBy(new Decimal(1).minus(points.dividedBy(100))));
}

export const DEFAULT_VAT_RATE = 21;

export interface ServicePricingInput {
  costAmount: MoneyInput;
  saleAmount: MoneyInput;
  /** Percent points, e.g. 21 for 21%. Defaults to DEFAULT_VAT_RATE. */
  costVatRate?: MoneyInput;
  /** Percent points, e.g. 21 for 21%. Defaults to DEFAULT_VAT_RATE. */
  saleVatRate?: MoneyInput;
}

export interface ServicePricing {
  margin: Decimal;
  marginPercentage: Decimal;
  costVatAmount: Decimal;
  saleVatAmount: Decimal;
  costTotalWithVat: Decimal;
  saleTotalWithVat: Decimal;
}

/**
 * Full derived pricing for a service - used identically by the form, the
 * calculator and the server actions, so client and server cannot drift.
 */
export function computeServicePricing(input: ServicePricingInput): ServicePricing {
  const cost = toDecimal(input.costAmount);
  const sale = toDecimal(input.saleAmount);
  const costRate = toDecimal(input.costVatRate ?? DEFAULT_VAT_RATE);
  const saleRate = toDecimal(input.saleVatRate ?? DEFAULT_VAT_RATE);

  return {
    margin: margin(sale, cost),
    marginPercentage: marginPercentage(sale, cost),
    costVatAmount: vatAmount(cost, costRate),
    saleVatAmount: vatAmount(sale, saleRate),
    costTotalWithVat: totalWithVat(cost, costRate),
    saleTotalWithVat: totalWithVat(sale, saleRate),
  };
}

export interface ServiceAmounts {
  costAmount: Decimal;
  saleAmount: Decimal;
  margin: Decimal;
  marginPercentage: Decimal;
  costVatAmount: Decimal;
  saleVatAmount: Decimal;
}

const ZERO_AMOUNTS: ServiceAmounts = {
  costAmount: ZERO,
  saleAmount: ZERO,
  margin: ZERO,
  marginPercentage: ZERO,
  costVatAmount: ZERO,
  saleVatAmount: ZERO,
};

/**
 * Effective (presentational) amounts for a service (#28): a CANCELLED
 * service presents as €0 without the booked figures being destroyed, so
 * reactivating the service restores them. The stored row keeps the
 * original amounts; displays derive zeros from the status.
 */
export function effectiveServiceAmounts(
  isCancelled: boolean,
  amounts: ServiceAmounts
): ServiceAmounts {
  return isCancelled ? ZERO_AMOUNTS : amounts;
}

/**
 * The ONLY sanctioned Decimal -> number conversion, for display and DTO
 * boundaries (Intl formatters, charts, JSON responses). Never feed the
 * result back into money arithmetic.
 */
export function decimalToNumber(value: MoneyInput): number {
  return toDecimal(value).toNumber();
}
