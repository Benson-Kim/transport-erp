/**
 * Database Helper Functions
 * Common utilities for database operations
 */

import type { AuditAction, Prisma, PrismaClient } from '@/app/generated/prisma';
import { computeAuditDiff } from '@/lib/audit-diff';
import { getRequestId } from '@/lib/request-context';

import prisma from './prisma';

/**
 * Soft Delete Helper
 * Adds soft delete conditions to queries
 */
export function excludeDeleted<
  Model extends keyof PrismaClient, // e.g. "user" | "post"
>(
  where?: Prisma.Args<PrismaClient[Model], 'findMany'>['where']
): NonNullable<Prisma.Args<PrismaClient[Model], 'findMany'>['where']> {
  return {
    ...where,
    deletedAt: null,
  } as NonNullable<Prisma.Args<PrismaClient[Model], 'findMany'>['where']>;
}

/**
 * Pagination Helper
 * Converts page/limit to skip/take
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export function getPaginationParams(params: PaginationParams) {
  const page = Math.max(1, Math.floor(params.page ?? 1) || 1);
  // #45: default 20 only when the caller passed nothing; explicit invalid
  // values (0, negatives, NaN) floor at 1 instead of silently widening to
  // the default, and everything is hard-capped at 100.
  const limit = Math.min(100, Math.max(1, Math.floor(params.limit ?? 20) || 1));
  const skip = (page - 1) * limit;

  return {
    skip,
    take: limit,
    orderBy: params.sortBy ? { [params.sortBy]: params.sortOrder || 'asc' } : undefined,
  };
}

/**
 * Create paginated response
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginationResult<T> {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}

/**
 * Audit Log Creator (#27)
 * Creates audit log entries for database changes.
 *
 * Pass the surrounding transaction client as `client` so the audit row
 * commits - or rolls back - atomically with the mutation it records.
 * Without it a failed audit insert leaves a committed mutation with no
 * audit trail (silent audit gap).
 *
 * Typed structurally (method shorthand for parameter bivariance): model
 * delegate generics differ between the base client, an interactive
 * transaction client, and the $extends-ed singleton under
 * exactOptionalPropertyTypes - the same pattern as bumpUserTokenVersion
 * and numbering.ts, proven against this compiler configuration.
 */
export type AuditLogWriter = {
  auditLog: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
};

export async function createAuditLog(
  {
    userId,
    action,
    tableName,
    recordId,
    oldValues,
    newValues,
    ipAddress,
    userAgent,
    requestId,
    metadata,
  }: {
    userId?: string | undefined;
    action: AuditAction;
    tableName: string;
    recordId: string;
    /** Full or partial before-image; reduced to a field-level diff (#21). */
    oldValues?: object | null | undefined;
    /** Full or partial after-image; reduced to a field-level diff (#21). */
    newValues?: object | null | undefined;
    ipAddress?: string | undefined;
    userAgent?: string | undefined;
    /** Correlation id; defaults to the x-request-id minted by proxy.ts (#21). */
    requestId?: string | undefined;
    metadata?: Record<string, any> | undefined;
  },
  client: AuditLogWriter = prisma
) {
  // Field-level diffs with redaction (#21): the previous structuredClone
  // whole-record snapshots leaked internalNotes/pricing (and, via
  // user-actions, bcrypt password hashes) to anyone with audit_logs:view,
  // and grew unbounded. computeAuditDiff stores changed keys only and omits
  // sensitive content; sensitive field NAMES are still recorded in
  // metadata.changedFields so the trail stays complete-but-minimal.
  const diff = computeAuditDiff(
    tableName,
    oldValues ? ({ ...oldValues } as Record<string, unknown>) : null,
    newValues ? ({ ...newValues } as Record<string, unknown>) : null
  );

  return client.auditLog.create({
    data: {
      userId: userId ?? null,
      action,
      tableName,
      recordId,
      oldValues: diff.oldValues,
      newValues: diff.newValues,
      ipAddress: ipAddress ?? null,
      userAgent: userAgent ?? null,
      requestId: requestId ?? (await getRequestId()) ?? null,
      metadata: {
        timestamp: new Date().toISOString(),
        ...(diff.changedFields.length > 0 ? { changedFields: diff.changedFields } : {}),
        ...metadata,
      },
    },
  });
}

/**
 * Increment a user's tokenVersion to revoke all their existing JWTs. (#15)
 *
 * Call on security events (deactivation, role change, credential reset).
 * The jwt callback compares the token's version to the DB value and revokes
 * on mismatch, so this takes effect on the user's next request. Accepts an
 * optional transaction client so it can run atomically with the triggering
 * mutation.
 */
export async function bumpUserTokenVersion(
  userId: string,
  // Typed structurally against a raw-query capability (review !15 pattern):
  // model-delegate types differ between the base client, the transaction
  // client, and the $extends-ed singleton (their generic `update` signatures
  // are mutually incompatible under exactOptionalPropertyTypes), but
  // $executeRaw is shared by all three - the same shape numbering.ts uses
  // for $queryRaw, proven against this compiler configuration.
  client: Pick<PrismaClient, '$executeRaw'> = prisma
): Promise<void> {
  // Atomic increment on users.tokenVersion (names verified against migration
  // 20260701000007). updatedAt is touched to preserve the semantics of the
  // Prisma update() this replaces (@updatedAt is client-side only).
  await client.$executeRaw`
    UPDATE "users"
    SET "tokenVersion" = "tokenVersion" + 1, "updatedAt" = now()
    WHERE "id" = ${userId}
  `;
}

/**
 * Batch Operations Helper
 * Process large datasets in batches
 */
export async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Transaction Helper (#27)
 *
 * Defaults to ReadCommitted; money-critical paths opt into Serializable.
 * Serialization failures (Postgres 40001, surfaced by Prisma as P2034) are
 * retried with exponential backoff and jitter - the whole callback re-runs,
 * so keep side effects inside the transaction idempotent. Other errors
 * propagate immediately.
 */
type IsolationLevel = 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable';

export interface WithTransactionOptions {
  isolationLevel?: IsolationLevel;
  /** Retries for serialization failures only. */
  maxRetries?: number;
  maxWait?: number;
  timeout?: number;
}

/** Postgres serialization_failure (40001); Prisma reports it as P2034. */
function isSerializationFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; meta?: { code?: unknown } };
  return (
    candidate.code === 'P2034' || candidate.code === '40001' || candidate.meta?.code === '40001'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function withTransaction<T>(
  fn: (tx: typeof prisma) => Promise<T>,
  options: WithTransactionOptions = {}
): Promise<T> {
  const {
    isolationLevel = 'ReadCommitted',
    maxRetries = 3,
    maxWait = 5000,
    timeout = 10000,
  } = options;

  let attempt = 0;
  for (;;) {
    try {
      // eslint-disable-next-line no-await-in-loop -- retry loop is sequential by design
      const result = await prisma.$transaction(async (tx) => fn(tx as typeof prisma), {
        maxWait,
        timeout,
        isolationLevel,
      });
      return result;
    } catch (error) {
      if (!isSerializationFailure(error) || attempt >= maxRetries) {
        console.error('Transaction failed:', error);
        throw error;
      }
      attempt += 1;
      // eslint-disable-next-line no-await-in-loop -- backoff before the retry
      await sleep(2 ** attempt * 25 + Math.floor(Math.random() * 25));
    }
  }
}

/**
 * Soft Delete Function
 * Marks a record as deleted instead of removing it
 */
export async function softDelete(model: string, id: string, userId?: string): Promise<void> {
  const now = new Date();

  // Create audit log
  if (userId) {
    await createAuditLog({
      userId,
      action: 'DELETE',
      tableName: model,
      recordId: id,
      oldValues: { deletedAt: null },
      newValues: { deletedAt: now },
    });
  }

  // Perform soft delete
  await (prisma as any)[model].update({
    where: { id },
    data: { deletedAt: now },
  });
}

/**
 * Restore Soft Deleted Record
 */
export async function restore(model: string, id: string, userId?: string): Promise<void> {
  // Create audit log
  if (userId) {
    await createAuditLog({
      userId,
      action: 'RESTORE',
      tableName: model,
      recordId: id,
      oldValues: { deletedAt: 'not-null' },
      newValues: { deletedAt: null },
    });
  }

  // Restore record
  await (prisma as any)[model].update({
    where: { id },
    data: { deletedAt: null },
  });
}

/**
 * Bulk Insert Helper
 * Handles large data inserts efficiently
 */
export async function bulkInsert<T>(
  model: string,
  data: T[],
  batchSize: number = 1000
): Promise<number> {
  let inserted = 0;

  await processBatch(data, batchSize, async (batch) => {
    const result = await (prisma as any)[model].createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += result.count;
    return [result];
  });

  return inserted;
}

/**
 * Search Helper
 * Creates text search conditions
 */
export function createSearchCondition(
  searchTerm: string,
  fields: string[]
): { text: string; params: any[] } {
  const pattern = `%${searchTerm.toLowerCase()}%`;
  const clauses = fields.map((field, idx) => `"${field}" ILIKE $${idx + 1}`);
  return {
    text: `(${clauses.join(' OR ')})`,
    params: new Array(fields.length).fill(pattern),
  };
}

/**
 * Date Range Filter
 */
export interface DateRangeFilter {
  from?: Date;
  to?: Date;
}

export function createDateRangeCondition(field: string, range: DateRangeFilter) {
  const conditions: any = {};

  if (range.from) {
    conditions[field] = {
      ...conditions[field],
      gte: range.from,
    };
  }

  if (range.to) {
    conditions[field] = {
      ...conditions[field],
      lte: range.to,
    };
  }

  return conditions;
}

/**
 * Database Health Check
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  latency: number;
  error?: string;
}> {
  const startTime = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      connected: true,
      latency: Date.now() - startTime,
    };
  } catch (error) {
    return {
      connected: false,
      latency: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Export utilities
 */
export const dbHelpers = {
  excludeDeleted,
  getPaginationParams,
  createPaginatedResponse,
  createAuditLog,
  processBatch,
  withTransaction,
  softDelete,
  restore,
  bulkInsert,
  createSearchCondition,
  createDateRangeCondition,
  checkDatabaseHealth,
};
