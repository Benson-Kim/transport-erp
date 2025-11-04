/**
 * Database Helper Functions
 * Common utilities for database operations
 */

import { Prisma, PrismaClient} from '@prisma/client';
import prisma from './prisma';

/**
 * Soft Delete Helper
 * Adds soft delete conditions to queries
 */
export function excludeDeleted<
  Model extends keyof PrismaClient, // e.g. "user" | "post"
>(
  where?: Prisma.Args<PrismaClient[Model], 'findMany'>['where']
): Prisma.Args<PrismaClient[Model], 'findMany'>['where'] {
  return {
    ...where,
    deletedAt: null,
  } as Prisma.Args<PrismaClient[Model], 'findMany'>['where'];
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
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(100, Math.max(1, params.limit || 20));
  const skip = (page - 1) * limit;

  return {
    skip,
    take: limit,
    orderBy: params.sortBy
      ? { [params.sortBy]: params.sortOrder || 'asc' }
      : undefined,
  };
}

/**
 * Create paginated response
 */
export function createPaginatedResponse<T>(
  data: T[],
  total: number,
  params: PaginationParams,
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
 * Audit Log Creator
 * Creates audit log entries for database changes
 */
export async function createAuditLog({
  userId,
  action,
  tableName,
  recordId,
  oldValues,
  newValues,
  ipAddress,
  userAgent,
}: {
  userId?: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';
  tableName: string;
  recordId: string;
  oldValues?: any;
  newValues?: any;
  ipAddress?: string;
  userAgent?: string;
}) {
  return prisma.auditLog.create({
  data: {
    userId: userId ?? null,
    action,
    tableName,
    recordId,
    oldValues: oldValues ? JSON.parse(JSON.stringify(oldValues)) : null,
    newValues: newValues ? JSON.parse(JSON.stringify(newValues)) : null,
    ipAddress: ipAddress ?? null,
    userAgent: userAgent ?? null,
    metadata: {
      timestamp: new Date().toISOString(),
    },
  },
});

}

/**
 * Batch Operations Helper
 * Process large datasets in batches
 */
export async function processBatch<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>,
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
 * Transaction Helper
 * Wrapper for Prisma transactions with error handling
 */
type IsolationLevel = "ReadUncommitted" | "ReadCommitted" | "RepeatableRead" | "Serializable";

export async function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      try {
        return await fn(tx);
      } catch (error) {
        console.error('Transaction failed:', error);
        throw error;
      }
    },
    {
      maxWait: 5000,
      timeout: 10000,
      isolationLevel:"Serializable" as IsolationLevel,
    },
  );
}

/**
 * Soft Delete Function
 * Marks a record as deleted instead of removing it
 */
export async function softDelete(
  model: string,
  id: string,
  userId?: string,
): Promise<void> {
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
export async function restore(
  model: string,
  id: string,
  userId?: string,
): Promise<void> {
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
  batchSize: number = 1000,
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
  fields: string[],
): { text: string; params: any[] } {
  const pattern = `%${searchTerm.toLowerCase()}%`;
  const clauses = fields.map((field, idx) => `"${field}" ILIKE $${idx + 1}`);
  return {
    text: `(${clauses.join(" OR ")})`,
    params: Array(fields.length).fill(pattern),
  };
}


/**
 * Date Range Filter
 */
export interface DateRangeFilter {
  from?: Date;
  to?: Date;
}

export function createDateRangeCondition(
  field: string,
  range: DateRangeFilter,
) {
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
 * Generate Unique Identifier
 * Creates unique identifiers for various entities
 */
export async function generateUniqueIdentifier(
  prefix: string,
  model: string,
  field: string,
): Promise<string> {
  const year = new Date().getFullYear();
  
  // Get the last number for this prefix and year
  const lastRecord = await (prisma as any)[model].findFirst({
    where: {
      [field]: {
        startsWith: `${prefix}-${year}-`,
      },
    },
    orderBy: {
      [field]: 'desc',
    },
  });

  let nextNumber = 1;
  if (lastRecord && lastRecord[field]) {
    const parts = lastRecord[field].split('-');
    const currentNumber = parseInt(parts[parts.length - 1], 10);
    nextNumber = currentNumber + 1;
  }

  return `${prefix}-${year}-${String(nextNumber).padStart(5, '0')}`;
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
  generateUniqueIdentifier,
  checkDatabaseHealth,
};