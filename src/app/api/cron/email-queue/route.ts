import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { EmailService } from '@/lib/email/service';
import prisma from '@/lib/prisma/prisma';
import { AuditAction } from '@/app/generated/prisma';

/**
 * Email Queue Consumer Cron API
 * GET /api/cron/email-queue
 *
 * Processes pending emails from the EmailQueue table.
 * Should be called by an external scheduler (e.g. every 1-2 minutes):
 *   * /1 * * * *  curl -H "Authorization: Bearer $CRON_SECRET" https://app/api/cron/email-queue
 *
 * Protected by a Bearer token (CRON_SECRET env var).
 */
export async function GET(req: NextRequest) {
  // Bearer token authentication (timing-safe comparison)
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error('[Cron] CRON_SECRET is not configured.');
    return Response.json({ error: 'Cron not configured' }, { status: 500 });
  }

  const expected = `Bearer ${cronSecret}`;
  const provided = authHeader ?? '';

  // Constant-time comparison to prevent timing attacks
  const isValid =
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));

  if (!isValid) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const emailService = EmailService.getInstance();
    const { processed, failed } = await emailService.processQueue();

    const durationMs = Date.now() - startTime;

    // Audit: record successful cron run
    await prisma.auditLog.create({
      data: {
        action: AuditAction.UPDATE,
        tableName: 'system',
        recordId: 'cron:email-queue',
        metadata: {
          status: 'success',
          processed,
          failed,
          durationMs,
          timestamp: new Date().toISOString(),
        },
      },
    });

    return Response.json({ ok: true, processed, failed, durationMs });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;

    // Audit: record failed cron run
    try {
      await prisma.auditLog.create({
        data: {
          action: AuditAction.UPDATE,
          tableName: 'system',
          recordId: 'cron:email-queue',
          metadata: {
            status: 'error',
            error: String(err?.message ?? err),
            durationMs,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch {
      console.error('[Cron] Failed to write error audit log.');
    }

    console.error('[Cron] Email queue processing failed:', err);
    return Response.json({ error: 'Cron failed' }, { status: 500 });
  }
}
