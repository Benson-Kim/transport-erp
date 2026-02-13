/**
 * EmptyState Component
 * Placeholder for empty content with actions
 */

import { ReactNode } from 'react';
import { Search, Database, Lock, AlertCircle, Plus, Upload } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui';

export interface EmptyStateProps {
  variant?: 'no-data' | 'no-results' | 'no-access' | 'error' | 'custom';
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?:
    | {
        label: string;
        onClick: () => void;
        icon?: ReactNode;
      }
    | undefined;
  secondaryAction?:
    | {
        label: string;
        onClick: () => void;
      }
    | undefined;
  className?: string;
}

const presetConfigs: Record<
  NonNullable<EmptyStateProps['variant']>,
  Partial<Pick<EmptyStateProps, 'icon' | 'title' | 'description'>>
> = {
  'no-data': {
    icon: <Database size={48} />,
    title: 'No data yet',
    description: 'Get started by creating your first item.',
  },
  'no-results': {
    icon: <Search size={48} />,
    title: 'No results found',
    description: 'Try adjusting your search or filter criteria.',
  },
  'no-access': {
    icon: <Lock size={48} />,
    title: 'Access restricted',
    description: "You don't have permission to view this content.",
  },
  error: {
    icon: <AlertCircle size={48} />,
    title: 'Something went wrong',
    description: 'An error occurred while loading the content.',
  },
  custom: {}, // valid now
};

export function EmptyState({
  variant = 'no-data',
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: Readonly<EmptyStateProps>) {
  const config = presetConfigs[variant];

  const displayIcon = icon === undefined ? config.icon : icon;
  const displayTitle = title || config.title || 'No content';
  const displayDescription = description || config.description;

  return (
    <div
      className={cn('flex flex-col items-center justify-center py-12 px-6 text-center', className)}
    >
      {displayIcon && <div className="text-neutral-400 mb-4">{displayIcon}</div>}

      <h3 className="text-lg font-medium text-neutral-900 mb-2">{displayTitle}</h3>

      {displayDescription && (
        <p className="text-sm text-neutral-600 mb-6 max-w-md">{displayDescription}</p>
      )}

      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && (
            <Button onClick={action.onClick} icon={action.icon}>
              {action.label}
            </Button>
          )}

          {secondaryAction && (
            <Button variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Common Empty State Presets
export function NoDataEmptyState({ onAdd }: Readonly<{ onAdd?: () => void }>) {
  return (
    <EmptyState
      variant="no-data"
      action={
        onAdd
          ? {
              label: 'Add Item',
              onClick: onAdd,
              icon: <Plus size={16} />,
            }
          : undefined
      }
    />
  );
}

export function NoResultsEmptyState({ onClear }: Readonly<{ onClear?: () => void }>) {
  return (
    <EmptyState
      variant="no-results"
      action={
        onClear
          ? {
              label: 'Clear Filters',
              onClick: onClear,
            }
          : undefined
      }
    />
  );
}

export function UploadEmptyState({ onUpload }: Readonly<{ onUpload: () => void }>) {
  return (
    <EmptyState
      icon={<Upload size={48} />}
      title="No files uploaded"
      description="Upload files to get started"
      action={{
        label: 'Upload Files',
        onClick: onUpload,
        icon: <Upload size={16} />,
      }}
    />
  );
}
