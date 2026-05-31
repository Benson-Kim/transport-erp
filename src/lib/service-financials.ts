/**
 * Service Financial Calculations
 *
 * Pure function module — no I/O, no Prisma, no side effects.
 * Single source of truth for margin, VAT, and financial computations
 * used by createService, updateService, and bulk order processing.
 */

export interface FinancialInput {
  costAmount: number;
  saleAmount: number;
  costVatRate?: number;
  saleVatRate?: number;
  cancelled?: boolean;
}

export interface FinancialResult {
  costAmount: number;
  saleAmount: number;
  margin: number;
  marginPercentage: number;
  costVatAmount: number;
  saleVatAmount: number;
  costVatRate: number;
  saleVatRate: number;
}

const DEFAULT_VAT_RATE = 21;

/**
 * Computes margin, margin percentage, and VAT amounts for a service.
 *
 * When `cancelled` is true, all financial fields are zeroed.
 * All results are rounded to 2 decimal places.
 */
export function computeFinancials(input: FinancialInput): FinancialResult {
  const costVatRate = input.costVatRate ?? DEFAULT_VAT_RATE;
  const saleVatRate = input.saleVatRate ?? DEFAULT_VAT_RATE;

  if (input.cancelled) {
    return {
      costAmount: 0,
      saleAmount: 0,
      margin: 0,
      marginPercentage: 0,
      costVatAmount: 0,
      saleVatAmount: 0,
      costVatRate,
      saleVatRate,
    };
  }

  const { costAmount, saleAmount } = input;
  const margin = saleAmount - costAmount;
  const marginPercentage = saleAmount > 0 ? (margin / saleAmount) * 100 : 0;
  const costVatAmount = costAmount * (costVatRate / 100);
  const saleVatAmount = saleAmount * (saleVatRate / 100);

  return {
    costAmount,
    saleAmount,
    margin: round2(margin),
    marginPercentage: round2(marginPercentage),
    costVatAmount: round2(costVatAmount),
    saleVatAmount: round2(saleVatAmount),
    costVatRate,
    saleVatRate,
  };
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}
