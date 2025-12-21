// /components/features/settings/CompanyForm.tsx
'use client';

import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Building2, Mail, Phone, Globe, CreditCard, Upload, X, Save } from 'lucide-react';
import Image from 'next/image';
import { companySettingsSchema, type CompanySettings } from '@/lib/validations/settings-schema';
import { updateCompanySettings } from '@/actions/settings-actions';
import { Button, Card, FormField, Input, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils/cn';
import { toast } from '@/lib/toast';

interface CompanyFormProps {
  initialData: CompanySettings | null;
  canEdit: boolean;
}

/**
 * Company settings form
 * Handles logo upload and company information
 */
export function CompanyForm({ initialData, canEdit }: CompanyFormProps) {
  const [logoPreview, setLogoPreview] = useState<string | null>(initialData?.logo || null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    setValue,
  } = useForm<CompanySettings>({
    resolver: zodResolver(companySettingsSchema),
    defaultValues: initialData || {
      companyName: '',
      address: '',
      vatNumber: '',
      email: '',
      phone: '',
      website: '',
      bankAccount: '',
      bankDetails: '',
    },
  });

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('File too large', 'Logo must be less than 2MB');
      return;
    }

    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type)) {
      toast.error('Invalid file type', 'Logo must be PNG, JPG, or WebP');
      return;
    }

    setIsUploadingLogo(true);

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setLogoPreview(result);
      setValue('logo', result, { shouldDirty: true });
      setIsUploadingLogo(false);
    };
    reader.onerror = () => {
      toast.error('Upload failed', 'Failed to read the image file');
      setIsUploadingLogo(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setLogoPreview(null);
    setValue('logo', undefined, { shouldDirty: true });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const onSubmit = async (data: CompanySettings) => {
    if (!canEdit) return;

    setIsSubmitting(true);
    try {
      const result = await updateCompanySettings(data);

      if (result.success) {
        toast.success('Settings saved', 'Company information has been updated successfully');
        router.refresh();
      } else {
        throw new Error(result.error || 'Failed to save settings');
      }
    } catch (error) {
      toast.error('Error', error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <Card.Header
          title="Company Logo"
          subtitle="Upload your company logo for documents and branding"
        />
        <Card.Body>
          <div className="flex items-start gap-6">
            <div className="flex-shrink-0">
              {logoPreview ? (
                <div className="relative group">
                  <div className="relative w-32 h-32 rounded-lg overflow-hidden border-2 border-neutral-200">
                    <Image src={logoPreview} alt="Company logo" fill className="object-contain" />
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className={cn(
                        'absolute -top-2 -right-2 p-1.5 bg-white rounded-full',
                        'shadow-lg hover:shadow-xl transition-all',
                        'opacity-0 group-hover:opacity-100'
                      )}
                      aria-label="Remove logo"
                    >
                      <X className="h-4 w-4 text-danger" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="w-32 h-32 bg-neutral-50 rounded-lg flex flex-col items-center justify-center border-2 border-dashed border-neutral-300">
                  <Building2 className="h-8 w-8 text-neutral-400 mb-2" />
                  <span className="text-xs text-neutral-500">No logo</span>
                </div>
              )}
            </div>

            {canEdit && (
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={handleLogoChange}
                  className="hidden"
                  id="logo-upload"
                  disabled={isUploadingLogo}
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingLogo}
                  loading={isUploadingLogo}
                  loadingText="Uploading..."
                  icon={<Upload className="icon-sm" />}
                >
                  Upload Logo
                </Button>
                <p className="text-xs text-neutral-500 mt-2">
                  PNG, JPG or WebP, max 2MB. Recommended size: 200x200px
                </p>
              </div>
            )}
          </div>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header title="Company Details" subtitle=" Basic information about your company" />
        <Card.Body>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField label="Company Name" required error={errors.companyName?.message ?? ''}>
              <Input
                {...register('companyName')}
                placeholder="Acme Transport Ltd"
                disabled={!canEdit}
                prefix={<Building2 className="h-4 w-4" />}
              />
            </FormField>

            <FormField
              label="VAT Number"
              required
              error={errors.vatNumber?.message ?? ''}
              helperText="Format: ES12345678A"
            >
              <Input
                {...register('vatNumber')}
                placeholder="ES12345678A"
                disabled={!canEdit}
                className="font-mono uppercase"
              />
            </FormField>

            <FormField label="Email" required error={errors.email?.message ?? ''}>
              <Input
                {...register('email')}
                type="email"
                placeholder="contact@company.com"
                disabled={!canEdit}
                prefix={<Mail className="h-4 w-4" />}
              />
            </FormField>

            <FormField label="Phone" required error={errors.phone?.message ?? ''}>
              <Input
                {...register('phone')}
                type="tel"
                placeholder="+34 900 123 456"
                disabled={!canEdit}
                prefix={<Phone className="h-4 w-4" />}
              />
            </FormField>

            <FormField label="Website" error={errors.website?.message ?? ''} helperText="Optional">
              <Input
                {...register('website')}
                type="url"
                placeholder="https://www.company.com"
                disabled={!canEdit}
                prefix={<Globe className="h-4 w-4" />}
              />
            </FormField>

            <FormField
              label="IBAN"
              error={errors.bankAccount?.message ?? ''}
              helperText="International Bank Account Number"
            >
              <Input
                {...register('bankAccount')}
                placeholder="ES91 2100 0418 4502 0005 1332"
                disabled={!canEdit}
                prefix={<CreditCard className="h-4 w-4" />}
                className="font-mono uppercase"
              />
            </FormField>
          </div>

          <div className="mt-6 space-y-6">
            <FormField
              label="Address"
              required
              error={errors.address?.message ?? ''}
              helperText="Full company address including street, city, postal code"
            >
              <Textarea
                {...register('address')}
                placeholder="123 Main Street&#10;Barcelona, 08001&#10;Spain"
                rows={3}
                disabled={!canEdit}
                autoResize
                maxRows={5}
              />
            </FormField>

            <FormField
              label="Bank Details"
              error={errors.bankDetails?.message ?? ''}
              helperText="Additional banking information (SWIFT, account name, etc.)"
            >
              <Textarea
                {...register('bankDetails')}
                placeholder="Bank Name: Example Bank&#10;SWIFT: EXAMPLEXX&#10;Account Name: Company Ltd"
                rows={3}
                disabled={!canEdit}
                autoResize
                maxRows={5}
              />
            </FormField>
          </div>
        </Card.Body>
      </Card>

      {canEdit && (
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={isSubmitting}
            disabled={!isDirty}
            icon={<Save className="h-4 w-4" />}
          >
            Save Changes
          </Button>
        </div>
      )}
    </form>
  );
}
