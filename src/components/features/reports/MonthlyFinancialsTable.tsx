/**
 * Monthly financials table (#33), shared by the revenue and margins
 * reports. Server-only markup: values arrive as DTO numbers; formatting
 * via the canonical formatting utils (#26).
 */

import type { MonthlyFinancialsDto } from '@/lib/reports/dto';
import { formatDate } from '@/lib/utils/date-formats';
import { formatCurrency, formatNumber, formatPercentPoints } from '@/lib/utils/formatting';

interface MonthlyFinancialsTableProps {
  months: MonthlyFinancialsDto[];
  caption: string;
}

export function MonthlyFinancialsTable({ months, caption }: MonthlyFinancialsTableProps) {
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="text-left">
              Month
            </th>
            <th scope="col" className="text-right">
              Services
            </th>
            <th scope="col" className="text-right">
              Revenue
            </th>
            <th scope="col" className="text-right">
              Cost
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
          {months.map((row) => (
            <tr key={row.month.toISOString()}>
              <td>{formatDate.monthYear(row.month)}</td>
              <td className="text-right">{formatNumber(row.services)}</td>
              <td className="text-right">{formatCurrency(row.revenue)}</td>
              <td className="text-right">{formatCurrency(row.cost)}</td>
              <td className="text-right">{formatCurrency(row.margin)}</td>
              <td className="text-right">{formatPercentPoints(row.marginPercentage)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
