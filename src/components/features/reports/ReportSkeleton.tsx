/**
 * Loading skeleton for the report pages (#33).
 */

const SUMMARY_PLACEHOLDERS = ['services', 'revenue', 'cost', 'margin', 'margin-percentage'];

export function ReportSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {SUMMARY_PLACEHOLDERS.map((key) => (
          <div key={key} className="card h-20 animate-pulse bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
      <div className="card h-96 animate-pulse bg-gray-100 dark:bg-gray-800" />
    </div>
  );
}
