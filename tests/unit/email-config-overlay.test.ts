/**
 * #40 - effective email config: the DB SettingKey.EMAIL record overlays the
 * env baseline; invalid or legacy (pre-#40 multi-provider) rows leave the
 * baseline untouched so a bad row can never take email down.
 */
import { describe, expect, it, jest } from '@jest/globals';

import { overlayStoredEmailConfig } from '@/lib/email/config';

import type { EmailConfig } from '@/types/mail';

jest.mock('@/lib/prisma/prisma', () => ({
  __esModule: true,
  default: {},
}));

function baseConfig(): EmailConfig {
  return {
    environment: 'production',
    resendApiKey: 'env-key',
    from: { email: 'env@example.test', name: 'Env Sender' },
    replyTo: 'support@example.test',
    baseUrl: 'https://erp.example.test',
    company: {
      name: 'Transport ERP',
      address: 'Calle Mayor 1, Madrid',
      supportEmail: 'support@example.test',
      billingEmail: 'billing@example.test',
    },
    sending: { enabled: true, maxRetries: 3, retryDelay: 5000, batchSize: 100 },
    queue: { enabled: true },
    logging: { enabled: false, debug: false },
    restrictions: {},
  };
}

describe('overlayStoredEmailConfig (#40)', () => {
  it('stored key and sender override the env baseline', () => {
    const result = overlayStoredEmailConfig(baseConfig(), {
      provider: 'resend',
      apiKey: 'db-key',
      fromName: 'Settings Sender',
      fromEmail: 'settings@example.test',
    });

    expect(result.resendApiKey).toBe('db-key');
    expect(result.from).toEqual({ name: 'Settings Sender', email: 'settings@example.test' });
  });

  it('an empty stored key falls back to the env key (cleared via the settings UI)', () => {
    const result = overlayStoredEmailConfig(baseConfig(), {
      provider: 'resend',
      apiKey: '',
      fromName: 'Settings Sender',
      fromEmail: 'settings@example.test',
    });

    expect(result.resendApiKey).toBe('env-key');
    expect(result.from.email).toBe('settings@example.test');
  });

  it('legacy multi-provider rows leave the baseline untouched', () => {
    const result = overlayStoredEmailConfig(baseConfig(), {
      provider: 'smtp',
      host: 'smtp.example.test',
      port: 587,
      fromName: 'Old Sender',
      fromEmail: 'old@example.test',
    });

    expect(result).toEqual(baseConfig());
  });

  it('garbage rows leave the baseline untouched', () => {
    expect(overlayStoredEmailConfig(baseConfig(), null)).toEqual(baseConfig());
    expect(overlayStoredEmailConfig(baseConfig(), 'nonsense')).toEqual(baseConfig());
    expect(overlayStoredEmailConfig(baseConfig(), { provider: 'resend' })).toEqual(baseConfig());
  });
});
