/**
 * Audit Trail Module
 *
 * Deep module that owns all audit logging. Callers provide a high-level
 * description of what changed; this module handles diff computation,
 * timestamp enrichment, and batch writing for bulk operations.
 *
 * Interface: small — `audit.record()`, `audit.recordBulk()`, `audit.recordWithDiff()`.
 * Implementation: enrichment, batching, diff computation, retention awareness.
 */

import { Prisma } from '@/app/generated/prisma';
import type { AuditAction } from '@/app/generated/prisma';
import prisma from '@/lib/prisma/prisma';

type TransactionClient = Prisma.TransactionClient;

// Types

export interface AuditEntry {
  userId: string;
  action: AuditAction;
  tableName: string;
  recordId: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditDiffEntry extends AuditEntry {
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
}

export interface BulkAuditEntry {
  userId: string;
  action: AuditAction;
  tableName: string;
  recordIds: string[];
  metadata?: Record<string, unknown>;
}

// Core Functions

/**
 * Record a single audit event. Works inside or outside a transaction.
 */
export async function record(
  entry: AuditEntry,
  tx?: TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;

  await client.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      tableName: entry.tableName,
      recordId: entry.recordId,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      metadata: {
        timestamp: new Date().toISOString(),
        ...entry.metadata,
      },
    },
  });
}

/**
 * Record an audit event with before/after diff.
 * Computes a minimal diff — only changed fields are stored.
 */
export async function recordWithDiff(
  entry: AuditDiffEntry,
  tx?: TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;

  const { changedOld, changedNew } = computeDiff(entry.oldValues, entry.newValues);

  await client.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      tableName: entry.tableName,
      recordId: entry.recordId,
      oldValues: Object.keys(changedOld).length > 0
        ? (changedOld as Prisma.InputJsonObject)
        : Prisma.DbNull,
      newValues: Object.keys(changedNew).length > 0
        ? (changedNew as Prisma.InputJsonObject)
        : Prisma.DbNull,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      metadata: {
        timestamp: new Date().toISOString(),
        ...entry.metadata,
      },
    },
  });
}

/**
 * Record a bulk audit event. Writes a single audit row for N records
 * instead of N rows — appropriate for bulk status changes, deletions, etc.
 */
export async function recordBulk(
  entry: BulkAuditEntry,
  tx?: TransactionClient,
): Promise<void> {
  const client = tx ?? prisma;

  await client.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      tableName: entry.tableName,
      recordId: entry.recordIds.join(',') || 'none',
      metadata: {
        timestamp: new Date().toISOString(),
        bulk: true,
        count: entry.recordIds.length,
        ...entry.metadata,
      },
    },
  });
}

// Internal Helpers

/**
 * Computes a minimal diff between two objects.
 * Returns only the fields that actually changed.
 */
function computeDiff(
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
): { changedOld: Record<string, unknown>; changedNew: Record<string, unknown> } {
  const changedOld: Record<string, unknown> = {};
  const changedNew: Record<string, unknown> = {};

  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);

  for (const key of allKeys) {
    const oldVal = oldValues[key];
    const newVal = newValues[key];

    if (!deepEqual(oldVal, newVal)) {
      changedOld[key] = oldVal;
      changedNew[key] = newVal;
    }
  }

  return { changedOld, changedNew };
}

/** Simple deep equality check for JSON-serializable values. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  return JSON.stringify(a) === JSON.stringify(b);
}
