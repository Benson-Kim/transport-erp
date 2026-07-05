/**
 * Report SQL (#33).
 *
 * The aggregation for the revenue and margins reports runs IN Postgres:
 * GROUP BY over date_trunc('month') / clientId with SUM on the Decimal
 * money columns - no service rows are streamed into JS. Raw SQL rather
 * than prisma.groupBy because the $extends(withAccelerate()) client
 * collapses groupBy's inferred payload to {}[] (see
 * calculateSupplierStats, !20).
 *
 * Status filtering interpolates RECOGNIZED_REVENUE_STATUSES - the single
 * revenue definition (src/lib/revenue.ts) - with each value cast to the
 * "ServiceStatus" enum so the (date, status) index stays usable.
 *
 * Not a 'use server' module: report-actions.ts wraps these in RBAC; the
 * SQL lives here so tests/db can drive it against a real database.
 */

import { Prisma } from '@/app/generated/prisma';
import prisma from '@/lib/prisma/prisma';
import { RECOGNIZED_REVENUE_STATUSES } from '@/lib/revenue';

import type { ClientMarginsRow, MonthlyFinancialsRow, ReportRange } from './dto';

/** RECOGNIZED_REVENUE_STATUSES as enum-typed SQL parameters. */
function recognizedStatusesSql(): Prisma.Sql {
  return Prisma.join(
    RECOGNIZED_REVENUE_STATUSES.map((status) => Prisma.sql`${status}::"ServiceStatus"`)
  );
}

/** Recognized revenue, cost and margin per calendar month in [start, end). */
export async function queryMonthlyFinancials(range: ReportRange): Promise<MonthlyFinancialsRow[]> {
  return prisma.$queryRaw<MonthlyFinancialsRow[]>`
    SELECT
      -- #65 / ADR 0002: "date" is timestamp WITHOUT time zone holding UTC
      -- instants, so date_trunc('month', ...) buckets deterministically in
      -- UTC regardless of the session TimeZone. Do NOT cast to timestamptz
      -- here - that is what WOULD make bucketing session-TZ-dependent.
      date_trunc('month', "date") AS "month",
      COUNT(*)::int AS "services",
      COALESCE(SUM("saleAmount"), 0) AS "revenue",
      COALESCE(SUM("costAmount"), 0) AS "cost",
      COALESCE(SUM("margin"), 0) AS "margin"
    FROM "services"
    WHERE "deletedAt" IS NULL
      AND "status" IN (${recognizedStatusesSql()})
      AND "date" >= ${range.start}
      AND "date" < ${range.end}
    GROUP BY 1
    ORDER BY 1
  `;
}

/**
 * Recognized revenue and margin per client in [start, end), largest
 * contributed margin first.
 */
export async function queryClientMargins(
  range: ReportRange,
  limit: number
): Promise<ClientMarginsRow[]> {
  return prisma.$queryRaw<ClientMarginsRow[]>`
    SELECT
      s."clientId" AS "clientId",
      c."name" AS "clientName",
      COUNT(*)::int AS "services",
      COALESCE(SUM(s."saleAmount"), 0) AS "revenue",
      COALESCE(SUM(s."costAmount"), 0) AS "cost",
      COALESCE(SUM(s."margin"), 0) AS "margin"
    FROM "services" s
    JOIN "clients" c ON c."id" = s."clientId"
    WHERE s."deletedAt" IS NULL
      AND s."status" IN (${recognizedStatusesSql()})
      AND s."date" >= ${range.start}
      AND s."date" < ${range.end}
    GROUP BY s."clientId", c."name"
    ORDER BY SUM(s."margin") DESC
    LIMIT ${limit}
  `;
}
