// SuppliersSelector.tsx
'use client';

import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { Select, Badge } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { useRouter } from 'next/navigation';
import type { Option } from '@/types/ui';

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
}: SupplierSelectorProps) {
  const router = useRouter();

  // Convert suppliers to Option format with groups
  const options = useMemo<Option[]>(() => {
    const supplierOptions: Option[] = suppliers.map((supplier) => ({
      value: supplier.id,
      label: supplier.name,
      description: `${supplier.supplierCode}${supplier.email ? ` • ${supplier.email}` : ''}`,
      group: supplier.isActive !== false ? 'Active Suppliers' : 'Inactive Suppliers',
      disabled: false,
      icon: (
        <Badge variant={supplier.isActive !== false ? 'active' : 'cancelled'} size="sm">
          {supplier.supplierCode}
        </Badge>
      ),
    }));

    // Add "Create New" option if allowed
    if (allowCreate) {
      supplierOptions.push({
        value: '__create_new__',
        label: 'Create New Supplier',
        icon: <Plus className="h-4 w-4" />,
        group: 'Actions',
      });
    }

    return supplierOptions;
  }, [suppliers, allowCreate]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;

    if (selectedValue === '__create_new__') {
      router.push('/suppliers/new?returnTo=/services/new');
    } else {
      onChange(selectedValue);
    }
  };

  return (
    <Select
      value={value}
      onChange={handleChange}
      options={options}
      placeholder={placeholder}
      searchable
      clearable={!!value}
      onClear={() => onChange('')}
      disabled={disabled}
      error={error ? error : ''}
      emptyMessage="No suppliers found"
      className={cn(error && 'border-red-500 ring-0 focus-visible:ring-red-500')}
    />
  );
}
