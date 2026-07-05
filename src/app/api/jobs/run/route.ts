/**
 * POST /api/jobs/run (#38): the ONE entry point for scheduled work.
 *
 * Invoked by an external scheduler (GitLab pipeline schedule, system cron,
 * or a container cron sidecar) with:
 *   Authorization: Bearer $CRON_SECRET
 *   body: { "job": "email-queue" | "audit-maintenance" | "backup" }
 *
 * Fails CLOSED: when CRON_SECRET is not configured the endpoint is
 * disabled (503) - it never falls back to open. Exactly-once semantics are
 * enforced at the item level inside each job (see src/lib/jobs/runner.ts),
 * so a doubled cron or a manual re-trigger is safe.
 *
 * src/proxy.ts lists /api/jobs under API_ROUTES (own auth), so the cron
 * call is not redirected to /login.
 */

import { NextResponse } from 'next/server';

import { isJobName, JOB_NAMES, runJob } from '@/lib/jobs/runner';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Job runner disabled: CRON_SECRET is not configured' },
      { status: 503 }
    );
  }

  const header = request.headers.get('authorization');
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // fall through to validation below
  }

  const job = (body as { job?: unknown }).job;
  if (!isJobName(job)) {
    return NextResponse.json(
      { error: `Unknown job; expected one of: ${JOB_NAMES.join(', ')}` },
      { status: 400 }
    );
  }

  const result = await runJob(job);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
