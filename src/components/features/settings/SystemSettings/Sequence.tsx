'use client';

import { useMemo } from 'react';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import type { Option } from '@/types/ui';
import { FormField, Input, Select } from '@/components/ui';
import { type SystemSettings } from '@/lib/validations/settings-schema';
import {
  generateNumberPreview,
  parseFormatTokens,
  validateNumberFormat,
} from '@/lib/utils/number-format';

const TEST_NUMBERS = {
  service: 42,
  invoice: 128,
  loadingOrder: 15,
  payment: 7,
} as const;

const RESET_FREQUENCY_OPTIONS: Option[] = [
  { value: 'yearly', label: 'Yearly (January 1st)' },
  { value: 'monthly', label: 'Monthly (1st of month)' },
  { value: 'never', label: 'Never (continuous)' },
  { value: 'manual', label: 'Manual only' },
];

export default function SequenceSettings() {
  const {
    control,
    formState: { errors },
  } = useFormContext<SystemSettings>();

  const formats = useWatch({ control, name: 'numberSequences' });

  const previews = useMemo(
    () => ({
      service: formats?.serviceFormat
        ? generateNumberPreview(formats.serviceFormat, TEST_NUMBERS.service)
        : '',
      invoice: formats?.invoiceFormat
        ? generateNumberPreview(formats.invoiceFormat, TEST_NUMBERS.invoice)
        : '',
      loadingOrder: formats?.loadingOrderFormat
        ? generateNumberPreview(formats.loadingOrderFormat, TEST_NUMBERS.loadingOrder)
        : '',
      payment: formats?.paymentNumberFormat
        ? generateNumberPreview(formats.paymentNumberFormat, TEST_NUMBERS.payment)
        : '',
    }),
    [formats, TEST_NUMBERS]
  );

  const formatConfig = [
    {
      name: 'serviceFormat',
      label: 'Service Number Format',
      placeholder: 'SRV-YYYY-NNNNN',
      preview: previews.service,
      testNumber: TEST_NUMBERS.service,
    },
    {
      name: 'invoiceFormat',
      label: 'Invoice Number Format',
      placeholder: 'INV-YYYY-NNNNN',
      preview: previews.invoice,
      testNumber: TEST_NUMBERS.invoice,
    },
    {
      name: 'loadingOrderFormat',
      label: 'Loading Order Format',
      placeholder: 'LO-YYYY-NNNNN',
      preview: previews.loadingOrder,
      testNumber: TEST_NUMBERS.loadingOrder,
    },
    {
      name: 'paymentNumberFormat',
      label: 'Payment Number Format',
      placeholder: 'PAY-YYYY-NNNNN',
      preview: previews.payment,
      testNumber: TEST_NUMBERS.payment,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-neutral-50 p-4 mb-4">
        <p className="text-sm text-neutral-600">
          <strong>Format tokens:</strong> YYYY (year), YY (2-digit year), MM (month), DD (day),
          NNNNN (5-digit number), NNNN (4-digit number), NNN (3-digit number)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {formatConfig.map((config) => (
          <Controller
            key={config.name}
            control={control}
            name={`numberSequences.${config.name}` as any}
            rules={{
              validate: (value) => {
                const result = validateNumberFormat(value);
                return result.valid || result.error;
              },
            }}
            render={({ field }) => {
              const validation = validateNumberFormat(field.value);
              const parsed = parseFormatTokens(field.value);
              const preview = previews[config.name.replace('Format', '') as keyof typeof previews];

              return (
                <FormField
                  label={config.label}
                  required
                  error={
                    errors.numberSequences?.[config.name as keyof typeof errors.numberSequences]
                      ?.message ?? ''
                  }
                >
                  <Input {...field} placeholder={config.placeholder} />

                  {(parsed.tokens.length > 0 || preview) && (
                    <div className="mt-2 p-2 bg-blue-50 rounded text-sm">
                      <div className="flex flex-col md:flex-row md:items-center md:gap-4 gap-2">
                        {/* Tokens */}
                        {parsed.tokens.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {parsed.tokens.map((token) => (
                              <span
                                key={token}
                                className="px-2 py-0.5 text-xs rounded bg-neutral-100 font-mono"
                              >
                                {token}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Preview */}
                        {preview && (
                          <div className="flex items-center gap-1">
                            <span className="text-neutral-600">Preview:</span>
                            <span className="font-mono font-semibold text-blue-700">{preview}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {validation.valid && validation.warnings?.length && (
                    <ul className="mt-2 text-xs text-amber-600 space-y-1">
                      {validation.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                </FormField>
              );
            }}
          />
        ))}
      </div>

      <Controller
        control={control}
        name="numberSequences.sequenceReset"
        render={({ field }) => (
          <FormField
            label="Sequence Reset"
            helperText="When to reset number sequences to 1"
            error={errors.numberSequences?.sequenceReset?.message ?? ''}
          >
            <Select {...field} options={RESET_FREQUENCY_OPTIONS} className="w-full md:w-64" />
          </FormField>
        )}
      />
    </div>
  );
}
