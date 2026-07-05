/**
 * Table Selection Hook
 * Manages row selection state for tables
 */

import { useState, useCallback, useMemo } from 'react';

export interface UseTableSelectionOptions<T> {
  data: T[];
  getRowId?: (row: T) => string;
  selectedRows?: string[] | undefined;
  onChange?: ((selectedIds: string[]) => void) | undefined;
}

export function useTableSelection<T extends { id: string }>({
  data,
  getRowId = (row) => row.id,
  selectedRows,
  onChange,
}: UseTableSelectionOptions<T>) {
  // #52: controlled/uncontrolled duality. selectedRows was seeded into
  // state ONCE, so a parent clearing selection (e.g. after a bulk action)
  // left rows visually selected forever. When selectedRows is provided the
  // hook is CONTROLLED: selection is DERIVED from the prop every render;
  // internal state backs uncontrolled usage only.
  const [internalIds, setInternalIds] = useState<Set<string>>(new Set(selectedRows ?? []));
  const isControlled = selectedRows !== undefined;

  const selectedIds = useMemo(
    () => (isControlled ? new Set(selectedRows) : internalIds),
    [isControlled, selectedRows, internalIds]
  );

  const isAllSelected = useMemo(
    () => data.length > 0 && data.every((row) => selectedIds.has(getRowId(row))),
    [data, selectedIds, getRowId]
  );

  const isIndeterminate = useMemo(
    () => selectedIds.size > 0 && !isAllSelected,
    [selectedIds, isAllSelected]
  );

  const updateSelection = useCallback(
    (ids: Set<string>) => {
      if (!isControlled) setInternalIds(ids);
      onChange?.(Array.from(ids));
    },
    [isControlled, onChange]
  );

  const toggle = useCallback(
    (id: string) => {
      const newSelection = new Set(selectedIds);
      if (newSelection.has(id)) {
        newSelection.delete(id);
      } else {
        newSelection.add(id);
      }
      updateSelection(newSelection);
    },
    [selectedIds, updateSelection]
  );

  const toggleAll = useCallback(() => {
    if (isAllSelected) {
      updateSelection(new Set());
    } else {
      updateSelection(new Set(data.map(getRowId)));
    }
  }, [data, isAllSelected, getRowId, updateSelection]);

  const select = useCallback(
    (id: string) => {
      const newSelection = new Set(selectedIds);
      newSelection.add(id);
      updateSelection(newSelection);
    },
    [selectedIds, updateSelection]
  );

  const deselect = useCallback(
    (id: string) => {
      const newSelection = new Set(selectedIds);
      newSelection.delete(id);
      updateSelection(newSelection);
    },
    [selectedIds, updateSelection]
  );

  const selectAll = useCallback(() => {
    updateSelection(new Set(data.map(getRowId)));
  }, [data, getRowId, updateSelection]);

  const clear = useCallback(() => {
    updateSelection(new Set());
  }, [updateSelection]);

  const selectRange = useCallback(
    (start: number, end: number) => {
      const newSelection = new Set(selectedIds);
      const [min, max] = start < end ? [start, end] : [end, start];
      for (let i = min; i <= max && i < data.length; i++) {
        const row = data[i];
        if (row) {
          const id = getRowId(row);
          if (id != null) {
            newSelection.add(id);
          }
        }
      }

      updateSelection(newSelection);
    },
    [data, selectedIds, getRowId, updateSelection]
  );

  return {
    selectedIds,
    isAllSelected,
    isIndeterminate,
    toggle,
    toggleAll,
    select,
    deselect,
    selectAll,
    clear,
    selectRange,
  };
}
