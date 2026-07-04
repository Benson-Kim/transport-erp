/**
 * #40 - simulated sends must be distinguishable: a flagged success in
 * development/test, a loud failure anywhere else. An ERP that claims it
 * emailed an invoice while sending nothing is a lying control. Also covers
 * the config TTL: cached between sends, re-read on explicit reload.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { EmailConfig, Environment } from '@/types/mail';

const mockLogCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@/lib/prisma/prisma', () => ({
  __esModule: true,
  default: {
    emailLog: { create: (...args: unknown[]) => mockLogCreate(...args) },
  },
}));

const mockResolveEmailConfig = jest.fn<() => Promise<EmailConfig>>();
jest.mock('@/lib/email/config', () => ({
  getEmailConfig: () => disabledConfig('test'),
  resolveEmailConfig: () => mockResolveEmailConfig(),
}));

function disabledConfig(environment: Environment): EmailConfig {
  return {
    environment,
    resendApiKey: '',
    from: { email: 'noreply@example.test', name: 'Transport ERP' },
    replyTo: 'support@example.test',
    baseUrl: 'https://erp.example.test',
    company: {
      name: 'Transport ERP',
      address: 'Calle Mayor 1, Madrid',
      supportEmail: 'support@example.test',
      billingEmail: 'billing@example.test',
    },
    sending: { enabled: false, maxRetries: 3, retryDelay: 5000, batchSize: 100 },
    queue: { enabled: false },
    logging: { enabled: false, debug: false },
    restrictions: {},
  };
}

// eslint-disable-next-line import/first
import { EmailService } from '@/lib/email/service';

describe('EmailService simulated sends (#40)', () => {
  const service = EmailService.getInstance();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports a flagged simulated success in development', async () => {
    mockResolveEmailConfig.mockResolvedValue(disabledConfig('development'));
    await service.reloadConfig();

    const result = await service.send({
      to: 'dev@example.test',
      subject: 'Hello',
      html: '<p>hi</p>',
    });

    expect(result.success).toBe(true);
    expect(result.simulated).toBe(true);
  });

  it('fails loudly when sending is disabled in production', async () => {
    mockResolveEmailConfig.mockResolvedValue(disabledConfig('production'));
    await service.reloadConfig();

    const result = await service.send({
      to: 'ops@example.test',
      subject: 'Hello',
      html: '<p>hi</p>',
    });

    expect(result.success).toBe(false);
    expect(result.simulated).toBe(true);
    expect(result.error).toMatch(/disabled/i);
  });

  it('caches the resolved config within the TTL and re-reads on explicit reload', async () => {
    mockResolveEmailConfig.mockResolvedValue(disabledConfig('development'));
    await service.reloadConfig();
    expect(mockResolveEmailConfig).toHaveBeenCalledTimes(1);

    await service.send({ to: 'a@example.test', subject: 's', html: '<p>x</p>' });
    await service.send({ to: 'a@example.test', subject: 's', html: '<p>x</p>' });
    expect(mockResolveEmailConfig).toHaveBeenCalledTimes(1);

    await service.reloadConfig();
    expect(mockResolveEmailConfig).toHaveBeenCalledTimes(2);
  });
});
