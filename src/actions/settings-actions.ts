// /actions/settings-actions.ts
'use server';

import { revalidatePath } from 'next/cache';

import z from 'zod';

import { AuditAction } from '@/app/generated/prisma';
import { getServerAuth, requireAuth } from '@/lib/auth';
import { createAuditLog } from '@/lib/prisma/db-helpers';
import prisma from '@/lib/prisma/prisma';
import { requirePermission } from '@/lib/rbac';
import {
  type CompanySettings,
  type EmailConfigInput,
  type BackupSettingsInput,
  type PDFSettingsInput,
  type NumberSequencesInput,
  type GeneralSettingsInput,
  type SystemSettings,
  companySettingsSchema,
  emailSettingsSchema,
  backupSettingsSchema,
  pdfSettingsSchema,
  numberSequencesSchema,
  generalSettingsSchema,
  DEFAULT_SYSTEM_SETTINGS,
} from '@/lib/validations/settings-schema';
import type { ActionResult } from '@/types/settings';
import { SettingKey } from '@/types/settings';
import { getB2Config } from '@/lib/storage/utils';
import type { B2Config } from '@/lib/storage/schema';
import { BackupManager } from '@/lib/storage/backup-manager';
import type { BackupInfo } from '@/lib/storage/backup-manager';
import { storageService } from '@/lib/storage/service';

function validateB2Config(config: B2Config): void {
  const required = ['applicationKeyId', 'applicationKey', 'bucketName', 'endpoint'] as const;
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing B2 configuration: ${missing.join(', ')}`);
  }
}

/**
 * Update company settings
 */
export async function updateCompanySettings(data: CompanySettings) {
  try {
    const session = await requireAuth();
    await requirePermission('settings', 'edit');

    const validated = companySettingsSchema.parse(data);

    let logoUrl = validated.logo;
    if (validated.logo?.startsWith('data:')) {
      // Upload logo to B2
      logoUrl = await uploadLogoToB2(validated.logo);
    }

    let company = await prisma.company.findFirst({
      where: {
        code: 'DEFAULT',
        deletedAt: null,
      },
    });

    if (company) {
      company = await prisma.company.update({
        where: { id: company.id },
        data: {
          legalName: validated.companyName,
          tradeName: validated.companyName,
          vatNumber: validated.vatNumber,
          addressLine1: validated.address,
          email: validated.email,
          phone: validated.phone,
          website: validated.website ?? null,
          iban: validated.bankAccount ?? null,
          bankAccount: validated.bankAccount ?? null,
          logoUrl: logoUrl ?? null,
          updatedAt: new Date(),
        },
      });
      await createAuditLog({
        userId: session.user.id,
        action: AuditAction.UPDATE,
        tableName: 'companies',
        recordId: company.id,
        newValues: validated,
        metadata: { action: 'company_settings_update' },
      });
    } else {
      company = await prisma.company.create({
        data: {
          code: 'DEFAULT',
          legalName: validated.companyName,
          tradeName: validated.companyName,
          vatNumber: validated.vatNumber,
          addressLine1: validated.address,
          city: 'Default City',
          postalCode: '00000',
          email: validated.email,
          phone: validated.phone,
          website: validated.website ?? null,
          iban: validated.bankAccount ?? null,
          bankAccount: validated.bankAccount ?? null,
          logoUrl: logoUrl ?? null,
        },
      });
      await createAuditLog({
        userId: session.user.id,
        action: AuditAction.CREATE,
        tableName: 'companies',
        recordId: company.id,
        newValues: validated,
        metadata: { action: 'company_settings_create' },
      });
    }

    revalidatePath('/settings/company');
    return { success: true, data: company };
  } catch (error) {
    console.error('Update company settings error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update settings',
    };
  }
}

/**
 * Upload logo to B2
 */
async function uploadLogoToB2(base64Data: string): Promise<string> {
  // Extract mime type and data from base64
  const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
  if (!matches?.[1] || !matches[2]) {
    throw new Error('Invalid base64 image format');
  }

  const mimeType = matches[1];
  const base64Content = matches[2];
  const buffer = Buffer.from(base64Content, 'base64');
  const extension = mimeType?.split('/')[1] ?? 'png';
  const filename = `company-logo-${Date.now()}.${extension}`;

  const fileInfo = await storageService.uploadFile(buffer, filename, {
    contentType: mimeType,
    isPublic: true,
  });

  return fileInfo.url || fileInfo.key;
}

/**
 * Get company settings
 */
export async function getCompanySettings() {
  try {
    await requirePermission('settings', 'view');

    const company = await prisma.company.findFirst({
      where: {
        code: 'DEFAULT',
        deletedAt: null,
      },
    });

    if (!company) {
      return { success: true, data: null };
    }

    const settings: CompanySettings = {
      companyName: company.legalName,
      address: company.addressLine1 + (company.addressLine2 ? `\n${company.addressLine2}` : ''),
      vatNumber: company.vatNumber,
      email: company.email,
      phone: company.phone,
      website: company.website ?? '',
      bankAccount: company.iban ?? '',
      bankDetails: company.bankName ?? '',
      logo: company.logoUrl ?? undefined,
    };

    return { success: true, data: settings };
  } catch (error) {
    console.error('Get company settings error:', error);
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to fetch settings',
    };
  }
}

/**
 * Get a single setting by key
 */
async function getSetting<T>(key: SettingKey, defaultValue: T): Promise<T> {
  const setting = await prisma.systemSetting.findUnique({
    where: { key },
  });

  return (setting?.value as T) ?? defaultValue;
}

/**
 * Update or create a setting
 */
async function upsertSetting(
  key: SettingKey,
  value: unknown,
  description?: string,
  userId?: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key },
      create: { key, value: value as object, description: description ?? null, isPublic: false },
      update: { value: value as object },
    });
    if (userId) {
      await tx.auditLog.create({
        data: {
          userId,
          action: 'UPDATE',
          tableName: 'system_settings',
          recordId: key,
          metadata: {
            section: key,
            timestamp: new Date().toISOString(),
          },
        },
      });
    }
  });
}

async function updateSetting<T>(
  key: SettingKey,
  data: unknown,
  schema: z.ZodSchema<T>,
  description: string
): Promise<ActionResult> {
  try {
    await requirePermission('settings', 'edit');
    const session = await getServerAuth();

    const validated = schema.parse(data);
    await upsertSetting(key, validated, description, session?.user.id);

    revalidatePath('/settings/system');
    return { success: true };
  } catch (error) {
    console.error(`Failed to update ${key}:`, error);
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues.map((issue) => issue.message).join(', '),
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Update failed',
    };
  }
}

/**
 * Get all system settings
 */
export async function getSystemSettings(): Promise<SystemSettings> {
  await requirePermission('settings', 'view');

  const [email, pdf, backup, numberSequences, general] = await Promise.all([
    getSetting<EmailConfigInput>(SettingKey.EMAIL, DEFAULT_SYSTEM_SETTINGS.email),
    getSetting<PDFSettingsInput>(SettingKey.PDF, DEFAULT_SYSTEM_SETTINGS.pdf),
    getSetting<BackupSettingsInput>(SettingKey.BACKUP, DEFAULT_SYSTEM_SETTINGS.backup),
    getSetting<NumberSequencesInput>(
      SettingKey.NUMBER_SEQUENCES,
      DEFAULT_SYSTEM_SETTINGS.numberSequences
    ),
    getSetting<GeneralSettingsInput>(SettingKey.GENERAL, DEFAULT_SYSTEM_SETTINGS.general),
  ]);

  return {
    email: { ...DEFAULT_SYSTEM_SETTINGS.email, ...email },
    pdf: { ...DEFAULT_SYSTEM_SETTINGS.pdf, ...pdf },
    backup: { ...DEFAULT_SYSTEM_SETTINGS.backup, ...backup },
    numberSequences: { ...DEFAULT_SYSTEM_SETTINGS.numberSequences, ...numberSequences },
    general: { ...DEFAULT_SYSTEM_SETTINGS.general, ...general },
  };
}

export async function saveEmailSettings(data: unknown) {
  return updateSetting(
    SettingKey.EMAIL,
    data,
    emailSettingsSchema,
    'Email configuration for System notifications'
  );
}

export async function updatePDF(data: unknown): Promise<ActionResult> {
  return updateSetting(SettingKey.PDF, data, pdfSettingsSchema, 'PDF generation settings');
}

export async function updateBackup(data: unknown): Promise<ActionResult> {
  return updateSetting(
    SettingKey.BACKUP,
    data,
    backupSettingsSchema,
    'Automatic backup configuration'
  );
}

export async function updateNumberSequences(data: unknown): Promise<ActionResult> {
  return updateSetting(
    SettingKey.NUMBER_SEQUENCES,
    data,
    numberSequencesSchema,
    'Document number formatting and sequences'
  );
}

export async function updateGeneral(data: unknown): Promise<ActionResult> {
  return updateSetting(
    SettingKey.GENERAL,
    data,
    generalSettingsSchema,
    'General application settings'
  );
}

/**
 * Test email configuration
 */
export async function testEmailConfiguration(testEmail?: string): Promise<ActionResult<string>> {
  try {
    await requirePermission('settings', 'edit');

    const emailConfig = await getSetting<EmailConfigInput>(
      SettingKey.EMAIL,
      null as unknown as EmailConfigInput
    );

    if (!emailConfig?.fromEmail) {
      return {
        success: false,
        error: 'Email configuration not found. Please configure email settings first.',
      };
    }

    const recipient = testEmail ?? emailConfig.fromEmail;
    await sendTestEmail(emailConfig, recipient);

    return {
      success: true,
      data: `Test email sent successfully to ${recipient}`,
    };
  } catch (error) {
    console.error('Test email error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send test email',
    };
  }
}

/**
 * Send test email implementation
 */
async function sendTestEmail(config: EmailConfigInput, recipient: string): Promise<void> {
  const emailContent = {
    to: recipient,
    from: { name: config.fromName, email: config.fromEmail },
    subject: 'Test Email - Configuration Verified',
    html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Email Configuration Test</h2>
                <p>This is a test email to verify your email configuration is working correctly.</p>
                <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                    <p><strong>Provider:</strong> ${config.provider}</p>
                    <p><strong>From:</strong> ${config.fromName} &lt;${config.fromEmail}&gt;</p>
                    <p><strong>Sent at:</strong> ${new Date().toISOString()}</p>
                </div>
                <p style="color: #666; font-size: 12px;">
                    If you received this email, your email configuration is working correctly.
                </p>
            </div>
        `,
    text: `Email Configuration Test\n\nProvider: ${config.provider}\nFrom: ${config.fromName} <${config.fromEmail}>\nSent at: ${new Date().toISOString()}`,
  };

  switch (config.provider) {
    case 'resend': {
      if (!config.apiKey) throw new Error('Resend API key is required');
      const { Resend } = await import('resend');
      const resend = new Resend(config.apiKey);

      const { error } = await resend.emails.send({
        from: `${emailContent.from.name} <${emailContent.from.email}>`,
        to: emailContent.to,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });

      if (error) throw new Error(`Resend error: ${error.message}`);
      break;
    }

    case 'sendgrid': {
      if (!config.apiKey) throw new Error('SendGrid API key is required');
      const sgMail = await import('@sendgrid/mail');
      sgMail.default.setApiKey(config.apiKey);

      await sgMail.default.send({
        to: emailContent.to,
        from: { name: emailContent.from.name, email: emailContent.from.email },
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
      break;
    }

    case 'ses': {
      if (!config.apiKey) throw new Error('AWS SES credentials are required');
      const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');

      let credentials: { accessKeyId: string; secretAccessKey: string; region: string };
      try {
        credentials = JSON.parse(config.apiKey) as { accessKeyId: string; secretAccessKey: string; region: string };
      } catch {
        throw new Error(
          'Invalid AWS SES credentials. Expected JSON with accessKeyId, secretAccessKey, region.'
        );
      }

      const sesClient = new SESClient({
        region: credentials.region ?? 'eu-west-1',
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
        },
      });

      await sesClient.send(
        new SendEmailCommand({
          Source: `${emailContent.from.name} <${emailContent.from.email}>`,
          Destination: { ToAddresses: [emailContent.to] },
          Message: {
            Subject: { Charset: 'UTF-8', Data: emailContent.subject },
            Body: {
              Html: { Charset: 'UTF-8', Data: emailContent.html },
              Text: { Charset: 'UTF-8', Data: emailContent.text },
            },
          },
        })
      );
      break;
    }

    case 'smtp': {
      if (!config.host || !config.port) throw new Error('SMTP host and port are required');
      const nodemailer = await import('nodemailer');

      const transporter = nodemailer.default.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure ?? config.port === 465,
        auth:
          config.user && config.password ? { user: config.user, pass: config.password } : undefined,
      });

      await transporter.sendMail({
        from: `"${emailContent.from.name}" <${emailContent.from.email}>`,
        to: emailContent.to,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
      break;
    }

    default:
      throw new Error(`Email provider '${String(config.provider)}' is not supported`);
  }
}

// Backup Operations — delegates to BackupManager

export type { BackupInfo };

/**
 * Trigger manual backup
 */
export async function runManualBackup(): Promise<ActionResult<BackupInfo>> {
  try {
    await requirePermission('settings', 'edit');
    const session = await getServerAuth();

    const backupSettings = await getSetting<BackupSettingsInput>(
      SettingKey.BACKUP,
      null as unknown as BackupSettingsInput
    );

    if (!backupSettings?.enabled) {
      return { success: false, error: 'Backups are disabled in settings' };
    }

    const result = await BackupManager.run();

    await upsertSetting(
      SettingKey.LAST_BACKUP,
      {
        timestamp: result.createdAt,
        filename: result.filename,
        key: result.key,
        size: result.size,
      },
      'Last backup information',
      session?.user.id
    );

    await BackupManager.cleanup(backupSettings.retentionDays);

    return { success: true, data: result };
  } catch (error) {
    console.error('Manual backup error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Backup failed',
    };
  }
}



/**
 * List available backups from B2
 */
export async function listBackups(): Promise<ActionResult<BackupInfo[]>> {
  try {
    await requirePermission('settings', 'view');
    const backups = await BackupManager.list();
    return { success: true, data: backups };
  } catch (error) {
    console.error('List backups error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list backups',
    };
  }
}

/**
 * Get signed download URL for a backup
 */
export async function getBackupDownloadUrl(key: string): Promise<ActionResult<string>> {
  try {
    await requirePermission('settings', 'view');

    const b2Config = getB2Config();
    if (!key.startsWith(`${b2Config.keyName}/`)) {
      return { success: false, error: 'Invalid backup key' };
    }

    const signedUrl = await storageService.getPresignedDownloadUrl(key, 3600);
    return { success: true, data: signedUrl };
  } catch (error) {
    console.error('Get download URL error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate download URL',
    };
  }
}

/**
 * Delete a specific backup
 */
export async function deleteBackup(key: string): Promise<ActionResult> {
  try {
    await requirePermission('settings', 'edit');
    const session = await getServerAuth();

    const b2Config = getB2Config();
    if (!key.startsWith(`${b2Config.keyName}/`)) {
      return { success: false, error: 'Invalid backup key' };
    }

    await storageService.deleteFile(key);

    if (session?.user.id) {
      await createAuditLog({
        userId: session.user.id,
        action: AuditAction.DELETE,
        tableName: 'backups',
        recordId: key,
        metadata: { action: 'backup_deleted', key },
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Delete backup error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete backup',
    };
  }
}

/**
 * Get last backup timestamp
 */
export async function getLastBackupTime(): Promise<{
  timestamp: string;
  filename: string;
  size: number;
} | null> {
  await requirePermission('settings', 'view');

  const data = await getSetting<{
    timestamp: string;
    filename: string;
    size: number;
  }>(
    SettingKey.LAST_BACKUP,
    null as unknown as { timestamp: string; filename: string; size: number }
  );

  return data ?? null;
}

/**
 * Get last backup information
 */
export async function getLastBackupInfo(): Promise<ActionResult<BackupInfo | null>> {
  try {
    await requirePermission('settings', 'view');

    const data = await getSetting<BackupInfo>(
      SettingKey.LAST_BACKUP,
      null as unknown as BackupInfo
    );

    return { success: true, data: data ?? null };
  } catch (error) {
    console.error('Get last backup error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get last backup info',
    };
  }
}

/**
 * Verify B2 configuration
 */
export async function verifyB2Configuration(): Promise<
  ActionResult<{ bucketName: string; endpoint: string }>
> {
  try {
    await requirePermission('settings', 'view');

    const b2Config = getB2Config();
    validateB2Config(b2Config);

    // Simple validation — if getB2Config doesn't throw, config is valid
    return {
      success: true,
      data: {
        bucketName: b2Config.bucketName,
        endpoint: b2Config.endpoint,
      },
    };
  } catch (error) {
    console.error('B2 verification error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify B2 configuration',
    };
  }
}
