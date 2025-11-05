/**
 * Export Utilities
 * CSV and Excel export helpers with browser-safe downloads
 */

type Row = Record<string, unknown>;

function createObjectUrl(data: BlobPart, mime: string): string {
  const blob = new Blob([data], { type: mime });
  return URL.createObjectURL(blob);
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export array of objects to CSV
 */
export function exportToCsv(rows: Row[], filename = 'export.csv'): void {
  if (typeof window === 'undefined') {
    // SSR-safe guard
    return;
  }

  if (!rows || rows.length === 0) {
    const url = createObjectUrl('No data', 'text/plain;charset=utf-8;');
    triggerDownload(url, filename);
    return;
  }

  const headers = Array.from(
    rows.reduce<Set<string>>((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set()),
  );

  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (/[",\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const csv =
    `${headers.join(',')}\n` +
    rows.map((row) => headers.map((h) => escapeCell((row as any)[h])).join(',')).join('\n');

  const url = createObjectUrl(csv, 'text/csv;charset=utf-8;');
  triggerDownload(url, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

/**
 * Export array of objects to Excel (.xlsx)
 * Falls back to CSV if xlsx is not available
 */
export async function exportToExcel(
  rows: Row[],
  filename = 'export.xlsx',
  sheetName = 'Sheet1',
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const XLSX = await import('xlsx'); // dynamic import to keep bundle light

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const url = createObjectUrl(wbout, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    triggerDownload(url, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
  } catch (err) {
    console.warn('xlsx not available, falling back to CSV export', err);
    exportToCsv(rows, filename.replace(/\.xlsx$/i, '.csv'));
  }
}