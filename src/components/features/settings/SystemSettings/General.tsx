'use client';

import { Controller, useFormContext } from 'react-hook-form';

import { Label } from '@/components/ui';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { type SystemSettings } from '@/lib/validations/settings-schema';

/**
 * General settings with feature toggles
 */
export default function GeneralSettings() {
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<SystemSettings>();

  const featureToggles = [
    {
      name: 'enableTwoFactor',
      label: 'Two-Factor Authentication',
      description: 'Require 2FA for all users',
    },
    {
      name: 'enableNotifications',
      label: 'Email Notifications',
      description: 'Send system notifications via email',
    },
    { name: 'enableAutoBackup', label: 'Automatic Backups', description: 'Run scheduled backups' },
    {
      name: 'requireClientVat',
      label: 'Require Client VAT',
      description: 'Make VAT number mandatory for clients',
    },
  ];

  const dateFormatOptions = [
    { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (31/12/2024)' },
    { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (12/31/2024)' },
    { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (2024-12-31)' },
    { value: 'DD.MM.YYYY', label: 'DD.MM.YYYY (31.12.2024)' },
  ];

  const currencyOptions = [
    { value: 'EUR', label: 'EUR (€) - Euro' },
    { value: 'USD', label: 'USD ($) - US Dollar' },
    { value: 'GBP', label: 'GBP (£) - British Pound' },
  ];

  return (
    <div className="space-y-6">
      {/* Regional Settings */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-4">Regional Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Controller
            control={control}
            name="general.defaultCurrency"
            render={({ field }) => (
              <FormField
                label="Default Currency"
                error={errors.general?.defaultCurrency?.message ?? ''}
              >
                <Select {...field} className="w-full" size="md" options={currencyOptions} />
              </FormField>
            )}
          />
          <Controller
            control={control}
            name="general.dateFormat"
            render={({ field }) => (
              <FormField label="Date Format" error={errors.general?.dateFormat?.message ?? ''}>
                <Select {...field} className="w-full" options={dateFormatOptions} />
              </FormField>
            )}
          />
          <Controller
            control={control}
            name="general.timeFormat"
            render={({ field }) => (
              <FormField label="Time Format" error={errors.general?.timeFormat?.message ?? ''}>
                <Select
                  {...field}
                  className="w-full"
                  size="md"
                  options={[
                    { value: '24', label: '24-hour (14:30)' },
                    { value: '12', label: '12-hour (2:30 PM)' },
                  ]}
                />
              </FormField>
            )}
          />
          <Controller
            control={control}
            name="general.itemsPerPage"
            render={({ field }) => (
              <FormField
                label="Items Per Page"
                error={errors.general?.itemsPerPage?.message ?? ''}
                helperText="Default pagination size"
              >
                <Select
                  {...field}
                  className="w-full"
                  size="md"
                  options={[
                    { value: '10', label: '10 items' },
                    { value: '25', label: '25 items' },
                    { value: '50', label: '50 items' },
                    { value: '100', label: '100 items' },
                  ]}
                />
              </FormField>
            )}
          />
        </div>
      </div>

      {/* Tax Settings */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-4">Tax Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Controller
            control={control}
            name="general.defaultVatRate"
            render={({ field }) => (
              <FormField
                label="Default VAT Rate (%)"
                error={errors.general?.defaultVatRate?.message ?? ''}
                helperText="Applied to new services"
              >
                <Input {...field} type="number" min="0" max="100" step="0.01" />
              </FormField>
            )}
          />
          <Controller
            control={control}
            name="general.defaultIrpfRate"
            render={({ field }) => (
              <FormField
                label="Default IRPF Rate (%)"
                error={errors.general?.defaultIrpfRate?.message ?? ''}
                helperText="Income tax retention rate"
              >
                <Input {...field} type="number" min="0" max="100" step="0.01" />
              </FormField>
            )}
          />
        </div>
      </div>

      {/* Archive Settings */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-4">Archive Settings</h3>

        <Controller
          control={control}
          name="general.autoArchiveMonths"
          render={({ field }) => (
            <FormField
              label="Auto Archive After (months)"
              error={errors.general?.autoArchiveMonths?.message ?? ''}
              helperText="Automatically archive completed services after this period"
            >
              <Input {...field} type="number" min="0" max="120" className="w-32" />
            </FormField>
          )}
        />
      </div>

      {/* Feature Toggles */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-4">Feature Toggles</h3>
        <div className="space-y-3">
          {featureToggles.map((toggle) => (
            <Controller
              control={control}
              name={`general.${toggle.name}` as any}
              render={({ field }) => (
                <FormField key={toggle.name}>
                  <Label htmlFor={toggle.name}>{toggle.label}</Label>
                  <Switch
                    {...field}
                    id={toggle.name}
                    checked={watch(`general.${toggle.name}` as any)}
                    onCheckedChange={(checked) =>
                      setValue(`general.${toggle.name}` as any, checked)
                    }
                  />
                </FormField>
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
