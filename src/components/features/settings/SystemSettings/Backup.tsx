'use client';

import { useState, useEffect } from 'react';

import { formatDistanceToNow, format } from 'date-fns';
import {
  Database,
  Clock,
  FolderOpen,
  Info,
  CheckCircle,
  AlertTriangle,
  HardDrive,
} from 'lucide-react';
import { Controller, useFormContext } from 'react-hook-form';

import { getLastBackupTime } from '@/actions/settings-actions';
import { Alert, FormField, Input, Label, Select, Switch, TimeInput } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { type SystemSettings } from '@/lib/validations/settings-schema';
import type { Option } from '@/types/ui';

/**
 * Backup settings configuration section
 */
export default function BackupSettings() {
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<SystemSettings>();
  const enabled = watch('backup.enabled');
  const frequency = watch('backup.frequency');
  const time = watch('backup.time');
  const retentionDays = watch('backup.retentionDays');

  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const frequencyOptions: Option[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly (Sunday)' },
    { value: 'monthly', label: 'Monthly (1st day)' },
    { value: 'never', label: 'Never (Manual only)' },
  ];

  useEffect(() => {
    loadLastBackup();
  }, []);

  async function loadLastBackup() {
    try {
      const result = await getLastBackupTime();
      const timestamp = result?.timestamp ?? null;
      setLastBackup(timestamp);
    } catch (error) {
      console.error('Failed to load last backup time:', error);
    } finally {
      setLoading(false);
    }
  }

  /**
   *  Calculate next backup time
   * Note: Uses browser local time - ensure server scheduler uses same timezone
   */
  const getNextBackupTime = () => {
    if (!enabled || frequency === 'never' || !time) return null;

    const [hoursStr, minutesStr] = time.split(':');
    const hours = Number(hoursStr);
    const minutes = Number(minutesStr);

    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return null;
    }
    const next = new Date();
    next.setHours(hours, minutes, 0, 0);

    // If time has passed today, move to next occurrence
    if (next < new Date()) {
      switch (frequency) {
        case 'daily':
          next.setDate(next.getDate() + 1);
          break;
        case 'weekly':
          next.setDate(next.getDate() + 7);
          break;
        case 'monthly':
          next.setMonth(next.getMonth() + 1);
          break;
      }
    }

    return next;
  };

  const nextBackup = getNextBackupTime();

  // Storage size estimation
  const retentionDaysNum = Number(retentionDays) || 0;
  const estimatedSize =
    retentionDaysNum *
    (frequency === 'daily'
      ? 1.0
      : frequency === 'weekly'
        ? 0.14
        : frequency === 'monthly'
          ? 0.03
          : 0);

  return (
    <div className="space-y-6">
      {/* Backup Status */}
      <div>
        <h4 className="text-sm font-semibold text-neutral-700 mb-4">Backup Status</h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Last Backup Card */}
          <div
            className={cn(
              'p-4 rounded-lg border-2',
              lastBackup ? 'bg-green-50 border-green-200' : 'bg-neutral-50 border-neutral-200'
            )}
          >
            <div className="flex items-start gap-3">
              <div className={cn('p-2 rounded-lg', lastBackup ? 'bg-green-100' : 'bg-neutral-200')}>
                {lastBackup ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <Database className="h-5 w-5 text-neutral-400" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-neutral-700">Last Backup</p>
                <p className="text-xs text-neutral-500 mt-1">
                  {loading ? (
                    'Loading...'
                  ) : lastBackup ? (
                    <>
                      {format(new Date(lastBackup), 'PPp')}
                      <br />
                      <span className="text-neutral-400">
                        {formatDistanceToNow(new Date(lastBackup), { addSuffix: true })}
                      </span>
                    </>
                  ) : (
                    'No backups yet'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Next Backup Card */}
          <div
            className={cn(
              'p-4 rounded-lg border-2',
              enabled && frequency !== 'never'
                ? 'bg-blue-50 border-blue-200'
                : 'bg-neutral-50 border-neutral-200'
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'p-2 rounded-lg',
                  enabled && frequency !== 'never' ? 'bg-blue-100' : 'bg-neutral-200'
                )}
              >
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-neutral-700">Next Backup</p>
                <p className="text-xs text-neutral-500 mt-1">
                  {enabled && frequency !== 'never' && nextBackup ? (
                    <>
                      {format(nextBackup, 'PPp')}
                      <br />
                      <span className="text-neutral-400">
                        {formatDistanceToNow(nextBackup, { addSuffix: true })}
                      </span>
                    </>
                  ) : (
                    'Automatic backups disabled'
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Backup Configuration */}
      <div>
        <h4 className="text-sm font-semibold text-neutral-700 mb-4">Backup Configuration</h4>

        <FormField
          label="Enable Automatic Backups"
          className="mb-4"
          helperText="Backups will run according to the schedule below"
        >
          <Label htmlFor="backupEnabled"> Run scheduled backups automatically</Label>
          <Switch
            id="backupEnabled"
            checked={enabled}
            onCheckedChange={(checked) => setValue('backup.enabled', checked)}
          />
        </FormField>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Controller
            control={control}
            name="backup.frequency"
            render={({ field }) => (
              <FormField
                label="Backup Frequency"
                error={errors.backup?.frequency?.message ?? ''}
                helperText="How often to create backups"
              >
                <Select
                  {...field}
                  className="w-full"
                  disabled={!enabled}
                  options={frequencyOptions}
                />
              </FormField>
            )}
          />

          <Controller
            control={control}
            name="backup.time"
            render={({ field }) => (
              <FormField
                label="Backup Time"
                error={errors.backup?.time?.message ?? ''}
                helperText="Time to run backup (24-hour)"
              >
                <div className="relative">
                  <TimeInput {...field} disabled={!enabled || frequency === 'never'} />
                  <Clock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
                </div>
              </FormField>
            )}
          />

          <Controller
            control={control}
            name="backup.retentionDays"
            render={({ field }) => (
              <FormField
                label="Retention Period (days)"
                error={errors.backup?.retentionDays?.message ?? ''}
                helperText="Keep backups for this many days"
              >
                <Input
                  {...field}
                  type="number"
                  min="1"
                  max="365"
                  disabled={!enabled || frequency === 'never'}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormField>
            )}
          />
        </div>
      </div>

      {/* Storage Configuration */}
      <div>
        <h4 className="text-sm font-semibold text-neutral-700 mb-4">Storage Configuration</h4>

        <Controller
          control={control}
          name="backup.storageLocation"
          render={({ field }) => (
            <FormField
              label="Storage Location"
              error={errors.backup?.storageLocation?.message ?? ''}
              helperText="S3 bucket name, file system path, or network location"
              required={enabled && frequency !== 'never'}
            >
              <div className="relative">
                <Input
                  {...field}
                  placeholder="e.g., s3://my-backup-bucket or /backups/database"
                  disabled={!enabled || frequency === 'never'}
                  className="pl-10"
                />
                <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              </div>
            </FormField>
          )}
        />

        {/* Storage estimation */}
        {enabled && frequency !== 'never' && (
          <Alert variant="info" className="mt-4">
            <HardDrive className="h-4 w-4" />
            <div className="text-sm">
              <strong>Storage Estimate:</strong> Based on your settings, you'll need approximately{' '}
              <strong>{estimatedSize.toFixed(1)} GB</strong> of storage space for {retentionDays}{' '}
              days of backups.
              <span className="block text-xs text-neutral-600 mt-1">
                (Calculation: {retentionDaysNum} days x{' '}
                {frequency === 'daily'
                  ? '1.0 backup/day'
                  : frequency === 'weekly'
                    ? '~0.14 backups/day'
                    : '~0.03 backups/day'}
                )
              </span>
            </div>
          </Alert>
        )}
      </div>

      {/* Backup Information */}
      <div>
        <h4 className="text-sm font-semibold text-neutral-700 mb-4">Backup Information</h4>

        <div className="bg-neutral-50 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-neutral-500 mt-0.5" />
            <div className="text-sm text-neutral-600">
              <p className="mb-2">
                <strong>What's included in backups:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>All database tables and records</li>
                <li>System settings and configuration</li>
                <li>User accounts and permissions</li>
                <li>Generated documents metadata</li>
                <li>Audit logs and activity history</li>
              </ul>
            </div>
          </div>

          {!enabled && (
            <Alert variant="warning" className="mt-3">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm">
                Automatic backups are disabled. Remember to perform manual backups regularly.
              </span>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
