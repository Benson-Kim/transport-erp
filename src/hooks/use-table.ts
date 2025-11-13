/**
 * Table State Management Hook
 * Manages table state including sorting, filtering, and pagination
 */

import { useState, useCallback, useMemo } from 'react';

export interface UseTableOptions<T> {
  data: T[];
  pageSize?: number;
  sortable?: boolean;
  filterable?: boolean;
}

export interface TableState {
  page: number;
  pageSize: number;
  sortKey: string | null;
  sortDirection: 'asc' | 'desc';
  filters: Record<string, any>;
  searchQuery: string;
}

export function useTable<T>({
  data,
  pageSize: initialPageSize = 10,
  sortable = true,
  filterable = true,
}: UseTableOptions<T>) {
  const [state, setState] = useState<TableState>({
    page: 1,
    pageSize: initialPageSize,
    sortKey: null,
    sortDirection: 'asc',
    filters: {},
    searchQuery: '',
  });

  // Sorting
  const sortedData = useMemo(() => {
    if (!sortable || !state.sortKey) return data;

    return [...data].sort((a, b) => {
      const aValue = (a as any)[state.sortKey!];
      const bValue = (b as any)[state.sortKey!];

      if (aValue === bValue) return 0;

      const comparison = aValue < bValue ? -1 : 1;
      return state.sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, state.sortKey, state.sortDirection, sortable]);

  // Filtering
  const filteredData = useMemo(() => {
    if (!filterable) return sortedData;

    let result = sortedData;

    // Apply search query
    if (state.searchQuery) {
      result = result.filter((item) => {
        const searchableText = Object.values(item as any)
          .filter((value) => typeof value === 'string' || typeof value === 'number')
          .join(' ')
          .toLowerCase();

        return searchableText.includes(state.searchQuery.toLowerCase());
      });
    }

    // Apply filters
    Object.entries(state.filters).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        result = result.filter((item) => (item as any)[key] === value);
      }
    });

    return result;
  }, [sortedData, state.searchQuery, state.filters, filterable]);

  // Pagination
  const paginatedData = useMemo(() => {
    const start = (state.page - 1) * state.pageSize;
    const end = start + state.pageSize;
    return filteredData.slice(start, end);
  }, [filteredData, state.page, state.pageSize]);

  const totalPages = Math.ceil(filteredData.length / state.pageSize);

  // Actions
  const setPage = useCallback((page: number) => {
    setState((prev) => ({ ...prev, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setState((prev) => ({ ...prev, pageSize, page: 1 }));
  }, []);

  const setSort = useCallback((key: string) => {
    setState((prev) => ({
      ...prev,
      sortKey: key,
      sortDirection: prev.sortKey === key && prev.sortDirection === 'asc' ? 'desc' : 'asc',
    }));
  }, []);

  const setFilter = useCallback((key: string, value: any) => {
    setState((prev) => ({
      ...prev,
      filters: { ...prev.filters, [key]: value },
      page: 1,
    }));
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setState((prev) => ({ ...prev, searchQuery: query, page: 1 }));
  }, []);

  const clearFilters = useCallback(() => {
    setState((prev) => ({
      ...prev,
      filters: {},
      searchQuery: '',
      page: 1,
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      page: 1,
      pageSize: initialPageSize,
      sortKey: null,
      sortDirection: 'asc',
      filters: {},
      searchQuery: '',
    });
  }, [initialPageSize]);

  return {
    // Data
    data: paginatedData,
    totalItems: filteredData.length,
    totalPages,

    // State
    ...state,

    // Actions
    setPage,
    setPageSize,
    setSort,
    setFilter,
    setSearchQuery,
    clearFilters,
    reset,
  };
}
