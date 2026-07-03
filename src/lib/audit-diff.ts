/**
 * Audit field-level diffs with redaction (#21).
 *
 * Pure module (no 'use server', no DB access): computeAuditDiff() turns full
 * before/after records into a minimal changed-fields-only diff. Sensitive
 * fields (internalNotes, pricing, credentials) are OMITTED from the stored
 * values entirely - the audit row records THAT a sensitive field changed
 * (via changedFields) but never its content.
 *
 * Consumed by createAuditLog() in src/lib/prisma/db-helpers.ts, which
 * previously structuredClone()d entire records into unbounded Json: anyone
 * with audit_logs:view could read pricing, internal notes - and, on the
 * users table, the bcrypt password hash of every edited user.
 */

import { Prisma } from '@/app/generated/prisma';

/**
 * Fields whose content never enters an audit row, on ANY table. Defense in
 * depth for credential-bearing records: users.password (a bcrypt hash) was
 * previously snapshotted verbatim by updateUser's audit write.
 */
const GLOBAL_SENSITIVE_FIELDS: ReadonlySet<string> = new Set([
  'password',
  'twoFactorSecret',
  'apiKey',
  'applicationKey',
]);

/**
 * Per-table sensitive fields (#21): internalNotes + pricing on services and
 * client commercial terms. The money fields of the Phase 4 invoice/payment
 * verticals are registered HERE, BEFORE those verticals write their first
 * audit row, so they cannot bake in the whole-snapshot leak (the Phase 4
 * entry-gate rationale for this issue).
 */
const SENSITIVE_FIELDS_BY_TABLE: Readonly<Record<string, readonly string[]>> = {
  services: [
    'internalNotes',
    'costAmount',
    'saleAmount',
    'margin',
    'marginPercentage',
    'costVatAmount',
    'saleVatAmount',
  ],
  clients: ['creditLimit', 'discount'],
  invoices: ['subtotal', 'taxAmount', 'totalAmount', 'paidAmount', 'irpfAmount'],
  invoice_items: ['quantity', 'unitPrice', 'amount', 'taxAmount'],
  payments: ['amount'],
};

/** Bookkeeping columns that would show as a "change" on every single write. */
const NOISE_FIELDS: ReadonlySet<string> = new Set(['createdAt', 'updatedAt']);

/** Whether a field's content must be kept out of audit rows for this table. */
export function isSensitiveAuditField(tableName: string, field: string): boolean {
  return (
    GLOBAL_SENSITIVE_FIELDS.has(field) ||
    (SENSITIVE_FIELDS_BY_TABLE[tableName] ?? []).includes(field)
  );
}

/**
 * Normalise a value for storage/comparison: Dates to ISO strings, Decimals
 * to their canonical string form (never through JS Number), Prisma's
 * DbNull/JsonNull sentinels and undefined to null, and nested objects with
 * stable key order so key ordering can never fake a change.
 */
export function normalizeAuditValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value === Prisma.DbNull || value === Prisma.JsonNull) return null;
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return value.toString();
  if (Array.isArray(value)) return value.map((item) => normalizeAuditValue(item));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, normalizeAuditValue(nested)])
    );
  }
  return value;
}

/**
 * Change detection. When either side is a Prisma.Decimal, compare with
 * Decimal.equals so DB reads (Decimal) and form inputs (number/string)
 * agree on numeric identity ('50' vs 50 vs '50.00' is NOT a change).
 * Comparison only - money arithmetic stays exclusively in src/lib/pricing.ts.
 */
function auditValuesEqual(a: unknown, b: unknown): boolean {
  if (Prisma.Decimal.isDecimal(a) || Prisma.Decimal.isDecimal(b)) {
    const aMissing = a === null || a === undefined;
    const bMissing = b === null || b === undefined;
    if (aMissing || bMissing) return aMissing === bMissing;
    try {
      const da = Prisma.Decimal.isDecimal(a) ? a : new Prisma.Decimal(a as string | number);
      const db = Prisma.Decimal.isDecimal(b) ? b : new Prisma.Decimal(b as string | number);
      return da.equals(db);
    } catch {
      return false;
    }
  }
  return JSON.stringify(normalizeAuditValue(a)) === JSON.stringify(normalizeAuditValue(b));
}

export interface AuditDiff {
  /** Changed fields' previous values (sensitive fields omitted); null when no before-image was given. */
  oldValues: Record<string, unknown> | null;
  /** Changed fields' new values (sensitive fields omitted); null when no after-image was given. */
  newValues: Record<string, unknown> | null;
  /** Names of every changed field, INCLUDING sensitive ones, sorted. */
  changedFields: string[];
}

/**
 * Compute the field-level diff between two record images.
 *
 * - UPDATE: pass both images; only keys whose values differ are kept.
 * - CREATE: pass only newValues; null fields are dropped (nothing changed
 *   from "absent"), oldValues stays null.
 * - DELETE: pass only oldValues - but prefer a minimal image at the call
 *   site (soft-deleted rows still exist; snapshotting them is duplication).
 *
 * Sensitive fields (isSensitiveAuditField) appear in changedFields but
 * never in oldValues/newValues.
 */
export function computeAuditDiff(
  tableName: string,
  oldValues: Record<string, unknown> | null,
  newValues: Record<string, unknown> | null
): AuditDiff {
  const before = oldValues ?? {};
  const after = newValues ?? {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  const changedFields: string[] = [];
  const oldDiff: Record<string, unknown> = {};
  const newDiff: Record<string, unknown> = {};

  for (const key of keys) {
    if (NOISE_FIELDS.has(key)) continue;

    const beforeValue = before[key];
    const afterValue = after[key];
    if (auditValuesEqual(beforeValue, afterValue)) continue;

    changedFields.push(key);

    // Sensitive content is omitted entirely: the row records THAT the field
    // changed (changedFields), never what it contains (#21).
    if (isSensitiveAuditField(tableName, key)) continue;

    if (oldValues) oldDiff[key] = normalizeAuditValue(beforeValue);
    if (newValues) newDiff[key] = normalizeAuditValue(afterValue);
  }

  changedFields.sort((a, b) => a.localeCompare(b));

  return {
    oldValues: oldValues ? oldDiff : null,
    newValues: newValues ? newDiff : null,
    changedFields,
  };
}
