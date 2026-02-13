/**
 * Export Utilities
 * Enhanced CSV and Excel export helpers with better error handling and features
 */

import { format } from 'date-fns';
import { toast } from '@/lib/toast';

type Row = Record<string, unknown>;

interface ExportOptions {
  headers?: string[];
  transformRow?: (row: Row) => Row;
  onProgress?: (progress: number) => void;
}

/**
 * Create a Blob URL for download
 */
function createObjectUrl(data: BlobPart, mime: string): string {
  const blob = new Blob([data], { type: mime });
  return URL.createObjectURL(blob);
}

/**
 * Trigger file download in the browser
 */
function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();

  // Clean up the URL after a delay to ensure download starts
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

/**
 * Format value for CSV export
 */
function escapeCSVCell(val: unknown): string {
  if (val === null || val === undefined) return '';

  // Handle dates
  if (val instanceof Date) {
    return format(val, 'yyyy-MM-dd HH:mm:ss');
  }

  // Handle booleans
  if (typeof val === 'boolean') {
    return val ? 'Yes' : 'No';
  }

  // Handle numbers
  if (typeof val === 'number') {
    return val.toString();
  }

  // Handle strings
  const str = String(val);

  // Escape special characters
  if (/[",\r\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }

  return str;
}

/**
 * Export array of objects to CSV
 */
export function exportToCsv(
  rows: Row[],
  filename = 'export.csv',
  options: ExportOptions = {}
): void {
  const { headers, transformRow, onProgress } = options;

  if (globalThis.window === undefined) {
    console.warn('Export functions can only be used in the browser');
    return;
  }

  try {
    onProgress?.(0);

    if (!rows || rows.length === 0) {
      toast.warning('No data to export');
      return;
    }

    onProgress?.(25);

    // Transform rows if transformer provided
    const transformedRows = transformRow ? rows.map(transformRow) : rows;

    // Get headers from data or use provided headers
    const columnHeaders =
      headers ||
      Array.from(
        transformedRows.reduce<Set<string>>((set, row) => {
          Object.keys(row).forEach((k) => set.add(k));
          return set;
        }, new Set())
      );

    onProgress?.(50);

    // Build CSV content
    const csvRows = [
      // Header row
      columnHeaders.join(','),
      // Data rows
      ...transformedRows.map((row, index) => {
        onProgress?.(50 + (index / transformedRows.length) * 40);
        return columnHeaders.map((header) => escapeCSVCell(row[header])).join(',');
      }),
    ];

    const csvContent = csvRows.join('\n');

    onProgress?.(90);

    // Create and trigger download
    const url = createObjectUrl(csvContent, 'text/csv;charset=utf-8;');
    const finalFilename = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    triggerDownload(url, finalFilename);

    onProgress?.(100);
    toast.success(`Exported ${transformedRows.length} rows to CSV`);
  } catch (error) {
    console.error('CSV export failed:', error);
    toast.error('Failed to export CSV file');
    onProgress?.(0);
  }
}

/**
 * Export array of objects to Excel (.xlsx)
 * Falls back to CSV if xlsx is not available
 */
export async function exportToExcel(
  rows: Row[],
  filename = 'export.xlsx',
  sheetName = 'Sheet1',
  options: ExportOptions = {}
): Promise<void> {
  const { headers, transformRow, onProgress } = options;

  if (globalThis.window === undefined) {
    console.warn('Export functions can only be used in the browser');
    return;
  }

  try {
    onProgress?.(0);

    if (!rows || rows.length === 0) {
      toast.warning('No data to export');
      return;
    }

    onProgress?.(20);

    // Transform rows if transformer provided
    const transformedRows = transformRow ? rows.map(transformRow) : rows;

    // Dynamic import to reduce bundle size
    const XLSX = await import('xlsx');

    onProgress?.(40);

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();

    // If custom headers provided, reorder data
    let worksheetData = transformedRows;
    if (headers && headers.length > 0) {
      worksheetData = transformedRows.map((row) => {
        const orderedRow: Row = {};
        headers.forEach((header) => {
          orderedRow[header] = row[header];
        });
        return orderedRow;
      });
    }

    onProgress?.(60);

    const ws = XLSX.utils.json_to_sheet(worksheetData, {
      ...(headers && { header: headers }),
    });

    // Auto-size columns (approximate)
    const maxWidth = 50;
    const cols = Object.keys(worksheetData[0] || {}).map((key) => ({
      wch: Math.min(
        maxWidth,
        Math.max(key.length, ...worksheetData.map((row) => String(row[key] || '').length))
      ),
    }));
    ws['!cols'] = cols;

    onProgress?.(80);

    // Truncate sheet name to Excel's 31 character limit
    XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));

    // Generate Excel file
    const wbout = XLSX.write(wb, {
      bookType: 'xlsx',
      type: 'array',
      compression: true,
    });

    onProgress?.(90);

    // Create and trigger download
    const url = createObjectUrl(
      wbout,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const finalFilename = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    triggerDownload(url, finalFilename);

    onProgress?.(100);
    toast.success(`Exported ${transformedRows.length} rows to Excel`);
  } catch (error) {
    console.error('Excel export failed, falling back to CSV:', error);
    onProgress?.(0);

    // Fallback to CSV
    exportToCsv(rows, filename.replace(/\.xlsx$/i, '.csv'), options);
  }
}
