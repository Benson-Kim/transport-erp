'use client';

import { Controller, useFormContext } from 'react-hook-form';
import { Select } from '@/components/ui/Select';
import { FormField } from '@/components/ui/FormField';
import { Switch } from '@/components/ui/Switch';
import { FileText, Image } from 'lucide-react';
import { type SystemSettings } from '@/lib/validations/settings-schema';
import { cn } from '@/lib/utils/cn';
import { Label, Textarea } from '@/components/ui';
import { Option } from '@/types/ui';

/**
 * PDF generation settings section
 */
export default function PDFSettings() {
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<SystemSettings>();
  const includeLogo = watch('pdf.includeLogo');
  const logoPosition = watch('pdf.logoPosition');
  const paperSize = watch('pdf.paperSize');

  // Paper size dimensions for preview
  const paperDimensions = {
    A4: { width: 210, height: 297, unit: 'mm' },
    Letter: { width: 8.5, height: 11, unit: 'in' },
    Legal: { width: 8.5, height: 14, unit: 'in' },
  };

  const dimensions =
    paperDimensions[paperSize as keyof typeof paperDimensions] || paperDimensions.A4;

  const paperSizeOptions: Option[] = [
    { value: 'A4', label: 'A4 (210 × 297 mm)' },
    { value: 'Letter', label: 'Letter (8.5 × 11 in)' },
    { value: 'Legal', label: 'Legal (8.5 × 14 in)' },
  ];

  const logoPositionOptions: Option[] = [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Center' },
    { value: 'right', label: 'Right' },
  ];

  return (
    <div className="space-y-6">
      {/* Paper Configuration */}
      <div>
        <h4 className="text-sm font-semibold text-neutral-700 mb-4">Paper Configuration</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Controller
            control={control}
            name="pdf.paperSize"
            render={({ field }) => (
              <FormField
                label="Default Paper Size"
                error={errors.pdf?.paperSize?.message ?? ''}
                helperText={`${dimensions.width} × ${dimensions.height} ${dimensions.unit}`}
              >
                <Select {...field} className="w-full" size="md" options={paperSizeOptions} />
              </FormField>
            )}
          />

          <div className="flex items-center">
            <div className="bg-neutral-50 rounded-lg p-4 flex items-center justify-center w-full">
              <div
                className="bg-white border-2 border-neutral-300 rounded shadow-sm flex items-center justify-center"
                style={{
                  width: paperSize === 'A4' ? '84px' : '85px',
                  height:
                    paperSize === 'Legal' ? '140px' : paperSize === 'Letter' ? '110px' : '118px',
                }}
              >
                <FileText className="h-6 w-6 text-neutral-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Logo Settings */}
      <div>
        <h4 className="text-sm font-semibold text-neutral-700 mb-4">Logo Settings</h4>

        <Controller
          control={control}
          name="pdf.includeLogo"
          render={({ field }) => (
            <FormField label="Include Company Logo" className="mb-4">
              <Label htmlFor="includeCompanyLogo" className="text-base cursor-pointer">
                Display company logo in PDF headers
              </Label>
              <Switch
                {...field}
                id="includeCompanyLogo"
                checked={includeLogo}
                onCheckedChange={(checked) => setValue('pdf.includeLogo', checked)}
              />
            </FormField>
          )}
        />

        {includeLogo && (
          <Controller
            control={control}
            name="pdf.logoPosition"
            render={({ field }) => (
              <FormField
                label="Logo Position"
                error={errors.pdf?.logoPosition?.message ?? ''}
                helperText="Position of the logo in the document header"
              >
                <Label htmlFor="logoPosition">Logo Position</Label>
                <Select
                  {...field}
                  className="w-full"
                  size="md"
                  id="logoPosition"
                  options={logoPositionOptions}
                />
              </FormField>
            )}
          />
        )}
      </div>

      {/* Footer Settings */}
      <div>
        <h4 className="text-sm font-semibold text-neutral-700 mb-4">Footer Settings</h4>
        <Controller
          control={control}
          name="pdf.footerText"
          render={({ field }) => (
            <FormField
              label="Footer Text"
              error={errors.pdf?.footerText?.message ?? ''}
              helperText="Optional text to display in PDF footers (max 200 characters)"
            >
              <Textarea
                {...field}
                rows={3}
                maxLength={200}
                placeholder="e.g., Thank you for your business! For questions, contact support@acme.com"
              />

              <div className="text-xs text-neutral-500 text-right mt-1">
                {watch('pdf.footerText')?.length || 0} / 200
              </div>
            </FormField>
          )}
        />
      </div>

      {/* Preview */}
      <div>
        <h4 className="text-sm font-semibold text-neutral-700 mb-4">Document Preview</h4>
        <div className="bg-neutral-50 rounded-lg p-6">
          <div className="bg-white border border-neutral-200 rounded shadow-sm overflow-hidden">
            {/* Header preview */}
            {includeLogo && (
              <div
                className={cn(
                  'border-b border-neutral-200 p-4 flex items-center',
                  logoPosition === 'center' && 'justify-center',
                  logoPosition === 'right' && 'justify-end'
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-neutral-200 rounded flex items-center justify-center">
                    <Image className="h-4 w-4 text-neutral-400" />
                  </div>
                  <span className="text-sm font-medium text-neutral-700">Company Logo</span>
                </div>
              </div>
            )}

            {/* Content area */}
            <div className="p-6 space-y-3">
              <div className="h-4 bg-neutral-100 rounded w-1/3"></div>
              <div className="space-y-2">
                <div className="h-3 bg-neutral-100 rounded"></div>
                <div className="h-3 bg-neutral-100 rounded"></div>
                <div className="h-3 bg-neutral-100 rounded w-5/6"></div>
              </div>
              <div className="space-y-2 pt-2">
                <div className="h-3 bg-neutral-100 rounded"></div>
                <div className="h-3 bg-neutral-100 rounded w-4/5"></div>
              </div>
            </div>

            {/* Footer preview */}
            {watch('pdf.footerText') && (
              <div className="border-t border-neutral-200 p-4 bg-neutral-50">
                <p className="text-xs text-neutral-600 text-center">{watch('pdf.footerText')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
