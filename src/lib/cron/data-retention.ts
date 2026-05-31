/**
 * GDPR/AEPD Data Retention Job
 *
 * Anonymises customer PII for shipments older than the retention period
 * (60 days by default).
 *
 * Improvements over the original version:
 * 1. Processes in batches of 100 (cursor-based pagination) to avoid OOM/timeout
 * 2. Deletes S3 proof photos and signatures BEFORE nullifying DB references
 * 3. Uses bulk updateMany + summary audit logs (not per-record) for efficiency
 */

import prisma from '@/lib/prisma/prisma';
import { AuditAction } from '@/app/generated/prisma';
import { storageService } from '@/lib/storage/service';

const BATCH_SIZE = 100;
const RETENTION_DAYS = 60;

/**
 * Attempts to delete a file from object storage.
 * Swallows errors — a failed S3 delete should not block the anonymisation.
 */
async function safeDeleteFromStorage(url: string | null): Promise<boolean> {
  if (!url) return false;

  try {
    // Extract the object key from the URL
    // Handles both full URLs (https://cdn.../path/file.jpg) and bare keys (path/file.jpg)
    let key = url;
    try {
      const parsed = new URL(url);
      // Remove leading slash from pathname
      key = parsed.pathname.replace(/^\//, '');
    } catch {
      // url is already a bare key
    }

    await storageService.deleteFile(key);
    return true;
  } catch (err: any) {
    console.warn(`[DataRetention] Failed to delete storage object "${url}": ${err?.message}`);
    return false;
  }
}

/**
 * Main data retention job.
 * Anonymises delivered shipments older than RETENTION_DAYS where anonymisedAt is null.
 */
export async function runDataRetention() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

  console.log(
    `[DataRetention] Running for shipments delivered before ${cutoffDate.toISOString()}`,
  );

  let totalProcessed = 0;
  let totalStorageDeleted = 0;
  let cursor: string | undefined;

  do {
    // Fetch a batch using cursor-based pagination
    const batch = await prisma.shipment.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      where: {
        OR: [
          {
            status: 'DELIVERED',
            deliveredAt: { lt: cutoffDate },
          },
          {
            status: { in: ['FAILED', 'RETURNED'] },
            updatedAt: { lt: cutoffDate },
          },
        ],
        anonymisedAt: null,
      },
      select: {
        id: true,
        proofPhotoUrl: true,
        signatureUrl: true,
      },
      orderBy: { id: 'asc' },
    });

    if (batch.length === 0) break;
    cursor = batch[batch.length - 1]!.id;

    // 1. Delete S3 objects BEFORE nullifying DB references
    //    Use Promise.allSettled so one failure doesn't block the batch
    const storageResults = await Promise.allSettled(
      batch.flatMap((s) => [
        safeDeleteFromStorage(s.proofPhotoUrl),
        safeDeleteFromStorage(s.signatureUrl),
      ]),
    );

    const storageDeletedCount = storageResults.filter(
      (r) => r.status === 'fulfilled' && r.value === true,
    ).length;
    totalStorageDeleted += storageDeletedCount;

    // 2. Bulk update + summary audit in a single transaction
    const batchIds = batch.map((s) => s.id);

    await prisma.$transaction([
      prisma.shipment.updateMany({
        where: { id: { in: batchIds } },
        data: {
          recipientName: 'ANONYMISED',
          recipientPhone: 'ANONYMISED',
          recipientEmail: null,
          recipientDni: null,
          proofPhotoUrl: null,
          signatureUrl: null,
          anonymisedAt: new Date(),
        },
      }),
      // Summary audit row (not per-record — too expensive at scale)
      prisma.auditLog.create({
        data: {
          action: AuditAction.UPDATE,
          tableName: 'shipments',
          recordId: 'batch',
          metadata: {
            type: 'data_retention',
            count: batchIds.length,
            ids: batchIds,
            storageObjectsDeleted: storageDeletedCount,
            fields: [
              'recipientName',
              'recipientPhone',
              'recipientEmail',
              'recipientDni',
              'proofPhotoUrl',
              'signatureUrl',
            ],
            policy: 'GDPR_AEPD_60_DAY',
            cutoffDate: cutoffDate.toISOString(),
          },
        },
      }),
    ]);

    totalProcessed += batch.length;
    console.log(
      `[DataRetention] Batch processed: ${batch.length} shipments, ` +
        `${storageDeletedCount} storage objects deleted.`,
    );
  } while (true);

  if (totalProcessed === 0) {
    console.log('[DataRetention] No shipments require anonymisation at this time.');
  } else {
    console.log(
      `[DataRetention] Complete: ${totalProcessed} shipments anonymised, ` +
        `${totalStorageDeleted} storage objects deleted.`,
    );
  }

  return { totalProcessed, totalStorageDeleted };
}
