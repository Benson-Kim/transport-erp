/**
 * Health endpoint (#41).
 *
 * - GET /api/health?probe=live : liveness - 200 whenever the process can
 *   serve a request. No I/O: a wedged DB must not get the process killed.
 * - GET /api/health           : readiness - 200 only when the database is
 *   reachable AND migrations are applied (>=1 finished row, 0 unfinished
 *   non-rolled-back rows in _prisma_migrations). 503 otherwise, so the
 *   orchestrator holds traffic until the schema this build expects exists.
 *
 * Public by design (proxy.ts API_ROUTES): probes carry no session. The
 * response body is intentionally shape-only - no versions, no hostnames,
 * no error details that would profile the deployment.
 */

import { NextResponse } from 'next/server';

import prisma from '@/lib/prisma/prisma';

export const dynamic = 'force-dynamic';

interface MigrationCounts {
  applied: number;
  pending: number;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get('probe') === 'live') {
    return NextResponse.json({ status: 'alive' });
  }

  try {
    const [counts] = await prisma.$queryRaw<[MigrationCounts]>`
      SELECT
        COUNT(*) FILTER (WHERE finished_at IS NOT NULL)::int AS "applied",
        COUNT(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL)::int AS "pending"
      FROM "_prisma_migrations"
    `;

    if (!counts || counts.applied === 0 || counts.pending > 0) {
      return NextResponse.json(
        { status: 'unready', reason: 'migrations' },
        { status: 503 }
      );
    }

    return NextResponse.json({ status: 'ready' });
  } catch {
    // DB unreachable or the migrations table absent: not ready.
    return NextResponse.json({ status: 'unready', reason: 'database' }, { status: 503 });
  }
}
