// EntitySelector.tsx (#47)
'use client';

/**
 * ONE async combobox for server-searched entity selection (clients,
 * suppliers). Replaces the in-memory Select over a full-table load:
 * options come from a capped server action, debounced per keystroke; the
 * selected option stays hydrated even when it is not in the current result
 * page.
 */

import { useEffect, useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import { ChevronDown, Loader2, Plus, X } from 'lucide-react';

import { Badge } from '@/components/ui';
import { cn } from '@/lib/utils/cn';

export interface EntityOption {
  id: string;
  name: string;
  code: string;
}

interface EntitySelectorProps {
  value?: string;
  onChange: (id: string) => void;
  /** Capped server search (see searchClientOptions/searchSupplierOptions). */
  search: (query: string) => Promise<EntityOption[]>;
  /** First page rendered before the user types (capped server-side). */
  initialOptions?: EntityOption[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  // `| undefined` is deliberate (exactOptionalPropertyTypes): wrappers pass
  // `allowCreate ? href : undefined`.
  createHref?: string | undefined;
  createLabel?: string;
  emptyMessage?: string;
}

const DEBOUNCE_MS = 250;

export function EntitySelector({
  value,
  onChange,
  search,
  initialOptions = [],
  placeholder = 'Select...',
  error,
  disabled = false,
  createHref,
  createLabel = 'Create new',
  emptyMessage = 'No results found',
}: Readonly<EntitySelectorProps>) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<EntityOption[]>(initialOptions);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  // Hydrated selection (#47): survives the option no longer being in the
  // current result page.
  const [selected, setSelected] = useState<EntityOption | null>(
    initialOptions.find((option) => option.id === value) ?? null
  );

  // External value changes (edit prefill, clear): re-derive when possible.
  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    if (selected?.id === value) return;
    const match =
      options.find((option) => option.id === value) ??
      initialOptions.find((option) => option.id === value);
    if (match) setSelected(match);
  }, [value, options, initialOptions, selected]);

  // Debounced server search while the listbox is open.
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      search(query)
        .then((results) => {
          if (cancelled) return;
          setOptions(results);
          setHighlighted(0);
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, search]);

  // Outside click closes.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const pick = (option: EntityOption) => {
    setSelected(option);
    onChange(option.id);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true);
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setHighlighted((current) => Math.min(current + 1, options.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setHighlighted((current) => Math.max(current - 1, 0));
        break;
      case 'Enter': {
        event.preventDefault();
        const option = options[highlighted];
        if (option) pick(option);
        break;
      }
      case 'Escape':
        setOpen(false);
        setQuery('');
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          'flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-2',
          'focus-within:ring-2 focus-within:ring-primary dark:border-neutral-700 dark:bg-neutral-900',
          disabled && 'opacity-50 pointer-events-none',
          error && 'border-red-500 focus-within:ring-red-500'
        )}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="entity-selector-listbox"
          className="h-9 w-full bg-transparent text-sm outline-none"
          placeholder={selected ? selected.name : placeholder}
          value={open ? query : (selected?.name ?? '')}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!open) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        {loading && open && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {value && !disabled && (
          <button
            type="button"
            aria-label="Clear selection"
            className="p-1 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSelected(null);
              onChange('');
              setQuery('');
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </div>

      {open && (
        <ul
          id="entity-selector-listbox"
          role="listbox"
          className={cn(
            'absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border',
            'border-neutral-200 bg-white py-1 text-sm shadow-lg',
            'dark:border-neutral-700 dark:bg-neutral-900'
          )}
        >
          {options.length === 0 && !loading && (
            <li className="px-3 py-2 text-muted-foreground">{emptyMessage}</li>
          )}
          {options.map((option, index) => (
            <li key={option.id} role="option" aria-selected={option.id === value}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left',
                  index === highlighted && 'bg-neutral-100 dark:bg-neutral-800',
                  option.id === value && 'font-medium'
                )}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => pick(option)}
              >
                <Badge variant="active" size="sm">
                  {option.code}
                </Badge>
                <span className="truncate">{option.name}</span>
              </button>
            </li>
          ))}
          {createHref && (
            <li role="option" aria-selected={false}>
              <button
                type="button"
                className="flex w-full items-center gap-2 border-t border-neutral-200 px-3 py-2 text-left text-primary dark:border-neutral-700"
                onClick={() => router.push(createHref)}
              >
                <Plus className="h-4 w-4" />
                {createLabel}
              </button>
            </li>
          )}
        </ul>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
