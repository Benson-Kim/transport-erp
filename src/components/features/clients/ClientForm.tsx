// /components/features/clients/ClientForm.tsx
'use client';

/**
 * Client Form Component
 * Create and edit client information
 */

import { useState, useTransition, useEffect } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Save, X, Building2, MapPin, CreditCard, Settings, AlertCircle, Check } from 'lucide-react';
import { useForm, Controller, FormProvider, useWatch } from 'react-hook-form';

import { createClient, updateClient } from '@/actions/client-actions';
import {
  Alert,
  Button,
  Card,
  FormField,
  Input,
  Label,
  Modal,
  Select,
  Skeleton,
  SkeletonGroup,
  Switch,
  Tabs,
} from '@/components/ui';
import { clientSchema, type ClientInput } from '@/lib/validations/client-schema';
import type { ClientWithRelations, Address } from '@/types/client';

interface ClientFormProps {
  client?: ClientWithRelations;
  mode: 'create' | 'edit';
}

const CURRENCIES = [
  { value: 'EUR', label: 'Euro (€)' },
  { value: 'USD', label: 'US Dollar ($)' },
  { value: 'GBP', label: 'British Pound (£)' },
];

const LANGUAGES = [
  { value: 'es', label: 'Spanish' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
];

const COUNTRIES = [
  'Spain',
  'France',
  'Germany',
  'Italy',
  'Portugal',
  'United Kingdom',
  'Netherlands',
  'Belgium',
  'Poland',
  'Austria',
];

/**
 * Client Form Loading Skeleton
 */

const FORM_SECTION_IDS = [
  'section-basic',
  'section-contact',
  'section-address',
  'section-financial',
  'section-settings',
] as const;

const SECTION_CONFIG: Record<
  string,
  { icon: boolean; title: string; fields: number; columns: 1 | 2 }
> = {
  'section-basic': { icon: true, title: 'Basic Information', fields: 4, columns: 2 },
  'section-contact': { icon: true, title: 'Contact Information', fields: 5, columns: 2 },
  'section-address': { icon: true, title: 'Billing Address', fields: 6, columns: 2 },
  'section-financial': { icon: true, title: 'Financial Settings', fields: 4, columns: 2 },
  'section-settings': { icon: true, title: 'Settings', fields: 4, columns: 2 },
};

export function ClientFormSkeleton() {
  return (
    <div className="space-y-8 max-w-4xl" aria-busy="true" aria-label="Loading form" role="status">
      {FORM_SECTION_IDS.map((sectionId) => {
        const config = SECTION_CONFIG[sectionId];
        return (
          <FormSectionSkeleton
            key={sectionId}
            fieldCount={config.fields}
            columns={config.columns}
          />
        );
      })}

      {/* Form Actions */}
      <div className="flex items-center justify-end gap-4 pt-4">
        <Skeleton className="h-10 w-24 rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
    </div>
  );
}

/**
 * Form section skeleton with configurable field count
 */
function FormSectionSkeleton({ fieldCount, columns }: { fieldCount: number; columns: 1 | 2 }) {
  // Generate stable field IDs based on section
  const fieldIds = Array.from({ length: fieldCount }, (_, i) => `field-${i + 1}`);

  return (
    <div className="card p-6">
      {/* Section Header */}
      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="w-5 h-5 rounded" />
        <Skeleton className="h-6 w-40" />
      </div>

      {/* Form Fields */}
      <div className={`grid grid-cols-1 ${columns === 2 ? 'md:grid-cols-2' : ''} gap-6`}>
        {fieldIds.map((fieldId) => (
          <FormFieldSkeleton key={fieldId} />
        ))}
      </div>
    </div>
  );
}

/**
 * Individual form field skeleton
 */
function FormFieldSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-24" variant="text" />
      <Skeleton className="h-10 w-full rounded-md" />
    </div>
  );
}

export function ClientForm({ client, mode }: ClientFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Parse existing addresses
  const billingAddr = client?.billingAddress as Address | undefined;
  const shippingAddr = client?.shippingAddress as Address | undefined;

  const methods = useForm<ClientInput>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: client?.name ?? '',
      tradeName: client?.tradeName ?? '',
      vatNumber: client?.vatNumber ?? '',
      billingAddress: billingAddr ?? {
        line1: '',
        line2: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'Spain',
      },
      useShippingAddress: !!shippingAddr,
      shippingAddress: shippingAddr ?? {
        line1: '',
        line2: '',
        city: '',
        state: '',
        postalCode: '',
        country: 'Spain',
      },
      billingEmail: client?.billingEmail ?? '',
      trafficEmail: client?.trafficEmail ?? '',
      contactPerson: client?.contactPerson ?? '',
      contactPhone: client?.contactPhone ?? '',
      contactMobile: client?.contactMobile ?? '',
      creditLimit: client?.creditLimit ? Number(client.creditLimit) : undefined,
      paymentTerms: client?.paymentTerms ?? 30,
      discount: client?.discount ? Number(client.discount) : undefined,
      currency: client?.currency ?? 'EUR',
      language: client?.language ?? 'es',
      sendReminders: client?.sendReminders ?? true,
      autoInvoice: client?.autoInvoice ?? false,
      notes: client?.notes ?? '',
      tags: client?.tags ?? [],
      isActive: client?.isActive ?? true,
    },
  });

  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = methods;

  const useShippingAddress = useWatch({
    control,
    name: 'useShippingAddress',
    defaultValue: false,
  });

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const onSubmit = (data: ClientInput) => {
    setFeedback(null);
    startTransition(async () => {
      const result =
        mode === 'create' ? await createClient(data) : await updateClient(client!.id, data);

      if (result.success) {
        if (mode === 'create' && result.data?.id) {
          router.push(`/clients/${result.data.id}`);
        } else {
          setFeedback({ type: 'success', message: 'Client saved successfully' });
          router.refresh();
        }
      } else {
        setFeedback({
          type: 'error',
          message: result.error ?? 'Failed to save client',
        });
      }
    });
  };

  const handleCancel = () => {
    if (isDirty) {
      setShowCancelModal(true);
    } else {
      router.back();
    }
  };

  const tabContent = [
    {
      id: 'basic',
      label: 'Basic Info',
      icon: <Building2 className="w-4 h-4" />,
      content: (
        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <Card.Header title="Basic Information" />
            <Card.Body>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <FormField label="Company Name" required error={errors.name?.message ?? ''}>
                      <Input
                        {...field}
                        placeholder="Acme Corporation"
                        status={errors.name ? 'error' : 'default'}
                      />
                    </FormField>
                  )}
                />

                <Controller
                  name="tradeName"
                  control={control}
                  render={({ field }) => (
                    <FormField label="Trade Name" error={errors.tradeName?.message ?? ''}>
                      <Input {...field} placeholder="Acme" />
                    </FormField>
                  )}
                />

                <Controller
                  name="vatNumber"
                  control={control}
                  render={({ field }) => (
                    <FormField label="VAT Number" error={errors.vatNumber?.message ?? ''}>
                      <Input {...field} placeholder="ES12345678A" className="font-mono" />
                    </FormField>
                  )}
                />

                <div className="flex items-center gap-4 pt-6">
                  <Controller
                    name="isActive"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center gap-2">
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                        <Label>Active Client</Label>
                      </div>
                    )}
                  />
                </div>
              </div>
            </Card.Body>
          </Card>

          {/* Contact Information */}
          <Card>
            <Card.Header title="Contact Information" />
            <Card.Body>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Controller
                  name="billingEmail"
                  control={control}
                  render={({ field }) => (
                    <FormField
                      label="Billing Email"
                      required
                      error={errors.billingEmail?.message ?? ''}
                    >
                      <Input
                        {...field}
                        type="email"
                        placeholder="billing@example.com"
                        status={errors.billingEmail ? 'error' : 'default'}
                      />
                    </FormField>
                  )}
                />

                <Controller
                  name="trafficEmail"
                  control={control}
                  render={({ field }) => (
                    <FormField label="Traffic Email" error={errors.trafficEmail?.message ?? ''}>
                      <Input
                        {...field}
                        type="email"
                        placeholder="traffic@example.com"
                        status={errors.trafficEmail ? 'error' : 'default'}
                      />
                    </FormField>
                  )}
                />

                <Controller
                  name="contactPerson"
                  control={control}
                  render={({ field }) => (
                    <FormField label="Contact Person" error={errors.contactPerson?.message ?? ''}>
                      <Input {...field} placeholder="John Smith" />
                    </FormField>
                  )}
                />

                <Controller
                  name="contactPhone"
                  control={control}
                  render={({ field }) => (
                    <FormField label="Phone" error={errors.contactPhone?.message ?? ''}>
                      <Input {...field} type="tel" placeholder="+34 912 345 678" />
                    </FormField>
                  )}
                />

                <Controller
                  name="contactMobile"
                  control={control}
                  render={({ field }) => (
                    <FormField label="Mobile" error={errors.contactMobile?.message ?? ''}>
                      <Input {...field} type="tel" placeholder="+34 612 345 678" />
                    </FormField>
                  )}
                />
              </div>
            </Card.Body>
          </Card>
        </div>
      ),
    },
    {
      id: 'addresses',
      label: 'Addresses',
      icon: <MapPin className="w-4 h-4" />,
      content: (
        <div className="space-y-6">
          {/* Billing Address */}
          <Card>
            <Card.Header title="Billing Address" />
            <Card.Body>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <Controller
                    name="billingAddress.line1"
                    control={control}
                    render={({ field }) => (
                      <FormField
                        label="Address Line 1"
                        required
                        error={errors.billingAddress?.line1?.message ?? ''}
                      >
                        <Input
                          {...field}
                          placeholder="123 Main Street"
                          status={errors.billingAddress?.line1 ? 'error' : 'default'}
                        />
                      </FormField>
                    )}
                  />
                </div>

                <div className="md:col-span-2">
                  <Controller
                    name="billingAddress.line2"
                    control={control}
                    render={({ field }) => (
                      <FormField
                        label="Address Line 2"
                        error={errors.billingAddress?.line2?.message ?? ''}
                      >
                        <Input {...field} placeholder="Suite 100" />
                      </FormField>
                    )}
                  />
                </div>

                <Controller
                  name="billingAddress.city"
                  control={control}
                  render={({ field }) => (
                    <FormField
                      label="City"
                      required
                      error={errors.billingAddress?.city?.message ?? ''}
                    >
                      <Input
                        {...field}
                        placeholder="Madrid"
                        status={errors.billingAddress?.city ? 'error' : 'default'}
                      />
                    </FormField>
                  )}
                />

                <Controller
                  name="billingAddress.state"
                  control={control}
                  render={({ field }) => (
                    <FormField
                      label="State/Province"
                      error={errors.billingAddress?.state?.message ?? ''}
                    >
                      <Input {...field} placeholder="Madrid" />
                    </FormField>
                  )}
                />

                <Controller
                  name="billingAddress.postalCode"
                  control={control}
                  render={({ field }) => (
                    <FormField
                      label="Postal Code"
                      required
                      error={errors.billingAddress?.postalCode?.message ?? ''}
                    >
                      <Input
                        {...field}
                        placeholder="28001"
                        status={errors.billingAddress?.postalCode ? 'error' : 'default'}
                      />
                    </FormField>
                  )}
                />

                <Controller
                  name="billingAddress.country"
                  control={control}
                  render={({ field }) => (
                    <FormField
                      label="Country"
                      required
                      error={errors.billingAddress?.country?.message ?? ''}
                    >
                      <Select
                        {...field}
                        options={COUNTRIES.map((country) => ({
                          value: country,
                          label: country,
                        }))}
                      />
                    </FormField>
                  )}
                />
              </div>
            </Card.Body>
          </Card>

          {/* Shipping Address */}
          <Card>
            <Card.Header title="Shipping Address" />
            <Card.Body>
              <div className="mb-4">
                <Controller
                  name="useShippingAddress"
                  control={control}
                  render={({ field }) => (
                    <div className="flex items-center gap-2">
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                      <Label>Use different shipping address</Label>
                    </div>
                  )}
                />
              </div>

              {useShippingAddress && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <Controller
                      name="shippingAddress.line1"
                      control={control}
                      render={({ field }) => (
                        <FormField
                          label="Address Line 1"
                          required
                          error={errors.shippingAddress?.line1?.message ?? ''}
                        >
                          <Input {...field} placeholder="123 Main Street" />
                        </FormField>
                      )}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <Controller
                      name="shippingAddress.line2"
                      control={control}
                      render={({ field }) => (
                        <FormField
                          label="Address Line 2"
                          error={errors.shippingAddress?.line2?.message ?? ''}
                        >
                          <Input {...field} placeholder="Suite 100" />
                        </FormField>
                      )}
                    />
                  </div>

                  <Controller
                    name="shippingAddress.city"
                    control={control}
                    render={({ field }) => (
                      <FormField
                        label="City"
                        required
                        error={errors.shippingAddress?.city?.message ?? ''}
                      >
                        <Input {...field} placeholder="Madrid" />
                      </FormField>
                    )}
                  />

                  <Controller
                    name="shippingAddress.state"
                    control={control}
                    render={({ field }) => (
                      <FormField
                        label="State/Province"
                        error={errors.shippingAddress?.state?.message ?? ''}
                      >
                        <Input {...field} placeholder="Madrid" />
                      </FormField>
                    )}
                  />

                  <Controller
                    name="shippingAddress.postalCode"
                    control={control}
                    render={({ field }) => (
                      <FormField
                        label="Postal Code"
                        required
                        error={errors.shippingAddress?.postalCode?.message ?? ''}
                      >
                        <Input {...field} placeholder="28001" />
                      </FormField>
                    )}
                  />

                  <Controller
                    name="shippingAddress.country"
                    control={control}
                    render={({ field }) => (
                      <FormField
                        label="Country"
                        required
                        error={errors.shippingAddress?.country?.message ?? ''}
                      >
                        <Select
                          {...field}
                          options={COUNTRIES.map((country) => ({
                            value: country,
                            label: country,
                          }))}
                        />
                      </FormField>
                    )}
                  />
                </div>
              )}
            </Card.Body>
          </Card>
        </div>
      ),
    },
    {
      id: 'financial',
      label: 'Financial',
      icon: <CreditCard className="w-4 h-4" />,
      content: (
        <Card>
          <Card.Header title="Financial Settings" />
          <Card.Body>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Controller
                name="currency"
                control={control}
                render={({ field }) => (
                  <FormField label="Currency" required error={errors.currency?.message ?? ''}>
                    <Select {...field} options={CURRENCIES} />
                  </FormField>
                )}
              />

              <Controller
                name="paymentTerms"
                control={control}
                render={({ field }) => (
                  <FormField
                    label="Payment Terms (days)"
                    error={errors.paymentTerms?.message ?? ''}
                  >
                    <Input
                      {...field}
                      type="number"
                      min="0"
                      max="365"
                      placeholder="30"
                      status={errors.paymentTerms ? 'error' : 'default'}
                    />
                  </FormField>
                )}
              />

              <Controller
                name="creditLimit"
                control={control}
                render={({ field }) => (
                  <FormField label="Credit Limit" error={errors.creditLimit?.message ?? ''}>
                    <Input {...field} type="number" min="0" step="0.01" placeholder="10000.00" />
                  </FormField>
                )}
              />

              <Controller
                name="discount"
                control={control}
                render={({ field }) => (
                  <FormField label="Discount (%)" error={errors.discount?.message ?? ''}>
                    <Input {...field} type="number" min="0" max="100" step="0.01" placeholder="0" />
                  </FormField>
                )}
              />
            </div>
          </Card.Body>
        </Card>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-4 h-4" />,
      content: (
        <div className="space-y-6">
          <Card>
            <Card.Header title="Preferences" />
            <Card.Body>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Controller
                  name="language"
                  control={control}
                  render={({ field }) => (
                    <FormField label="Language" error={errors.language?.message ?? ''}>
                      <Select {...field} options={LANGUAGES} />
                    </FormField>
                  )}
                />

                <div className="flex flex-col gap-4">
                  <Controller
                    name="sendReminders"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center gap-2">
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                        <Label>Send payment reminders</Label>
                      </div>
                    )}
                  />

                  <Controller
                    name="autoInvoice"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center gap-2">
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                        <Label>Auto-generate invoices</Label>
                      </div>
                    )}
                  />
                </div>

                <div className="md:col-span-2">
                  <Controller
                    name="notes"
                    control={control}
                    render={({ field }) => (
                      <FormField
                        label="Notes"
                        error={errors.notes?.message ?? ''}
                        helperText="Internal notes about this client"
                      >
                        <textarea
                          {...field}
                          rows={4}
                          className="input resize-none"
                          placeholder="Internal notes about this client..."
                        />
                      </FormField>
                    )}
                  />
                </div>
              </div>
            </Card.Body>
          </Card>
        </div>
      ),
    },
  ];

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-4xl">
        {feedback && (
          <Alert variant={feedback.type} dismissible onDismiss={() => setFeedback(null)}>
            {feedback.message}
          </Alert>
        )}

        {/* Tabbed Content */}
        <Tabs tabs={tabContent} defaultTab="basic" variant="line" />

        {/* Form Actions */}
        <div className="flex items-center justify-end gap-4 pt-4 sticky bottom-0 bg-white p-4 border-t">
          <Button
            type="button"
            onClick={handleCancel}
            disabled={isPending}
            variant="secondary"
            icon={<X className="w-4 h-4" />}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isPending}
            variant="primary"
            loading={isPending}
            loadingText="Saving..."
            icon={!isPending ? <Save className="w-4 h-4" /> : undefined}
          >
            {mode === 'create' ? 'Create Client' : 'Save Changes'}
          </Button>
        </div>
      </form>
      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Unsaved Changes"
        description="You have unsaved changes. Are you sure you want to leave?"
        size="sm"
      >
        <Modal.Body>
          <Alert variant="warning" className="text-neutral-600">
            Your changes will be lost if you leave without saving.
          </Alert>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCancelModal(false)}>
            Continue Editing
          </Button>
          <Button variant="danger" onClick={() => router.back()}>
            Leave Without Saving
          </Button>
        </Modal.Footer>
      </Modal>
    </FormProvider>
  );
}
