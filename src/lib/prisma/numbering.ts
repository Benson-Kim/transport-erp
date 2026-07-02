/**
 * Business-number allocation (issue #12).
 *
 * Produces immutable, gap-tolerant document numbers of the form
 * `PREFIX-YYYY-NNNNN` (e.g. `SRV-2026-00042`). The next value for a given
 * prefix+year scope is allocated atomically from the `document_counters` table
 * using INSERT ... ON CONFLICT DO UPDATE ... RETURNING, which takes a row lock
 * and serialises concurrent allocations. This replaces the previous
 * count()+1 / findFirst()+1 approaches, which raced and caused duplicate
 * numbers / P2002 errors.
 *
 * Call this INSIDE the create transaction so the counter bump and the row
 * insert commit (or roll back) together.
 *
 * DEFERRED to the settings phase: honouring SettingKey.NUMBER_SEQUENCES /
 * number-format.ts for admin-configurable formats. Until wired, the format
 * here is the single source of truth.
 */

import type { PrismaClient } from '@/app/generated/prisma';

/** Number of zero-padded digits in the sequential part. */
const SEQUENCE_WIDTH = 5;

/**
 * Anything that can run a raw query: the base client, an interactive
 * $transaction client, or the app's $extends-ed singleton. Typed structurally
 * (review !15 item 1) because an extended client is neither `PrismaClient`
 * nor `Prisma.TransactionClient`.
 */
type PrismaLike = Pick<PrismaClient, '$queryRaw'>;

interface CounterRow {
  value: bigint;
}

/**
 * Format a scope key for a prefix and year, e.g. ('SRV', 2026) -> 'SRV-2026'.
 * Exported for tests and for callers that need to inspect a scope.
 */
export function counterScope(prefix: string, year: number): string {
  return `${prefix}-${year}`;
}

/**
 * Format a full document number from its parts.
 * ('SRV', 2026, 42) -> 'SRV-2026-00042'.
 */
export function formatDocumentNumber(prefix: string, year: number, value: bigint | number): string {
  return `${prefix}-${year}-${String(value).padStart(SEQUENCE_WIDTH, '0')}`;
}

/**
 * Atomically allocate the next document number for a prefix within a year.
 *
 * @param client Prisma client or transaction client. Prefer the transaction
 *   client of the surrounding create so allocation and insert are atomic.
 * @param prefix Document prefix, e.g. 'SRV', 'INV', 'PAY', 'LO'.
 * @param year   Calendar year for the scope. Defaults to the current year.
 */
export async function generateDocumentNumber(
  client: PrismaLike,
  prefix: string,
  year: number = new Date().getFullYear()
): Promise<string> {
  const scope = counterScope(prefix, year);

  const rows = await client.$queryRaw<CounterRow[]>`
    INSERT INTO "document_counters" ("scope", "value", "updatedAt")
    VALUES (${scope}, 1, now())
    ON CONFLICT ("scope")
    DO UPDATE SET "value" = "document_counters"."value" + 1, "updatedAt" = now()
    RETURNING "value";
  `;

  const next = rows[0]?.value;
  if (next === undefined) {
    throw new Error(`Failed to allocate document number for scope "${scope}"`);
  }

  return formatDocumentNumber(prefix, year, next);
}
