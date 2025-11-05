/**
 * Table Component
 * Base table components with composable structure
 */

import { ReactNode, HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/utils/cn';
import { ArrowDown, ArrowUp } from 'lucide-react';

// Table Root
interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children: ReactNode;
  fixed?: boolean;
}

export function Table({ children, fixed = false, className, ...props }: TableProps) {
  return (
    <div className="relative overflow-auto">
      <table
        className={cn(
          'table w-full',
          fixed && 'table-fixed',
          className
        )}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

// Table Header
interface TableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode;
  sticky?: boolean;
}

function TableHeader({ children, sticky = false, className, ...props }: TableHeaderProps) {
  return (
    <thead
      className={cn(
        'bg-neutral-50',
        sticky && 'sticky top-0 z-10 bg-white shadow-sm',
        className
      )}
      {...props}
    >
      {children}
    </thead>
  );
}

// Table Body
interface TableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode;
}

function TableBody({ children, className, ...props }: TableBodyProps) {
  return (
    <tbody className={cn('divide-y divide-neutral-200', className)} {...props}>
      {children}
    </tbody>
  );
}

// Table Row
interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
  selected?: boolean;
  hoverable?: boolean;
  clickable?: boolean;
}

function TableRow({
  children,
  selected = false,
  hoverable = true,
  clickable = false,
  className,
  ...props
}: TableRowProps) {
  return (
    <tr
      className={cn(
        'transition-colors',
        hoverable && 'hover:bg-support-rowHover',
        selected && 'bg-support-rowSelected',
        clickable && 'cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </tr>
  );
}

// Table Header Cell
interface TableHeaderCellProps extends ThHTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
  sortable?: boolean;
  sorted?: 'asc' | 'desc' | false;
  sticky?: boolean;
}

function TableHeaderCell({
  children,
  sortable = false,
  sorted = false,
  sticky = false,
  className,
  ...props
}: TableHeaderCellProps) {
  return (
    <th
      className={cn(
        'table-header text-left',
        sortable && 'cursor-pointer select-none hover:bg-neutral-100',
        sticky && 'sticky left-0 z-20 bg-white',
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        {children}
        {sortable && (
          <span className="text-neutral-400">
            {sorted === 'asc' && <ArrowUp />}
            {sorted === 'desc' && <ArrowDown />}
            {!sorted && '↕'}
          </span>
        )}
      </div>
    </th>
  );
}

// Table Cell
interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {
  children: ReactNode;
  sticky?: boolean;
  align?: 'left' | 'center' | 'right';
  truncate?: boolean;
}

function TableCell({
  children,
  sticky = false,
  align = 'left',
  truncate = false,
  className,
  ...props
}: TableCellProps) {
  return (
    <td
      className={cn(
        'table-cell',
        sticky && 'sticky left-0 z-10 bg-white',
        align === 'center' && 'text-center',
        align === 'right' && 'text-right',
        truncate && 'truncate max-w-xs',
        className
      )}
      {...props}
    >
      {children}
    </td>
  );
}

// Table Footer
interface TableFooterProps extends HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode;
}

function TableFooter({ children, className, ...props }: TableFooterProps) {
  return (
    <tfoot
      className={cn('bg-neutral-50 font-medium', className)}
      {...props}
    >
      {children}
    </tfoot>
  );
}

// Export sub-components
Table.Header = TableHeader;
Table.Body = TableBody;
Table.Row = TableRow;
Table.HeaderCell = TableHeaderCell;
Table.Cell = TableCell;
Table.Footer = TableFooter;