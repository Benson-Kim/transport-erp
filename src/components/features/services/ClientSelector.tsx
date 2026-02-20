// ClientSelector.tsx
'use client';

import { useMemo } from 'react';

import { useRouter } from 'next/navigation';

import { Plus } from 'lucide-react';

import { Select, Badge } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import type { Option } from '@/types/ui';

interface Client {
  id: string;
  name: string;
  clientCode: string;
  email?: string;
  isActive?: boolean;
}

interface ClientSelectorProps {
  clients: Client[];
  value?: string;
  onChange: (clientId: string) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  allowCreate?: boolean;
}

export function ClientSelector({
  clients,
  value,
  onChange,
  error,
  disabled = false,
  placeholder = 'Select client...',
  allowCreate = true,
}: Readonly<ClientSelectorProps>) {
  const router = useRouter();

  // Convert clients to Option format with groups
  const options = useMemo<Option[]>(() => {
    const clientOptions: Option[] = clients.map((client) => ({
      value: client.id,
      label: client.name,
      description: [client.clientCode, client.email].filter(Boolean).join(' • '),
      group: client.isActive === false ? 'Inactive Clients' : 'Active Clients',
      disabled: false,
      icon: (
        <Badge variant={client.isActive === false ? 'cancelled' : 'active'} size="sm">
          {client.clientCode}
        </Badge>
      ),
    }));

    // Add "Create New" option if allowed
    if (allowCreate) {
      clientOptions.push({
        value: '__create_new__',
        label: 'Create New Client',
        icon: <Plus className="h-4 w-4" />,
        group: 'Actions',
      });
    }

    return clientOptions;
  }, [clients, allowCreate]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;

    if (selectedValue === '__create_new__') {
      router.push('/clients/new?returnTo=/services/new');
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
      error={error || ''}
      emptyMessage="No clients found"
      className={cn(error && 'border-red-500 ring-0 focus-visible:ring-red-500')}
    />
  );
}
