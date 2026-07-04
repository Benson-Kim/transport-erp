/**
 * Report summary cards (#33), shared by the revenue and margins reports.
 * Server-only markup: values arrive as DTO numbers from report-actions.
 */

import type { FinancialsDto } from '@/lib/reports/dto';
import { formatCurrency, formatNumber, formatPercentPoints } from '@/lib/utils/formatting';

interface ReportSummaryProps {
  totals: FinancialsDto;
}

export function ReportSummary({ totals }: ReportSummaryProps) {
  const items = [
    { label: 'Services', value: formatNumber(totals.services) },
    { label: 'Revenue', value: formatCurrency(totals.revenue) },
    { label: 'Cost', value: formatCurrency(totals.cost) },
    { label: 'Margin', value: formatCurrency(totals.margin) },
    { label: 'Margin %', value: formatPercentPoints(totals.marginPercentage) },
  ];

  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="card">
          <dt className="text-sm text-gray-600 dark:text-gray-400">{item.label}</dt>
          <dd className="text-xl font-semibold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
