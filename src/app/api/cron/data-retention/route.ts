import { NextRequest } from 'next/server';
import { runDataRetention } from '@/lib/cron/data-retention';
import prisma from '@/lib/prisma/prisma';
import { AuditAction } from '@/app/generated/prisma';

/**
 * Data Retention Cron API
 * GET /api/cron/data-retention
 *
 * Triggers the GDPR/AEPD data retention job that anonymises shipment PII
 * older than 60 days.
 *
 * Protected by a Bearer token (CRON_SECRET env var).
 * Designed to be called by an external scheduler:
 *   0 2 * * *  curl -H "Authorization: Bearer $CRON_SECRET" https://app/api/cron/data-retention
 */
export async function GET(req: NextRequest) {
  // Bearer token authentication
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[Cron] CRON_SECRET is not configured.');
    return Response.json({ error: 'Cron not configured' }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    await runDataRetention();

    const durationMs = Date.now() - startTime;

    // Audit: record successful cron run
    await prisma.auditLog.create({
      data: {
        action: AuditAction.UPDATE,
        tableName: 'system',
        recordId: 'cron:data-retention',
        metadata: {
          status: 'success',
          durationMs,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return Response.json({ ok: true, durationMs });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;

    // Audit: record failed cron run so ops can investigate without console access
    try {
      await prisma.auditLog.create({
        data: {
          action: AuditAction.UPDATE,
          tableName: 'system',
          recordId: 'cron:data-retention',
          metadata: {
            status: 'error',
            error: String(err?.message ?? err),
            durationMs,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch {
      // If even the audit log fails, just log to console
      console.error('[Cron] Failed to write error audit log.');
    }

    console.error('[Cron] Data retention failed:', err);
    return Response.json({ error: 'Cron failed' }, { status: 500 });
  }
}
