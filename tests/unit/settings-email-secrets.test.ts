/**
 * #19 / review !16 advisory - write-only email secrets in saveEmailSettings:
 * blank alone keeps the stored secret, an explicit clear flag persists '',
 * and clearing a secret the active provider still requires is rejected by
 * emailConfigSchema with NO partial write (the flag cannot corrupt an active
 * configuration; switch provider first, then clear).
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

const storedSmtp = {
  provider: 'smtp',
  host: 'smtp.example.test',
  port: 587,
  user: 'mailer',
  password: 'stored-password',
  apiKey: 'stored-key',
  secure: true,
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
  mockSettingFindUnique.mockResolvedValue({ value: storedSmtp });
  mockUpsert.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
});

describe('saveEmailSettings write-only secrets (#19)', () => {
  it('blank secrets keep the stored values (routine save never wipes a key)', async () => {
    const result = await saveEmailSettings({ ...storedSmtp, apiKey: '', password: '' });

    expect(result.success).toBe(true);
    expect(upsertedValue().password).toBe('stored-password');
    expect(upsertedValue().apiKey).toBe('stored-key');
  });

  it('clearPassword: true persists an empty password; the other secret is untouched', async () => {
    const result = await saveEmailSettings({ ...storedSmtp, password: '', clearPassword: true });

    expect(result.success).toBe(true);
    expect(upsertedValue().password).toBe('');
    expect(upsertedValue().apiKey).toBe('stored-key');
  });

  it('clearApiKey: true persists an empty key when the provider does not require one (smtp)', async () => {
    const result = await saveEmailSettings({ ...storedSmtp, apiKey: '', clearApiKey: true });

    expect(result.success).toBe(true);
    expect(upsertedValue().apiKey).toBe('');
  });

  it('clearing the key out from under an API-key provider fails validation with no partial write', async () => {
    const storedResend = {
      provider: 'resend',
      apiKey: 'stored-key',
      fromName: 'Transport ERP',
      fromEmail: 'noreply@example.test',
    };
    mockSettingFindUnique.mockResolvedValue({ value: storedResend });

    const result = await saveEmailSettings({ ...storedResend, apiKey: '', clearApiKey: true });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/API key is required/i);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
