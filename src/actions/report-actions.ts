/**
 * Report Server Actions (#33).
 *
 * Thin RBAC + composition layer: the SQL lives in lib/reports/queries.ts,
 * the Decimal -> DTO math in lib/reports/dto.ts. Every action opens with
 * requirePermission(reports:view).
 */

'use server';

import { RESOURCES, ACTIONS } from '@/lib/permissions';
import {
  lastMonthsRange,
  summarizeFinancials,
  toClientMarginsDto,
  toMonthlyFinancialsDto,
  type ClientMarginsDto,
  type FinancialsDto,
  type MonthlyFinancialsDto,
} from '@/lib/reports/dto';
import { queryClientMargins, queryMonthlyFinancials } from '@/lib/reports/queries';
import { requirePermission } from '@/lib/rbac';
import type { ActionResult } from '@/types/client';

const REPORT_MONTHS = 12;
const TOP_CLIENTS_LIMIT = 20;

export interface RevenueReportData {
  months: MonthlyFinancialsDto[];
  totals: FinancialsDto;
}

export interface MarginsReportData {
  months: MonthlyFinancialsDto[];
  totals: FinancialsDto;
  clients: ClientMarginsDto[];
}

/** Recognized revenue, cost and margin by month, last 12 months. */
export async function getRevenueReport(): Promise<ActionResult<RevenueReportData>> {
  try {
    await requirePermission(RESOURCES.REPORTS, ACTIONS.VIEW);

    const rows = await queryMonthlyFinancials(lastMonthsRange(REPORT_MONTHS));

    return {
      success: true,
      data: {
        months: toMonthlyFinancialsDto(rows),
        totals: summarizeFinancials(rows),
      },
    };
  } catch (error) {
    console.error('Failed to build revenue report:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build revenue report',
    };
  }
}

/** Margin by month plus the top clients by contributed margin, last 12 months. */
export async function getMarginsReport(): Promise<ActionResult<MarginsReportData>> {
  try {
    await requirePermission(RESOURCES.REPORTS, ACTIONS.VIEW);

    const range = lastMonthsRange(REPORT_MONTHS);
    const [rows, clients] = await Promise.all([
      queryMonthlyFinancials(range),
      queryClientMargins(range, TOP_CLIENTS_LIMIT),
    ]);

    return {
      success: true,
      data: {
        months: toMonthlyFinancialsDto(rows),
        totals: summarizeFinancials(rows),
        clients: toClientMarginsDto(clients),
      },
    };
  } catch (error) {
    console.error('Failed to build margins report:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to build margins report',
    };
  }
}
