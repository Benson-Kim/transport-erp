'use client';

import { useState } from 'react';

import { Lock, Mail } from 'lucide-react';
import { Controller, useFormContext } from 'react-hook-form';

import { Alert, FormField, Input } from '@/components/ui';
import { type SystemSettings } from '@/lib/validations/settings-schema';

/**
 * Email configuration (#40): Resend is the ONE provider - these settings are
 * the config production sends read (DB over env), so the test button and
 * real sends can no longer diverge. The API key is write-only (#19): it is
 * never sent back to the client, blank means "keep the stored key", and the
 * explicit remove control falls back to the RESEND_API_KEY environment
 * variable.
 */
export default function EmailConfiguration() {
  const {
    control,
    watch,
    formState: { errors },
  } = useFormContext<SystemSettings>();
  const [showKey, setShowKey] = useState(false);
  const clearApiKey = watch('email.clearApiKey');

  return (
    <div className="space-y-6">
      <Alert variant="info">
        <Mail className="h-4 w-4" />
        <span className="text-sm">
          Emails are delivered through Resend. The key stored here overrides the RESEND_API_KEY
          environment variable and is the configuration real sends use - the test button exercises
          the same path.
        </span>
      </Alert>

      {/* Resend API key (write-only) */}
      <div className="border-t pt-6">
        <h4 className="text-sm font-semibold text-neutral-700 mb-4">Resend Configuration</h4>
        <Controller
          control={control}
          name="email.apiKey"
          render={({ field }) => (
            <FormField
              label="API Key"
              error={errors.email?.apiKey?.message ?? ''}
              helperText="Found in your Resend dashboard. Leave blank to keep the stored key."
            >
              <div className="relative">
                <Input
                  {...field}
                  type={showKey ? 'text' : 'password'}
                  placeholder="•••• (unchanged)"
                  autoComplete="off"
                  disabled={clearApiKey ?? false}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <Lock className="h-4 w-4" />
                </button>
              </div>
            </FormField>
          )}
        />

        <Controller
          control={control}
          name="email.clearApiKey"
          render={({ field }) => (
            <label className="mt-4 flex items-center gap-3">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={field.value ?? false}
                onChange={(e) => field.onChange(e.target.checked)}
              />
              <span className="text-sm text-neutral-700">
                Remove the stored API key on save (sends fall back to the RESEND_API_KEY
                environment variable)
              </span>
            </label>
          )}
        />
      </div>

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
