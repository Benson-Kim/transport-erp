/**
 * Table Helper Utilities
 * Sorting, filtering, and export functions for tables
 */

// Generic sort function
export function sortData<T>(data: T[], key: keyof T, direction: 'asc' | 'desc' = 'asc'): T[] {
  return [...data].sort((a, b) => {
    const aValue = a[key];
    const bValue = b[key];

    if (aValue === bValue) return 0;

    if (aValue === null || aValue === undefined) return 1;
    if (bValue === null || bValue === undefined) return -1;

    const comparison = aValue < bValue ? -1 : 1;
    return direction === 'asc' ? comparison : -comparison;
  });
}

// Multi-column sort
export function multiSort<T>(
  data: T[],
  sorts: Array<{ key: keyof T; direction: 'asc' | 'desc' }>
): T[] {
  return [...data].sort((a, b) => {
    for (const { key, direction } of sorts) {
      const aValue = a[key];
      const bValue = b[key];

      if (aValue !== bValue) {
        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        const comparison = aValue < bValue ? -1 : 1;
        return direction === 'asc' ? comparison : -comparison;
      }
    }
    return 0;
  });
}

// Filter data by search query
export function filterBySearch<T>(data: T[], query: string, fields?: (keyof T)[]): T[] {
  if (!query) return data;

  const lowerQuery = query.toLowerCase();

  return data.filter((item) => {
    const searchableFields = fields || (Object.keys(item as any) as (keyof T)[]);

    return searchableFields.some((field) => {
      const value = item[field];
      if (value === null || value === undefined) return false;

      return String(value).toLowerCase().includes(lowerQuery);
    });
  });
}

// Apply multiple filters
export function applyFilters<T>(data: T[], filters: Partial<Record<keyof T, any>>): T[] {
  return data.filter((item) => Object.entries(filters).every(([key, value]) => {
      if (value === undefined || value === '') return true;

      const itemValue = item[key as keyof T];

      // Array filter (item value should be in filter array)
      if (Array.isArray(value)) {
        return value.includes(itemValue);
      }

      // Range filter
      if (typeof value === 'object' && value !== null && 'min' in value && 'max' in value) {
        const numValue = Number(itemValue);
        return numValue >= Number(value.min) && numValue <= Number(value.max);
      }

      // Exact match
      return itemValue === value;
    }));
}

// Paginate data
export function paginate<T>(
  data: T[],
  page: number,
  pageSize: number
): {
  data: T[];
  totalPages: number;
  totalItems: number;
  hasNext: boolean;
  hasPrev: boolean;
} {
  const totalItems = data.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    data: data.slice(start, end),
    totalPages,
    totalItems,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

// Group data by key
export function groupBy<T>(data: T[], key: keyof T): Record<string, T[]> {
  return data.reduce(
    (groups, item) => {
      const groupKey = String(item[key]);
      groups[groupKey] ??= [];
      groups[groupKey].push(item);
      return groups;
    },
    {} as Record<string, T[]>
  );
}

// Calculate aggregates
export function aggregate<T>(
  data: T[],
  field: keyof T,
  operation: 'sum' | 'avg' | 'min' | 'max' | 'count'
): number {
  if (data.length === 0) return 0;

  switch (operation) {
    case 'sum':
      return data.reduce((sum, item) => sum + Number(item[field] || 0), 0);

    case 'avg': {
      const total = data.reduce((sum, item) => sum + Number(item[field] || 0), 0);
      return total / data.length;
    }

    case 'min':
      return Math.min(...data.map((item) => Number(item[field] || 0)));

    case 'max':
      return Math.max(...data.map((item) => Number(item[field] || 0)));

    case 'count':
      return data.length;

    default:
      return 0;
  }
}

// Format table data for export
export function formatForExport<T>(
  data: T[],
  columns: Array<{
    key: keyof T;
    header: string;
    formatter?: (value: any) => string;
  }>
): Array<Record<string, string>> {
  return data.map((row) => {
    const exportRow: Record<string, string> = {};

    columns.forEach((column) => {
      const value = row[column.key];
      exportRow[column.header] = column.formatter ? column.formatter(value) : String(value ?? '');
    });

    return exportRow;
  });
}
