// components/features/services/ServiceForm.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { format, formatDistanceToNow } from 'date-fns';
import { ServiceStatus, UserRole } from '@/app/generated/prisma';

import {
  FormField,
  Card,
  CardBody,
  Button,
  Input,
  DatePicker,
  Checkbox,
  Alert,
  Badge,
  Textarea, // Make sure this is imported correctly
} from '@/components/ui';
import { ServiceFormSection } from './ServiceFormSection';
import { PricingCalculator } from './PricingCalculator';
import { ClientSelector } from './ClientSelector';
import { SupplierSelector } from './SupplierSelector';
import { useAutoSave, useUnsavedChanges } from '@/hooks';
import { serviceSchema, ServiceFormData } from '@/lib/validations/service-schema';
import { createService, updateService, deleteService } from '@/actions/service-actions';
import { hasPermission } from '@/lib/permissions';
import { toast } from '@/lib/toast';
import { Save, AlertCircle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface ServiceFormProps {
  mode: 'create' | 'edit' | 'duplicate';
  service?: any;
  sourceService?: any;
  clients: any[];
  suppliers: any[];
  duplicateFrom?: string;
  userRole: UserRole;
}

// Separate component for auto-save to prevent re-renders
function AutoSaveManager({ 
  control, 
  mode, 
  duplicateFrom, 
  onSave 
}: {
  control: any;
  mode: string;
  duplicateFrom?: string;
  onSave: () => void;
}) {
  const formValues = useWatch({ control });

  useAutoSave(
    formValues,
    {
      key: 'service-form-draft',
      delay: 30000,
      enabled: mode === 'create' && !duplicateFrom,
      onSave,
    }
  );

  return null;
}

export function ServiceForm({ 
  mode, 
  service, 
  sourceService,
  clients, 
  suppliers,
  duplicateFrom,
  userRole,
}: ServiceFormProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveAndNew, setSaveAndNew] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  // Get smart defaults from localStorage
  const getSmartDefaults = () => {
    const baseDefaults = {
      date: new Date(),
      clientId: '',
      supplierId: '',
      description: '',
      reference: '',
      origin: '',
      destination: '',
      distance: 0,
      vehicleType: '',
      vehiclePlate: '',
      driverName: '',
      costAmount: 0,
      costCurrency: 'EUR',
      saleAmount: 0,
      saleCurrency: 'EUR',
      costVatRate: 21,
      saleVatRate: 21,
      status: ServiceStatus.DRAFT,
      notes: '',
      internalNotes: '',
    //   pricePerKm: 0,
      extras: 0,
      totalCost: 0,
      sale: 0,
      completed: false,
      cancelled: false,
    };

    if (typeof window === 'undefined') {
      return {
        ...baseDefaults,
        ...((mode === 'duplicate' && sourceService) ? {
          ...sourceService,
          date: new Date(),
          serviceNumber: undefined,
          status: ServiceStatus.DRAFT,
        } : {}),
        ...(mode === 'edit' && service ? service : {}),
      };
    }

    const lastClient = localStorage.getItem('last-used-client');
    const lastSupplier = localStorage.getItem('last-used-supplier');

    return {
      ...baseDefaults,
      clientId: lastClient || '',
      supplierId: lastSupplier || '',
      ...((mode === 'duplicate' && sourceService) ? {
        ...sourceService,
        date: new Date(),
        serviceNumber: undefined,
        status: ServiceStatus.DRAFT,
      } : {}),
      ...(mode === 'edit' && service ? service : {}),
    };
  };

  // Initialize form
  const form = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: getSmartDefaults(),
  });

  const { 
    control, 
    handleSubmit, 
    watch, 
    setValue, 
    reset,
    formState: { errors, isDirty } 
  } = form;

  // Restore draft on mount
  useEffect(() => {
    if (mode === 'create' && !duplicateFrom) {
      const draft = localStorage.getItem('service-form-draft');
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          reset(parsed.data);
          toast.info('Draft restored from auto-save');
        } catch (error) {
          console.error('Failed to restore draft:', error);
        }
      }
    }
  }, [reset, mode, duplicateFrom]);

  // Unsaved changes warning
  useUnsavedChanges(isDirty);

  // Watch fields for calculations (using correct field names)
  const costAmount = watch('costAmount');
  const saleAmount = watch('saleAmount');
  const kilometers = watch('distance');
  const pricePerKm = watch('pricePerKm');
  const extras = watch('extras');

  // Auto-calculate totalCost from legacy fields
  useEffect(() => {
    if (kilometers && pricePerKm) {
      const calculated = (kilometers * pricePerKm) + (extras || 0);
      setValue('totalCost', calculated, { shouldValidate: true });
    }
  }, [kilometers, pricePerKm, extras, setValue]);

  // Calculate margin using the correct fields
  const margin = saleAmount && costAmount ? saleAmount - costAmount : 0;
  const marginPercent = saleAmount && saleAmount > 0 ? (margin / saleAmount) * 100 : 0;

  // Handle form submission
  const onSubmit = async (data: ServiceFormData) => {
    setIsSaving(true);
    
    try {
      // Save last used client and supplier
      localStorage.setItem('last-used-client', data.clientId);
      localStorage.setItem('last-used-supplier', data.supplierId);

      if (mode === 'create' || mode === 'duplicate') {
        const result = await createService(data);
        toast.success(`Service ${result.service.serviceNumber} created successfully`);
        
        // Clear draft after successful save
        if (mode === 'create') {
          localStorage.removeItem('service-form-draft');
        }
        
        if (saveAndNew) {
          reset(getSmartDefaults());
          setSaveAndNew(false);
        } else {
          router.push('/services');
        }
      } else {
        await updateService(service.id, data);
        toast.success('Service updated successfully');
        router.push(`/services/${service.id}`);
      }
    } catch (error) {
      console.error('Failed to save service:', error);
      toast.error('Failed to save service. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!service?.id) return;
    
    if (!confirm('Are you sure you want to delete this service? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteService(service.id);
      toast.success('Service deleted successfully');
      router.push('/services');
    } catch (error) {
      console.error('Failed to delete service:', error);
      toast.error('Failed to delete service. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Keyboard shortcut for save (Ctrl/Cmd + S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSubmit(onSubmit)();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSubmit]);

  return (
    <form 
      onSubmit={handleSubmit(onSubmit)} 
      className="space-y-6 max-w-5xl mx-auto"
      noValidate
    >
      {/* Auto-save component */}
      <AutoSaveManager 
        control={control} 
        mode={mode} 
        {...duplicateFrom && {duplicateFrom}}
        onSave={() => setLastSavedAt(new Date())} 
      />

      {/* Duplicate Banner */}
      {mode === 'duplicate' && duplicateFrom && (
        <Alert variant="info">
          <div className="flex items-center justify-between">
            <span>Duplicated from Service #{duplicateFrom}</span>
            <Badge variant="active">Date required</Badge>
          </div>
        </Alert>
      )}

      {/* Auto-save indicator */}
      {mode === 'create' && lastSavedAt && (
        <div className="text-xs text-muted-foreground text-right">
          Draft saved {formatDistanceToNow(lastSavedAt, { addSuffix: true })}
        </div>
      )}

      {/* Error Summary */}
      {errors && Object.keys(errors).length > 0 && (
        <Alert variant="error" icon={<AlertCircle />} title="Please fix the following errors:">
          <ul className="list-disc list-inside text-sm space-y-1 mt-2">
            {Object.entries(errors).map(([key, error]) => (
              <li key={key}>{error?.message}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form (2 columns on desktop) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Service Details Section */}
          <ServiceFormSection 
            title="Service Details" 
            description="Basic information about the service"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Service Number */}
              {(mode === 'edit' || service?.serviceNumber) && (
                <FormField
                  label="Service Number"
                  helperText="Auto-generated on save"
                >
                  <Input
                    value={service?.serviceNumber || 'Will be generated'}
                    disabled
                    className="font-mono bg-neutral-50"
                  />
                </FormField>
              )}

              {/* Date */}
              <Controller
                control={control}
                name="date"
                render={({ field, fieldState }) => (
                  <FormField
                    label="Date"
                    required
                    error={fieldState.error?.message ?? ""}
                  >
                    <DatePicker
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="DD/MM/YYYY"
                       error={fieldState.error?.message ?? ""}
                    />
                  </FormField>
                )}
              />

              {/* Client */}
              <div className="md:col-span-2">
                <Controller
                  control={control}
                  name="clientId"
                  render={({ field, fieldState }) => (
                    <FormField
                      label="Client"
                      required
                      error={fieldState.error?.message ?? ""}
                    >
                      <ClientSelector
                        clients={clients}
                        value={field.value}
                        onChange={field.onChange}
                        error={fieldState.error?.message ?? ""}
                      />
                    </FormField>
                  )}
                />
              </div>

              {/* Supplier */}
              <div className="md:col-span-2">
                <Controller
                  control={control}
                  name="supplierId"
                  render={({ field, fieldState }) => (
                    <FormField
                      label="Supplier"
                      required
                      error={fieldState.error?.message ?? ""}
                    >
                      <SupplierSelector
                        suppliers={suppliers}
                        value={field.value}
                        onChange={field.onChange}
                        error={fieldState.error?.message ?? ""}
                      />
                    </FormField>
                  )}
                />
              </div>

              {/* Description */}
              <div className="md:col-span-2">
                <Controller
                  control={control}
                  name="description"
                  render={({ field, fieldState }) => (
                    <FormField
                      label="Description"
                      required
                      error={fieldState.error?.message ?? ""}
                    >
                      <Input
                        {...field}
                        placeholder="Service description"
                        error={fieldState.error?.message ?? ""}
                      />
                    </FormField>
                  )}
                />
              </div>

              {/* Reference */}
              <Controller
                control={control}
                name="reference"
                render={({ field, fieldState }) => (
                  <FormField
                    label="Reference"
                    error={fieldState.error?.message ?? ""}
                  >
                    <Input
                      {...field}
                      value={field.value || ''}
                      placeholder="Optional reference"
                      error={fieldState.error?.message ?? ""}
                    />
                  </FormField>
                )}
              />

              {/* Driver */}
              <Controller
                control={control}
                name="driverName"
                render={({ field, fieldState }) => (
                  <FormField
                    label="Driver"
                    error={fieldState.error?.message ?? ""}
                  >
                    <Input
                      {...field}
                      value={field.value || ''}
                      placeholder="Driver name"
                      error={fieldState.error?.message ?? ""}
                    />
                  </FormField>
                )}
              />

              {/* Vehicle Type */}
              <Controller
                control={control}
                name="vehicleType"
                render={({ field, fieldState }) => (
                  <FormField
                    label="Vehicle Type"
                    error={fieldState.error?.message ?? ""}
                  >
                    <Input
                      {...field}
                      value={field.value || ''}
                      placeholder="e.g., Van, Truck"
                      error={fieldState.error?.message ?? ""}
                    />
                  </FormField>
                )}
              />

              {/* Registration */}
              <Controller
                control={control}
                name="vehiclePlate"
                render={({ field, fieldState }) => (
                  <FormField
                    label="Registration"
                    error={fieldState.error?.message ?? ""}
                  >
                    <Input
                      {...field}
                      value={field.value || ''}
                      placeholder="Vehicle registration"
                      className="uppercase"
                      error={fieldState.error?.message ?? ""}
                    />
                  </FormField>
                )}
              />

              {/* Distance */}
              <Controller
                control={control}
                name="distance"
                render={({ field, fieldState }) => (
                  <FormField
                    label="Distance (km)"
                    error={fieldState.error?.message ?? ""}
                  >
                    <Input
                      {...field}
                      type="number"
                      value={field.value || ''}
                      onChange={(e) => field.onChange(Number(e.target.value))}
                      placeholder="0"
                      error={fieldState.error?.message ?? ""}
                    />
                  </FormField>
                )}
              />
            </div>
          </ServiceFormSection>

          {/* Locations Section */}
          <ServiceFormSection 
            title="Locations" 
            description="Loading and unloading information"
          >
            <div className="space-y-4">
              {/* Origin */}
              <Controller
                control={control}
                name="origin"
                render={({ field, fieldState }) => (
                  <FormField
                    label="Origin / Loading Area"
                    required
                    error={fieldState.error?.message ?? ""}
                  >
                    <Textarea
                      {...field}
                      placeholder="Enter loading area details"
                      rows={2}
                      error={fieldState.error?.message ?? ""}
                    />
                  </FormField>
                )}
              />

              {/* Destination */}
              <Controller
                control={control}
                name="destination"
                render={({ field, fieldState }) => (
                  <FormField
                    label="Destination / Unloading Site"
                    required
                    error={fieldState.error?.message ?? ""}
                  >
                    <Textarea
                      {...field}
                      placeholder="Enter unloading site details"
                      rows={2}
                      error={fieldState.error?.message ?? ""}
                    />
                  </FormField>
                )}
              />
            </div>
          </ServiceFormSection>

          {/* Pricing Section */}
          <ServiceFormSection 
            title="Pricing" 
            description="Service costs and pricing"
          >
            <PricingCalculator
              form={form}
              margin={margin}
              marginPercent={marginPercent}
            />
          </ServiceFormSection>

          {/* Additional Information */}
          <ServiceFormSection 
            title="Additional Information" 
            description="Any other relevant details"
          >
            <div className="space-y-4">
              {/* Notes */}
              <Controller
                control={control}
                name="notes"
                render={({ field, fieldState }) => (
                  <FormField
                    label="Notes"
                    error={fieldState.error?.message ?? ""}
                  >
                    <Textarea
                      {...field}
                      value={field.value || ''}
                      placeholder="Public notes (visible to client)"
                      rows={3}
                      error={fieldState.error?.message ?? ""}
                    />
                  </FormField>
                )}
              />

              {/* Internal Notes */}
              <Controller
                control={control}
                name="internalNotes"
                render={({ field, fieldState }) => (
                  <FormField
                    label="Internal Notes"
                    error={fieldState.error?.message ?? ""}
                  >
                    <Textarea
                      {...field}
                      value={field.value || ''}
                      placeholder="Internal notes (not visible to client)"
                      rows={3}
                      error={fieldState.error?.message ?? ""}
                    />
                  </FormField>
                )}
              />
            </div>
          </ServiceFormSection>
        </div>

        {/* Sidebar (1 column on desktop) */}
        <div className="space-y-6">
          {/* Status Section (Edit mode only) */}
          {mode === 'edit' && (
            <Card>
              <CardBody>
                <h3 className="font-medium mb-4">Status</h3>
                <div className="space-y-3">
                  <Controller
                    control={control}
                    name="completed"
                    render={({ field }) => (
                      <Checkbox
                        checked={field.value || false}
                        onCheckedChange={(checked) => {
                          if (checked && !confirm('Mark service as completed? This will move it to archive.')) {
                            return;
                          }
                          field.onChange(checked);
                          if (checked) {
                            setValue('status', 'COMPLETED');
                          }
                        }}
                        label="Service Completed"
                        description="Move to archive"
                      />
                    )}
                  />

                  {hasPermission(userRole, 'services', 'cancel') && (
                    <Controller
                      control={control}
                      name="cancelled"
                      render={({ field }) => (
                        <Checkbox
                          checked={field.value || false}
                          onCheckedChange={(checked) => {
                            if (checked && !confirm('Cancel this service? All prices will be set to €0.')) {
                              return;
                            }
                            if (checked) {
                              setValue('costAmount', 0);
                              setValue('saleAmount', 0);
                              setValue('status', 'CANCELLED');
                            }
                            field.onChange(checked);
                          }}
                          label="Cancelled"
                          description="Set all prices to €0"
                        />
                      )}
                    />
                  )}
                </div>

                {/* Delete Button */}
                {hasPermission(userRole, 'services', 'delete') && (
                  <div className="mt-4 pt-4 border-t">
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      onClick={handleDelete}
                      loading={isDeleting}
                      className="w-full"
                      icon={<Trash2 className="h-4 w-4 mr-2" />}
                    >
                      Delete Service
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          {/* Quick Info */}
          <Card>
            <CardBody>
              <h3 className="font-medium mb-4">Quick Info</h3>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Mode:</dt>
                  <dd className="font-medium capitalize">{mode}</dd>
                </div>
                {mode === 'edit' && service && (
                  <>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Created:</dt>
                      <dd>{format(new Date(service.createdAt), 'dd MMM yyyy')}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Updated:</dt>
                      <dd>{format(new Date(service.updatedAt), 'dd MMM yyyy')}</dd>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-center pt-2 border-t">
                  <dt className="text-muted-foreground">Margin:</dt>
                  <dd className={cn(
                    "font-semibold",
                    margin >= 0 ? "text-green-600" : "text-red-600"
                  )}>
                    €{margin.toFixed(2)} ({marginPercent.toFixed(1)}%)
                  </dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {/* Keyboard Shortcuts */}
          <Card>
            <CardBody>
              <h3 className="font-medium mb-4">Keyboard Shortcuts</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <kbd className="px-2 py-1 bg-neutral-100 rounded text-xs">Ctrl+S</kbd>
                  <span className="text-muted-foreground">Save</span>
                </div>
                <div className="flex justify-between">
                  <kbd className="px-2 py-1 bg-neutral-100 rounded text-xs">Esc</kbd>
                  <span className="text-muted-foreground">Cancel</span>
                </div>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            if (isDirty && !confirm('You have unsaved changes. Discard them?')) {
              return;
            }
            router.back();
          }}
        >
          Cancel
        </Button>

        <div className="flex gap-3 w-full sm:w-auto">
          {mode === 'create' && (
            <Button
              type="submit"
              variant="secondary"
              onClick={() => setSaveAndNew(true)}
              loading={isSaving && saveAndNew}
              disabled={isSaving && !saveAndNew}
              className="flex-1 sm:flex-none"
            >
              Save & New
            </Button>
          )}
          
          <Button
            type="submit"
            loading={isSaving && !saveAndNew}
            disabled={isSaving && saveAndNew}
            className="flex-1 sm:flex-none"
            icon={<Save className="h-4 w-4 mr-2" />}
          >
            {mode === 'edit' ? 'Update Service' : 'Create Service'}
          </Button>
        </div>
      </div>

      {/* Mobile Fixed Save Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t sm:hidden z-50">
        <Button
          type="submit"
          loading={isSaving}
          className="w-full"
        >
          <Save className="h-4 w-4 mr-2" />
          {mode === 'edit' ? 'Update' : 'Create'}
        </Button>
      </div>
    </form>
  );
}