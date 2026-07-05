// SupplierSelector.tsx
'use client';

/**
 * #47: thin wrapper over the shared async EntitySelector. Public props are
 * UNCHANGED: `suppliers` now feeds only the capped initial page; typing
 * streams server-side, index-backed results via searchSupplierOptions -
 * the full supplier table is never loaded. Create-new keeps the
 * returnTo=/services/new contract (#64: the target validates the path).
 */

import { useCallback, useMemo } from 'react';

import { searchSupplierOptions } from '@/actions/service-actions';

import { EntitySelector, type EntityOption } from './EntitySelector';

interface Supplier {
  id: string;
  name: string;
  supplierCode: string;
  email?: string;
  isActive?: boolean;
}

interface SupplierSelectorProps {
  suppliers: Supplier[];
  value?: string;
  onChange: (supplierId: string) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  allowCreate?: boolean;
}

export function SupplierSelector({
  suppliers,
  value,
  onChange,
  error,
  disabled = false,
  placeholder = 'Select supplier...',
  allowCreate = true,
}: Readonly<SupplierSelectorProps>) {
  const initialOptions = useMemo<EntityOption[]>(
    () =>
      suppliers.map((supplier) => ({
        id: supplier.id,
        name: supplier.name,
        code: supplier.supplierCode,
      })),
    [suppliers]
  );

  const search = useCallback(async (query: string): Promise<EntityOption[]> => {
    const results = await searchSupplierOptions(query);
    return results.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      code: supplier.supplierCode,
    }));
  }, []);

  return (
    <EntitySelector
      value={value ?? ''}
      onChange={onChange}
      search={search}
      initialOptions={initialOptions}
      placeholder={placeholder}
      error={error ?? ''}
      disabled={disabled}
      createHref={allowCreate ? '/suppliers/new?returnTo=/services/new' : undefined}
      createLabel="Create New Supplier"
      emptyMessage="No suppliers found"
    />
  );
}
