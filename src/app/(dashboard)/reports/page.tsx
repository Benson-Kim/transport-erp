/**
 * Reports index (#33): every card links to a built report - no dead
 * affordances.
 */

import Link from 'next/link';

import { Breadcrumbs, PageHeader } from '@/components/ui';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reports | Dashboard',
  description: 'Revenue and margin reports over recognized revenue',
};

const REPORT_LINKS = [
  {
    href: '/reports/revenue',
    title: 'Revenue Report',
    description: 'Recognized revenue, cost and margin by month for the last 12 months.',
  },
  {
    href: '/reports/margins',
    title: 'Margins Report',
    description: 'Margin by month and the top clients by contributed margin.',
  },
];

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs />

      <PageHeader title="Reports" description="Financial reports over recognized revenue" />

      <ul className="grid gap-4 sm:grid-cols-2">
        {REPORT_LINKS.map((report) => (
          <li key={report.href}>
            <Link href={report.href} className="card block hover:shadow-md">
              <h2 className="text-lg font-semibold">{report.title}</h2>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{report.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
