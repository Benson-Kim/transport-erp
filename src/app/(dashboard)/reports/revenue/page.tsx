/**
 * Revenue report (#33): recognized revenue, cost and margin by month.
 * Aggregation runs in Postgres (lib/reports/queries.ts); this page renders
 * DTO numbers only. force-dynamic: month-end money is never served from a
 * stale prerender.
 */

import { Suspense } from 'react';

import { getRevenueReport } from '@/actions/report-actions';
import { MonthlyFinancialsTable } from '@/components/features/reports/MonthlyFinancialsTable';
import { ReportSkeleton } from '@/components/features/reports/ReportSkeleton';
import { ReportSummary } from '@/components/features/reports/ReportSummary';
import { Alert, Breadcrumbs, PageHeader } from '@/components/ui';

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Revenue Report | Dashboard',
  description: 'Recognized revenue, cost and margin by month',
};

async function RevenueReportContent() {
  const result = await getRevenueReport();

  if (!result.success || !result.data) {
    return (
      <Alert variant="error" title="Failed to load the revenue report">
        {result.error ?? 'An unexpected error occurred. Please try again later.'}
      </Alert>
    );
  }

  const { months, totals } = result.data;

  return (
    <div className="space-y-6">
      <ReportSummary totals={totals} />

      {months.length === 0 ? (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No recognized revenue in the last 12 months.
        </p>
      ) : (
        <MonthlyFinancialsTable
          months={months}
          caption="Recognized revenue, cost and margin by month for the last 12 months"
        />
      )}
    </div>
  );
}

export default function RevenueReportPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs />

      <PageHeader
        title="Revenue Report"
        description="Recognized revenue over the last 12 months: services that are completed, invoiced or archived. Cancelled and pipeline services are excluded."
      />

      <Suspense fallback={<ReportSkeleton />}>
        <RevenueReportContent />
      </Suspense>
    </div>
  );
}
