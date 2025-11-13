/**
 * Table Sort Hook
 * Manages sorting state for tables
 */

import { useState, useCallback } from 'react';

export interface UseTableSortOptions {
  defaultSort?:
    | {
        key: string;
        direction: 'asc' | 'desc';
      }
    | undefined;
  onSort?: ((key: string, direction: 'asc' | 'desc') => void) | undefined;
}

export function useTableSort({ defaultSort, onSort }: UseTableSortOptions = {}) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key || null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    defaultSort?.direction || 'asc'
  );

  const handleSort = useCallback(
    (key: string) => {
      let newDirection: 'asc' | 'desc' = 'asc';

      if (sortKey === key) {
        newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      }

      setSortKey(key);
      setSortDirection(newDirection);
      onSort?.(key, newDirection);
    },
    [sortKey, sortDirection, onSort]
  );

  const clearSort = useCallback(() => {
    setSortKey(null);
    setSortDirection('asc');
  }, []);

  return {
    sortKey,
    sortDirection,
    handleSort,
    clearSort,
  };
}
