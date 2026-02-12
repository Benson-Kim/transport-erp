// components/features/services/PricingCalculator.tsx
'use client';
import { Controller, UseFormReturn } from 'react-hook-form';
import { Input, Select, FormField, Tooltip } from '@/components/ui';
import { Calculator, Info, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { ServiceFormData } from '@/lib/validations/service-schema';
import { Option } from '@/types/ui';
import { formatPercentage } from '@/lib/utils/formatting';

interface PricingCalculatorProps {
  form: UseFormReturn<ServiceFormData>;
  margin: number;
  marginPercent: number;
}

// Currency options with icons
const CURRENCY_OPTIONS: Option[] = [
  {
    value: 'EUR',
    label: 'EUR - Euro',
    icon: '€',
    description: 'European Union',
  },
  {
    value: 'USD',
    label: 'USD - US Dollar',
    icon: '$',
    description: 'United States',
  },
  {
    value: 'GBP',
    label: 'GBP - British Pound',
    icon: '£',
    description: 'United Kingdom',
  },
];

// VAT rate options
const VAT_RATE_OPTIONS: Option[] = [
  { value: '0', label: '0% - No VAT' },
  { value: '10', label: '10% - Reduced Rate' },
  { value: '21', label: '21% - Standard Rate' },
];

// Helper to get currency symbol
const getCurrencySymbol = (currency: string) => {
  const curr = CURRENCY_OPTIONS.find((c) => c.value === currency);
  return curr?.icon || '€';
};

export function PricingCalculator({
  form,
  margin,
  marginPercent,
}: Readonly<PricingCalculatorProps>) {
  const {
    control,
    watch,
    setValue,
    formState: { errors: _errors },
  } = form;

  // Watch all relevant fields
  const costAmount = watch('costAmount') || 0;
  const saleAmount = watch('saleAmount') || 0;
  const costCurrency = watch('costCurrency') || 'EUR';
  const saleCurrency = watch('saleCurrency') || 'EUR';
  const costVatRate = watch('costVatRate') || 21;
  const saleVatRate = watch('saleVatRate') || 21;

  // Legacy fields for backward compatibility (optional)
  const kilometers = watch('distance');
  const pricePerKm = watch('pricePerKm');
  const extras = watch('extras') || 0;

  // Get currency symbols
  const costCurrencySymbol = getCurrencySymbol(costCurrency);
  const saleCurrencySymbol = getCurrencySymbol(saleCurrency);

  // Calculate VAT amounts
  const costVatAmount = costAmount * (costVatRate / 100);
  const costTotalWithVat = costAmount + costVatAmount;
  const saleVatAmount = saleAmount * (saleVatRate / 100);
  const saleTotalWithVat = saleAmount + saleVatAmount;

  // Auto-calculate cost from legacy fields if they exist
  const isAutoCalculated = !!(kilometers && pricePerKm);

  // Handle auto-calculation
  const handleAutoCalculation = () => {
    if (kilometers && pricePerKm) {
      const calculated = kilometers * pricePerKm + extras;
      setValue('costAmount', calculated, { shouldValidate: true });
    }
  };

  return (
    <div className="space-y-6">
      {/* Optional Legacy Calculation Fields */}
      <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium flex items-center">
            <Calculator className="h-4 w-4 mr-2" />
            Quick Calculator (Optional)
          </h4>
          {isAutoCalculated && (
            <span className="text-xs text-muted-foreground">Auto-calculating cost</span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Kilometers */}
          <Controller
            control={control}
            name="distance"
            render={({ field }) => (
              <FormField label="Kilometers">
                <Input
                  {...field}
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={field.value || ''}
                  onChange={(e) => {
                    field.onChange(e.target.value ? Number(e.target.value) : undefined);
                    setTimeout(handleAutoCalculation, 0);
                  }}
                />
              </FormField>
            )}
          />

          {/* Price per Km */}
          <Controller
            control={control}
            name="pricePerKm"
            render={({ field }) => (
              <FormField label="Price/km">
                <Input
                  {...field}
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={field.value || ''}
                  onChange={(e) => {
                    field.onChange(e.target.value ? Number(e.target.value) : undefined);
                    setTimeout(handleAutoCalculation, 0);
                  }}
                  prefix={costCurrencySymbol}
                />
              </FormField>
            )}
          />

          {/* Extras */}
          <Controller
            control={control}
            name="extras"
            render={({ field }) => (
              <FormField label="Extras">
                <Input
                  {...field}
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={field.value || ''}
                  onChange={(e) => {
                    field.onChange(e.target.value ? Number(e.target.value) : 0);
                    setTimeout(handleAutoCalculation, 0);
                  }}
                  prefix={costCurrencySymbol}
                />
              </FormField>
            )}
          />

          {/* Calculated Result */}
          {isAutoCalculated && (
            <div className="flex items-end">
              <div className="w-full px-3 py-2 bg-white border rounded-lg font-mono text-sm">
                = {costCurrencySymbol}
                {(kilometers * pricePerKm + extras).toFixed(2)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Cost Section */}
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center">
          <DollarSign className="h-4 w-4 mr-2" />
          Cost
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Cost Amount */}
          <Controller
            control={control}
            name="costAmount"
            render={({ field, fieldState }) => (
              <FormField label="Cost Amount" required error={fieldState.error?.message ?? ''}>
                <Input
                  {...field}
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={field.value || ''}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                  prefix={costCurrencySymbol}
                  disabled={isAutoCalculated}
                  className={isAutoCalculated ? 'bg-neutral-50' : ''}
                  error={fieldState.error?.message ?? ''}
                />
              </FormField>
            )}
          />

          {/* Cost Currency */}
          <Controller
            control={control}
            name="costCurrency"
            render={({ field, fieldState }) => (
              <FormField label="Currency" error={fieldState.error?.message ?? ''}>
                <Select
                  options={CURRENCY_OPTIONS}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder="Select currency"
                  searchable={false}
                  error={fieldState.error?.message ?? ''}
                />
              </FormField>
            )}
          />

          {/* Cost VAT Rate */}
          <Controller
            control={control}
            name="costVatRate"
            render={({ field, fieldState }) => (
              <FormField label="VAT Rate" error={fieldState.error?.message ?? ''}>
                <Select
                  options={VAT_RATE_OPTIONS}
                  value={String(field.value)}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                  placeholder="Select VAT rate"
                  searchable={false}
                  error={fieldState.error?.message ?? ''}
                />
              </FormField>
            )}
          />
        </div>

        {/* Cost Summary */}
        <div className="mt-2 p-2 bg-neutral-50 rounded text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>
              Net: {costCurrencySymbol}
              {costAmount.toFixed(2)}
            </span>
            <span>
              + VAT ({costVatRate}%): {costCurrencySymbol}
              {costVatAmount.toFixed(2)}
            </span>
            <span className="font-medium text-neutral-900">
              = Total: {costCurrencySymbol}
              {costTotalWithVat.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Sale Section */}
      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center">
          <TrendingUp className="h-4 w-4 mr-2" />
          Sale
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Sale Amount */}
          <Controller
            control={control}
            name="saleAmount"
            render={({ field, fieldState }) => (
              <FormField label="Sale Amount" required error={fieldState.error?.message ?? ''}>
                <Input
                  {...field}
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={field.value || ''}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                  prefix={saleCurrencySymbol}
                  error={fieldState.error?.message ?? ''}
                />
              </FormField>
            )}
          />

          {/* Sale Currency */}
          <Controller
            control={control}
            name="saleCurrency"
            render={({ field, fieldState }) => (
              <FormField label="Currency" error={fieldState.error?.message ?? ''}>
                <Select
                  options={CURRENCY_OPTIONS}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder="Select currency"
                  searchable={false}
                  error={fieldState.error?.message ?? ''}
                />
              </FormField>
            )}
          />

          {/* Sale VAT Rate */}
          <Controller
            control={control}
            name="saleVatRate"
            render={({ field, fieldState }) => (
              <FormField label="VAT Rate" error={fieldState.error?.message ?? ''}>
                <Select
                  options={VAT_RATE_OPTIONS}
                  value={String(field.value)}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                  placeholder="Select VAT rate"
                  searchable={false}
                  error={fieldState.error?.message ?? ''}
                />
              </FormField>
            )}
          />
        </div>

        {/* Sale Summary */}
        <div className="mt-2 p-2 bg-neutral-50 rounded text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>
              Net: {saleCurrencySymbol}
              {saleAmount.toFixed(2)}
            </span>
            <span>
              + VAT ({saleVatRate}%): {saleCurrencySymbol}
              {saleVatAmount.toFixed(2)}
            </span>
            <span className="font-medium text-neutral-900">
              = Total: {saleCurrencySymbol}
              {saleTotalWithVat.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Margin Analysis */}
      <div className="p-4 bg-white rounded-lg border-2 border-neutral-200">
        <h4 className="text-sm font-medium mb-3 flex items-center">
          {margin >= 0 ? (
            <TrendingUp className="h-4 w-4 mr-2 text-green-600" />
          ) : (
            <TrendingDown className="h-4 w-4 mr-2 text-red-600" />
          )}
          Margin Analysis
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Gross Margin */}
          <div>
            <p className="block text-xs text-muted-foreground mb-1">Gross Margin</p>
            <div
              className={cn(
                'px-3 py-2 border rounded-lg bg-white font-medium text-center',
                margin >= 0 ? 'text-green-600 border-green-200' : 'text-red-600 border-red-200'
              )}
            >
              {costCurrency === saleCurrency ? (
                `${costCurrencySymbol}${margin.toFixed(2)}`
              ) : (
                <Tooltip content="Different currencies - convert for accurate margin">
                  <span className="flex items-center justify-center">
                    ~{saleCurrencySymbol}
                    {margin.toFixed(2)}
                    <Info className="h-3 w-3 ml-1" />
                  </span>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Margin Percentage */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 flex items-center">
              Margin %
              <Tooltip content="(Sale - Cost) / Sale × 100">
                <Info className="h-3 w-3 ml-1" />
              </Tooltip>
            </label>
            <div
              className={cn(
                'px-3 py-2 border rounded-lg bg-white font-medium text-center',
                marginPercent >= 20
                  ? 'text-green-600 border-green-200'
                  : marginPercent >= 10
                    ? 'text-yellow-600 border-yellow-200'
                    : 'text-red-600 border-red-200'
              )}
            >
              {formatPercentage(marginPercent)}
            </div>
          </div>

          {/* Markup */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 flex items-center">
              Markup %
              <Tooltip content="(Sale - Cost) / Cost × 100">
                <Info className="h-3 w-3 ml-1" />
              </Tooltip>
            </label>
            <div className="px-3 py-2 border rounded-lg bg-white text-center">
              {costAmount > 0 ? ((margin / costAmount) * 100).toFixed(2) : '0.00'}%
            </div>
          </div>

          {/* ROI */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 flex items-center">
              ROI
              <Tooltip content="Return on Investment">
                <Info className="h-3 w-3 ml-1" />
              </Tooltip>
            </label>
            <div
              className={cn(
                'px-3 py-2 border rounded-lg bg-white text-center',
                margin > 0 ? 'text-green-600' : margin < 0 ? 'text-red-600' : ''
              )}
            >
              {costAmount > 0 ? (margin / costAmount).toFixed(2) : '0.00'}x
            </div>
          </div>
        </div>

        {/* Target margin suggestions */}
        {marginPercent < 20 && saleAmount > 0 && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
            <p className="text-xs text-yellow-800 mb-2">
              <Info className="h-3 w-3 inline mr-1" />
              Suggested sale prices for better margins:
            </p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-yellow-600">20% margin:</span>
                <span className="font-medium ml-1">
                  {saleCurrencySymbol}
                  {(costAmount / 0.8).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-yellow-600">30% margin:</span>
                <span className="font-medium ml-1">
                  {saleCurrencySymbol}
                  {(costAmount / 0.7).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-yellow-600">40% margin:</span>
                <span className="font-medium ml-1">
                  {saleCurrencySymbol}
                  {(costAmount / 0.6).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Warning for different currencies */}
        {costCurrency !== saleCurrency && (
          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
            <Info className="h-3 w-3 inline mr-1" />
            Cost and sale are in different currencies. Margin calculation may not be accurate
            without currency conversion.
          </div>
        )}
      </div>

      {/* Legacy hidden fields for backward compatibility */}
      <Controller
        control={control}
        name="sale"
        render={({ field }) => <input type="hidden" {...field} value={saleAmount} />}
      />
      <Controller
        control={control}
        name="totalCost"
        render={({ field }) => <input type="hidden" {...field} value={costAmount} />}
      />
    </div>
  );
}
