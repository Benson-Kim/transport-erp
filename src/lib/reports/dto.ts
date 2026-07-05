/**
 * Report DTO math (#33).
 *
 * Pure module - no 'use server', no I/O. The Decimal -> number conversion
 * for the reports happens HERE, at the DTO boundary, and nowhere earlier:
 * SQL sums arrive as Prisma Decimal (lib/reports/queries.ts) and every
 * derived figure (totals, weighted margin %) is computed in Decimal through
 * pricing.ts before the single decimalToNumber exit.
 */

import { decimalToNumber, marginPercentage, toDecimal, ZERO, type MoneyInput } from '@/lib/pricing';

/** Half-open month-aligned window: start inclusive, end exclusive. */
export interface ReportRange {
  start: Date;
  end: Date;
}

/**
 * The last `months` calendar months including the current one:
 * [startOfUtcMonth(now - (months - 1)), startOfUtcMonth(now + 1)).
 *
 * #65 / ADR 0002: boundaries are computed in UTC (Date.UTC month
 * arithmetic), NOT with date-fns startOfMonth/subMonths, which operate in
 * server-local time and shift the month boundary on non-UTC deployments
 * while the stored "date" column holds UTC instants. Date.UTC normalizes
 * out-of-range months (month -3, month 13) per spec, so no clamping is
 * needed.
 */
export function lastMonthsRange(months: number, now: Date = new Date()): ReportRange {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month - (months - 1), 1)),
    end: new Date(Date.UTC(year, month + 1, 1)),
  };
}

/** Raw SQL aggregate row: money stays Decimal until the DTO mappers below. */
export interface MonthlyFinancialsRow {
  month: Date;
  services: number;
  revenue: MoneyInput;
  cost: MoneyInput;
  margin: MoneyInput;
}

export interface ClientMarginsRow {
  clientId: string;
  clientName: string;
  services: number;
  revenue: MoneyInput;
  cost: MoneyInput;
  margin: MoneyInput;
}

export interface FinancialsDto {
  services: number;
  revenue: number;
  cost: number;
  margin: number;
  /** Weighted margin in percent points: SUM(margin) / SUM(revenue) * 100. */
  marginPercentage: number;
}

export interface MonthlyFinancialsDto extends FinancialsDto {
  month: Date;
}

export interface ClientMarginsDto extends FinancialsDto {
  clientId: string;
  clientName: string;
}

/**
 * marginPercentage is DERIVED from revenue/cost while margin is the summed
 * STORED column. The two agree because every write path stores
 * margin = saleAmount - costAmount (pricing.ts margin(), #11 money CHECK
 * family at the database). If that invariant ever changes, derive the
 * percentage from the summed margin instead.
 */
function financialsDto(row: {
  services: number;
  revenue: MoneyInput;
  cost: MoneyInput;
  margin: MoneyInput;
}): FinancialsDto {
  return {
    services: row.services,
    revenue: decimalToNumber(row.revenue),
    cost: decimalToNumber(row.cost),
    margin: decimalToNumber(row.margin),
    marginPercentage: decimalToNumber(marginPercentage(row.revenue, row.cost)),
  };
}

export function toMonthlyFinancialsDto(rows: MonthlyFinancialsRow[]): MonthlyFinancialsDto[] {
  return rows.map((row) => ({ month: row.month, ...financialsDto(row) }));
}

export function toClientMarginsDto(rows: ClientMarginsRow[]): ClientMarginsDto[] {
  return rows.map((row) => ({
    clientId: row.clientId,
    clientName: row.clientName,
    ...financialsDto(row),
  }));
}

/** Grand totals over the aggregate rows, summed in Decimal (#25). */
export function summarizeFinancials(
  rows: Array<Pick<MonthlyFinancialsRow, 'services' | 'revenue' | 'cost' | 'margin'>>
): FinancialsDto {
  let revenue = ZERO;
  let cost = ZERO;
  let marginSum = ZERO;
  let services = 0;

  for (const row of rows) {
    revenue = revenue.plus(toDecimal(row.revenue));
    cost = cost.plus(toDecimal(row.cost));
    marginSum = marginSum.plus(toDecimal(row.margin));
    services += row.services;
  }

  return financialsDto({ services, revenue, cost, margin: marginSum });
}
