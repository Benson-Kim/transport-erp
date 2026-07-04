/**
 * Margins report (#33): margin by month plus the top clients by
 * contributed margin. Aggregation runs in Postgres
 * (lib/reports/queries.ts); this page renders DTO numbers only.
 * force-dynamic: month-end money is never served from a stale prerender.
 */

import { Suspense } from 'react';

import { getMarginsReport } from '@/actions/report-actions';
import { MonthlyFinancialsTable } from '@/components/features/reports/MonthlyFinancialsTable';
import { ReportSkeleton } from '@/components/features/reports/ReportSkeleton';
import { ReportSummary } from '@/components/features/reports/ReportSummary';
import { Alert, Breadcrumbs, PageHeader } from '@/components/ui';
import { formatCurrency, formatNumber, formatPercentPoints } from '@/lib/utils/formatting';

import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Margins Report | Dashboard',
  description: 'Margin by month and top clients by contributed margin',
};

async function MarginsReportContent() {
  const result = await getMarginsReport();

  if (!result.success || !result.data) {
    return (
      <Alert variant="error" title="Failed to load the margins report">
        {result.error ?? 'An unexpected error occurred. Please try again later.'}
      </Alert>
    );
  }

  const { months, totals, clients } = result.data;

  if (months.length === 0) {
    return (
      <div className="space-y-6">
        <ReportSummary totals={totals} />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No recognized margin in the last 12 months.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ReportSummary totals={totals} />

      <MonthlyFinancialsTable months={months} caption="Margin by month for the last 12 months" />

      <section aria-labelledby="top-clients-heading" className="card overflow-x-auto">
        <h2 id="top-clients-heading" className="mb-4 text-lg font-semibold">
          Top clients by margin
        </h2>
        <table className="table">
          <caption className="sr-only">
            Top clients by contributed margin over the last 12 months
          </caption>
          <thead>
            <tr>
              <th scope="col" className="text-left">
                Client
              </th>
              <th scope="col" className="text-right">
                Services
              </th>
              <th scope="col" className="text-right">
                Revenue
              </th>
              <th scope="col" className="text-right">
                Margin
              </th>
              <th scope="col" className="text-right">
                Margin %
              </th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <tr key={client.clientId}>
                <td>{client.clientName}</td>
                <td className="text-right">{formatNumber(client.services)}</td>
                <td className="text-right">{formatCurrency(client.revenue)}</td>
                <td className="text-right">{formatCurrency(client.margin)}</td>
                <td className="text-right">{formatPercentPoints(client.marginPercentage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

export default function MarginsReportPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs />

      <PageHeader
        title="Margins Report"
        description="Margin over the last 12 months: services that are completed, invoiced or archived. Cancelled and pipeline services are excluded."
      />

      <Suspense fallback={<ReportSkeleton />}>
        <MarginsReportContent />
      </Suspense>
    </div>
  );
}
