'use client';

import { useState } from 'react';
import { Controller, useFormContext } from 'react-hook-form';
import { Lock, Server, Mail } from 'lucide-react';

import { Option } from '@/types/ui';
import { type EmailProvider } from '@/types/settings';
import { type SystemSettings } from '@/lib/validations/settings-schema';
import { Alert, FormField, Input, Label, Select, Switch } from '@/components/ui';

/**
 * Email configuration section with provider-specific fields
 */
export default function EmailConfiguration() {
  const {
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<SystemSettings>();
  const provider = watch('email.provider') as EmailProvider;
  const emailSecure = watch('email.secure');
  const [showPassword, setShowPassword] = useState(false);

  const providerOptions: Option[] = [
    { value: 'resend', label: 'Resend (Recommended)' },
    { value: 'sendgrid', label: 'SendGrid' },
    { value: 'ses', label: 'Amazon SES' },
    { value: 'smtp', label: 'Custom SMTP Server' },
  ];

  // Provider-specific configuration
  const providerConfig: Record<
    EmailProvider,
    {
      fields: React.ReactNode;
      helpText: string;
      icon: React.ElementType;
    }
  > = {
    resend: {
      icon: Mail,
      helpText: 'Resend is a modern email API designed for developers',
      fields: (
        <Controller
          control={control}
          name="email.apiKey"
          render={({ field }) => (
            <FormField
              label="API Key"
              error={errors.email?.apiKey?.message ?? ''}
              required
              helperText="Found in your Resend dashboard"
            >
              <div className="relative">
                <Input
                  {...field}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="re_..."
                  autoComplete="off"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <Lock className="h-4 w-4" />
                </button>
              </div>
            </FormField>
          )}
        />
      ),
    },
    sendgrid: {
      icon: Mail,
      helpText: 'SendGrid provides reliable email delivery at scale',
      fields: (
        <Controller
          control={control}
          name="email.apiKey"
          render={({ field }) => (
            <FormField
              label="API Key"
              error={errors.email?.apiKey?.message ?? ''}
              required
              helperText="Create an API key in SendGrid settings"
            >
              <div className="relative">
                <Input
                  {...field}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="SG...."
                  autoComplete="off"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <Lock className="h-4 w-4" />
                </button>
              </div>
            </FormField>
          )}
        />
      ),
    },
    ses: {
      icon: Server,
      helpText: 'Amazon SES offers cost-effective email sending',
      fields: (
        <Controller
          control={control}
          name="email.apiKey"
          render={({ field }) => (
            <FormField
                    label="AWS SES Credentials (JSON)"
                    error={errors.email?.apiKey?.message ?? ''}
                    required
                    helperText='Format: {"accessKeyId": "AKIA...", "secretAccessKey": "...", "region": "us-east-1"}'
            >
              <div className="relative">
                <Input
                  {...field}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="AKIA..."
                  autoComplete="off"
                  className="pr-10 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <Lock className="h-4 w-4" />
                </button>
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                 Note: Credentials will be stored securely. Ensure your IAM user has SES send permissions.
              </p>
            </FormField>
          )}
        />
      ),
    },
    smtp: {
      icon: Server,
      helpText: 'Configure any SMTP server for email delivery',
      fields: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Controller
              control={control}
              name="email.host"
              render={({ field }) => (
                <FormField
                  label="SMTP Host"
                  error={errors.email?.host?.message ?? ''}
                  required
                  helperText="e.g., smtp.gmail.com"
                >
                  <Input {...field} placeholder="smtp.example.com" />
                </FormField>
              )}
            />
            <Controller
              control={control}
              name="email.port"
              render={({ field }) => (
                <FormField
                  label="Port"
                  error={errors.email?.port?.message ?? ''}
                  required
                  helperText="Usually 587 for TLS or 465 for SSL"
                >
                  <Input
                    {...field}
                    type="number"
                    placeholder="587"
                    min="1"
                    max="65535"
                    onChange={(e) => field.onChange(Number(e.target.value))}
                  />
                </FormField>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Controller
              control={control}
              name="email.user"
              render={({ field }) => (
                <FormField
                  label="Username"
                  error={errors.email?.user?.message ?? ''}
                  required
                  helperText="SMTP authentication username"
                >
                  <Input {...field} placeholder="user@example.com" autoComplete="username" />
                </FormField>
              )}
            />

            <Controller
              control={control}
              name="email.password"
              render={({ field }) => (
                <FormField
                  label="Password"
                  error={errors.email?.password?.message ?? ''}
                  required
                  helperText="SMTP authentication password"
                >
                  <div className="relative">
                    <Input
                      {...field}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                    >
                      <Lock className="h-4 w-4" />
                    </button>
                  </div>
                </FormField>
              )}
            />
          </div>
          <Controller
            control={control}
            name="email.secure"
            render={({ field }) => (
              <FormField
                label="Connection Security"
                className="mb-4"
                helperText="Use SSL/TLS encryption for secure email transmission" // ✅ Correct
              >
                <Label htmlFor="emailSecure">Enable SSL/TLS (Recommended)</Label>
                <Switch
                  {...field}
                  id="emailSecure"
                  checked={emailSecure ?? false}
                  onCheckedChange={(checked) => setValue('email.secure', checked)}
                />
                <span className="text-sm text-neutral-700">
                  Use SSL/TLS encryption (recommended for ports 465 and 587)
                </span>
              </FormField>
            )}
          />
        </div>
      ),
    },
  };

  const config = providerConfig[provider];
  const Icon = config?.icon || Mail;

  return (
    <div className="space-y-6">
      {/* Provider Selection */}
      <div>
        <Controller
          control={control}
          name="email.provider"
          render={({ field }) => (
            <FormField
              label="Email Provider"
              error={errors.email?.provider?.message ?? ''}
              required
              helperText="Select your email service provider"
            >
              <Select {...field} className="w-full" size="md" options={providerOptions} />
            </FormField>
          )}
        />

        {config && (
          <Alert variant="info" className="mt-3">
            <Icon className="h-4 w-4" />
            <span className="text-sm">{config.helpText}</span>
          </Alert>
        )}
      </div>

      {/* Provider-specific fields */}
      {config?.fields && (
        <div className="border-t pt-6">
          <h4 className="text-sm font-semibold text-neutral-700 mb-4">
            {provider.toUpperCase()} Configuration
          </h4>
          {config.fields}
        </div>
      )}

      {/* Common sender fields */}
      <div className="border-t pt-6">
        <h4 className="text-sm font-semibold text-neutral-700 mb-4">Sender Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Controller
            control={control}
            name="email.fromName"
            render={({ field }) => (
              <FormField
                label="From Name"
                error={errors.email?.fromName?.message ?? ''}
                required
                helperText="Display name for sent emails"
              >
                <Input {...field} placeholder="Acme Transport" />
              </FormField>
            )}
          />

          <Controller
            control={control}
            name="email.fromEmail"
            render={({ field }) => (
              <FormField
                label="From Email"
                error={errors.email?.fromEmail?.message ?? ''}
                required
                helperText="Sender email address"
              >
                <Input {...field} type="email" placeholder="noreply@acme.com" />
              </FormField>
            )}
          />
        </div>
      </div>

      {/* Test email preview */}
      <div className="border-t pt-6">
        <h4 className="text-sm font-semibold text-neutral-700 mb-3">Test Email Preview</h4>
        <div className="bg-neutral-50 rounded-lg p-4 space-y-2 text-sm">
          <div>
            <span className="text-neutral-500">From:</span>{' '}
            <span className="font-medium">
              {watch('email.fromName') || '[From Name]'} &lt;{watch('email.fromEmail') || '[email]'}
              &gt;
            </span>
          </div>
          <div>
            <span className="text-neutral-500">Subject:</span>{' '}
            <span className="font-medium">Test Email from System Settings</span>
          </div>
          <div>
            <span className="text-neutral-500">Body:</span>{' '}
            <span className="font-medium">
              This is a test email to verify your email configuration is working correctly.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
