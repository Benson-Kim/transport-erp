/**
 * #19 / #40 - write-only email secrets in saveEmailSettings (Resend-only):
 * blank alone keeps the stored key; the explicit clearApiKey flag persists
 * '' - a VALID state since the runtime falls back to RESEND_API_KEY (#40);
 * the flag itself is transport-only and never persisted; legacy
 * multi-provider shapes fail validation with NO partial write; a successful
 * save reloads the runtime config so the saved key is the key used.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { saveEmailSettings } from '@/actions/settings-actions';

const mockRequirePermission = jest.fn<(...args: unknown[]) => Promise<void>>();
jest.mock('@/lib/rbac', () => ({
  requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

const mockGetServerAuth = jest.fn<() => Promise<unknown>>();
jest.mock('@/lib/auth', () => ({
  getServerAuth: () => mockGetServerAuth(),
  requireAuth: () => mockGetServerAuth(),
}));

const mockReloadConfig = jest.fn<() => Promise<void>>();
jest.mock('@/lib/email', () => ({
  emailService: {
    reloadConfig: () => mockReloadConfig(),
    send: jest.fn(),
  },
}));

const mockSettingFindUnique = jest.fn<() => Promise<unknown>>();
const mockUpsert = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockAuditCreate = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@/lib/prisma/prisma', () => ({
  __esModule: true,
  default: {
    systemSetting: {
      findUnique: (..._args: unknown[]) => mockSettingFindUnique(),
    },
    $transaction: (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        systemSetting: { upsert: (...args: unknown[]) => mockUpsert(...args) },
        auditLog: { create: (...args: unknown[]) => mockAuditCreate(...args) },
      }),
  },
}));

jest.mock('@/lib/prisma/db-helpers', () => ({
  createAuditLog: () => Promise.resolve(),
}));
jest.mock('@/lib/utils/export', () => ({
  getEnv: () => '',
}));
jest.mock('next/cache', () => ({
  revalidatePath: () => undefined,
}));

const storedResend = {
  provider: 'resend',
  apiKey: 'stored-key',
  fromName: 'Transport ERP',
  fromEmail: 'noreply@example.test',
};

/** The settings value the action attempted to persist. */
function upsertedValue(): Record<string, unknown> {
  const call = mockUpsert.mock.calls.at(-1);
  const arg = call?.[0] as { update: { value: Record<string, unknown> } };
  return arg.update.value;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRequirePermission.mockResolvedValue(undefined);
  mockGetServerAuth.mockResolvedValue({ user: { id: 'admin-1' } });
  mockSettingFindUnique.mockResolvedValue({ value: storedResend });
  mockUpsert.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
  mockReloadConfig.mockResolvedValue(undefined);
});

describe('saveEmailSettings write-only secrets (#19/#40)', () => {
  it('blank apiKey keeps the stored key (routine save never wipes it)', async () => {
    const result = await saveEmailSettings({ ...storedResend, apiKey: '' });

    expect(result.success).toBe(true);
    expect(upsertedValue()['apiKey']).toBe('stored-key');
  });

  it('clearApiKey: true persists an empty key - the runtime falls back to RESEND_API_KEY', async () => {
    const result = await saveEmailSettings({ ...storedResend, apiKey: '', clearApiKey: true });

    expect(result.success).toBe(true);
    expect(upsertedValue()['apiKey']).toBe('');
  });

  it('the clearApiKey transport flag is never persisted', async () => {
    await saveEmailSettings({ ...storedResend, apiKey: '', clearApiKey: true });

    expect(upsertedValue()).not.toHaveProperty('clearApiKey');
  });

  it('reloads the runtime email config after a successful save (#40)', async () => {
    const result = await saveEmailSettings({ ...storedResend, apiKey: 'new-key' });

    expect(result.success).toBe(true);
    expect(mockReloadConfig).toHaveBeenCalledTimes(1);
  });

  it('legacy multi-provider shapes fail validation with no partial write (#40)', async () => {
    const result = await saveEmailSettings({
      ...storedResend,
      provider: 'smtp',
      host: 'smtp.example.test',
      port: 587,
    });

    expect(result.success).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockReloadConfig).not.toHaveBeenCalled();
  });
});
