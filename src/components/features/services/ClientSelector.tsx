// ClientSelector.tsx
'use client';

/**
 * #47: thin wrapper over the shared async EntitySelector. Public props are
 * UNCHANGED (ServiceForm needs no edits): `clients` now feeds only the
 * capped initial page; typing streams server-side, index-backed results
 * via searchClientOptions - the full client table is never loaded.
 */

import { useCallback, useMemo } from 'react';

import { searchClientOptions } from '@/actions/service-actions';

import { EntitySelector, type EntityOption } from './EntitySelector';

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
  const initialOptions = useMemo<EntityOption[]>(
    () =>
      clients.map((client) => ({
        id: client.id,
        name: client.name,
        code: client.clientCode,
      })),
    [clients]
  );

  const search = useCallback(async (query: string): Promise<EntityOption[]> => {
    const results = await searchClientOptions(query);
    return results.map((client) => ({
      id: client.id,
      name: client.name,
      code: client.clientCode,
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
      createHref={allowCreate ? '/clients/new?returnTo=/services/new' : undefined}
      createLabel="Create New Client"
      emptyMessage="No clients found"
    />
  );
}
