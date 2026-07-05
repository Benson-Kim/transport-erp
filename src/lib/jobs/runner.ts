/**
 * Job runner (#38). NOT a 'use server' module: invoked by the
 * /api/jobs/run route (external cron with CRON_SECRET), never by a browser
 * session.
 *
 * DESIGN (recorded): exactly-once correctness lives at the ITEM level, not
 * in a runner-wide lock -
 * - email-queue: each job row is claimed atomically
 *   (updateMany pending -> processing, act only when count === 1);
 * - backup: due-checked against SettingKey.LAST_BACKUP (runScheduledBackup);
 * - audit-maintenance: the #21 SQL functions are idempotent by construction.
 * Two concurrent invocations therefore never double-send, double-back-up
 * beyond one benign extra dump, or corrupt partitions. Cadence comes from
 * the ONE external cron hitting /api/jobs/run - never from per-replica
 * boot (#44).
 *
 * Reminders and auto-archive are deliberately NOT stubbed here: they have
 * zero call sites today and an abstraction must earn its place. When those
 * features exist, they register in JOB_NAMES/runJob like the three below.
 */

import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma/prisma';

export const JOB_NAMES = ['email-queue', 'audit-maintenance', 'backup'] as const;
export type JobName = (typeof JOB_NAMES)[number];

export interface JobRunResult {
  job: JobName;
  ok: boolean;
  detail?: Record<string, unknown>;
  error?: string;
}

export function isJobName(value: unknown): value is JobName {
  return typeof value === 'string' && (JOB_NAMES as readonly string[]).includes(value);
}

export async function runJob(name: JobName): Promise<JobRunResult> {
  const log = logger.child({ job: name });
  try {
    switch (name) {
      case 'email-queue': {
        const { emailService } = await import('@/lib/email');
        const result = await emailService.processQueue();
        log.info('Email queue processed', { ...result });
        return { job: name, ok: true, detail: { ...result } };
      }

      case 'audit-maintenance': {
        // #21 partition/retention maintenance (migration 20260703000002),
        // previously ops-invoked. All three functions are idempotent.
        const [created] = await prisma.$queryRaw<
          [{ created: number }]
        >`SELECT audit_logs_ensure_partitions() AS created`;
        const [dropped] = await prisma.$queryRaw<
          [{ dropped: number }]
        >`SELECT audit_logs_drop_expired() AS dropped`;
        const [purged] = await prisma.$queryRaw<
          [{ purged: number }]
        >`SELECT email_logs_purge_expired() AS purged`;

        const detail = {
          partitionsCreated: created?.created ?? 0,
          partitionsDropped: dropped?.dropped ?? 0,
          emailLogsPurged: purged?.purged ?? 0,
        };
        log.info('Audit maintenance completed', detail);
        return { job: name, ok: true, detail };
      }

      case 'backup': {
        const { runScheduledBackup } = await import('@/lib/backup');
        const result = await runScheduledBackup();
        log.info('Scheduled backup evaluated', {
          ran: result.ran,
          ...(result.reason ? { reason: result.reason } : {}),
        });
        return {
          job: name,
          ok: true,
          detail: {
            ran: result.ran,
            ...(result.reason ? { reason: result.reason } : {}),
            ...(result.backup ? { key: result.backup.key, size: result.backup.size } : {}),
          },
        };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    log.error('Job failed', { error: message });
    return { job: name, ok: false, error: message };
  }
}
