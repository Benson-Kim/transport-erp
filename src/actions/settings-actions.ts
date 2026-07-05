// /actions/settings-actions.ts
'use server';

import { revalidatePath } from 'next/cache';

import z from 'zod';

import { AuditAction } from '@/app/generated/prisma';
import { getServerAuth, requireAuth } from '@/lib/auth';
import {
  cleanupOldBackups,
  executeBackup,
  getB2Client,
  getB2Config,
  restoreBackupToDatabase,
  validateB2Config,
  type BackupInfo,
} from '@/lib/backup';
import { emailService } from '@/lib/email';
import { createAuditLog } from '@/lib/prisma/db-helpers';
import prisma from '@/lib/prisma/prisma';
import { requirePermission } from '@/lib/rbac';
import { getEnv } from '@/lib/utils/export';
import {
  type CompanySettings,
  type EmailConfigInput,
  type BackupSettingsInput,
  type PDFSettingsInput,
  type GeneralSettingsInput,
  type SystemSettings,
  companySettingsSchema,
  emailConfigSchema,
  backupSettingsSchema,
  pdfSettingsSchema,
  generalSettingsSchema,
  DEFAULT_SYSTEM_SETTINGS,
} from '@/lib/validations/settings-schema';
import type { ActionResult } from '@/types/settings';
import { SettingKey } from '@/types/settings';

// B2 config + the backup engine moved to src/lib/backup.ts (#39): ONE
// implementation shared by these RBAC-gated actions and the #38 job runner
// (which has no session and cannot call server actions).

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
          website: validated.website || null,
          iban: validated.bankAccount || null,
          bankAccount: validated.bankAccount || null,
          logoUrl: logoUrl || null,
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
          website: validated.website || null,
          iban: validated.bankAccount || null,
          bankAccount: validated.bankAccount || null,
          logoUrl: logoUrl || null,
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
  const b2Config = getB2Config();
  validateB2Config(b2Config);

  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  // Extract mime type and data from base64
  const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
  if (!matches?.[1] || !matches[2]) {
    throw new Error('Invalid base64 image format');
  }

  const mimeType = matches[1];
  const base64Content = matches[2];

  const buffer = Buffer.from(base64Content, 'base64');

  // Generate unique filename
  const extension = mimeType?.split('/')[1] || 'png';
  const filename = `logos/company-logo-${Date.now()}.${extension}`;

  const s3Client = new S3Client({
    region: b2Config.region,
    endpoint: b2Config.endpoint,
    credentials: {
      accessKeyId: b2Config.applicationKeyId,
      secretAccessKey: b2Config.applicationKey,
    },
    forcePathStyle: true,
  });

  await s3Client.send(
    new PutObjectCommand({
      Bucket: b2Config.bucketName,
      Key: filename,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  // Return CDN URL if available, otherwise construct B2 URL
  if (b2Config.cdnUrl) {
    return `${b2Config.cdnUrl}/${filename}`;
  }

  return `${b2Config.endpoint}/${b2Config.bucketName}/${filename}`;
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
      address: company.addressLine1 + (company.addressLine2 ? `\n${  company.addressLine2}` : ''),
      vatNumber: company.vatNumber,
      email: company.email,
      phone: company.phone,
      website: company.website || '',
      bankAccount: company.iban || '',
      bankDetails: company.bankName || '',
      logo: company.logoUrl || undefined,
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
 * Email secret fields are write-only (#19): they are never sent to the client,
 * and a blank value on save means "keep the stored secret". This prevents the
 * plaintext API key from being hydrated into the browser.
 */
function redactEmailSecrets(email: EmailConfigInput): EmailConfigInput {
  return { ...email, apiKey: '' };
}

/**
 * Stored email settings predating #40 (sendgrid/ses/smtp shapes) no longer
 * parse; surface the defaults so the form starts from a valid Resend config
 * instead of an uneditable legacy one. The stored row is left untouched
 * until the admin saves.
 */
function sanitizeEmailSettings(stored: EmailConfigInput): EmailConfigInput {
  const parsed = emailConfigSchema.safeParse({ ...DEFAULT_SYSTEM_SETTINGS.email, ...stored });
  return parsed.success ? parsed.data : DEFAULT_SYSTEM_SETTINGS.email;
}

/**
 * Get all system settings
 */
export async function getSystemSettings(): Promise<SystemSettings> {
  await requirePermission('settings', 'view');

  const [email, pdf, backup, general] = await Promise.all([
    getSetting<EmailConfigInput>(SettingKey.EMAIL, DEFAULT_SYSTEM_SETTINGS.email),
    getSetting<PDFSettingsInput>(SettingKey.PDF, DEFAULT_SYSTEM_SETTINGS.pdf),
    getSetting<BackupSettingsInput>(SettingKey.BACKUP, DEFAULT_SYSTEM_SETTINGS.backup),
    getSetting<GeneralSettingsInput>(SettingKey.GENERAL, DEFAULT_SYSTEM_SETTINGS.general),
  ]);

  return {
    // Never surface stored email secrets to the client. (#19)
    email: redactEmailSecrets(sanitizeEmailSettings(email)),
    pdf: { ...DEFAULT_SYSTEM_SETTINGS.pdf, ...pdf },
    backup: { ...DEFAULT_SYSTEM_SETTINGS.backup, ...backup },
    general: { ...DEFAULT_SYSTEM_SETTINGS.general, ...general },
  };
}

export async function saveEmailSettings(data: unknown) {
  // Write-only fields (#19): the redacted values sent to the client come
  // back empty unless the admin typed a new secret. Blank = keep stored;
  // an explicit clear flag = erase (an empty string alone must never mean
  // "delete", or a routine save would wipe the key). clearApiKey rides in
  // on emailConfigSchema itself as a transport-only flag (#19 review 6,
  // #40): consumed and stripped here, never persisted; cleared sends fall
  // back to the RESEND_API_KEY environment variable.
  //
  // NOTE: getSetting -> updateSetting is read-merge-write and non-atomic.
  // Acceptable at single-admin scale; revisit if settings gain concurrent
  // writers (#38's queue worker must NOT write to SettingKey.EMAIL).
  let incoming = data as Partial<EmailConfigInput> | null;
  if (incoming && typeof incoming === 'object') {
    const { clearApiKey, ...rest } = incoming;
    const stored = await getSetting<EmailConfigInput>(
      SettingKey.EMAIL,
      DEFAULT_SYSTEM_SETTINGS.email
    );
    const merged: Partial<EmailConfigInput> = { ...rest };
    if (!merged.apiKey) merged.apiKey = clearApiKey ? '' : stored.apiKey;
    incoming = merged;
  }

  const result = await updateSetting(
    SettingKey.EMAIL,
    incoming,
    emailConfigSchema,
    'Email configuration for System notifications'
  );

  if (result.success) {
    // Same-process freshness: the just-saved config is what the next send
    // uses. Other replicas converge within EmailService's config TTL (#40).
    await emailService.reloadConfig();
  }

  return result;
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

export async function updateGeneral(data: unknown): Promise<ActionResult> {
  return updateSetting(
    SettingKey.GENERAL,
    data,
    generalSettingsSchema,
    'General application settings'
  );
}

/**
 * Test email configuration (#40): the test button exercises the SAME
 * subsystem and config source as production sends - emailService with the
 * DB-over-env config. A passing test means real sends work; a simulated
 * result says so instead of claiming delivery.
 */
export async function testEmailConfiguration(testEmail?: string): Promise<ActionResult<string>> {
  try {
    await requirePermission('settings', 'edit');

    if (!testEmail) {
      return {
        success: false,
        error: 'Provide a recipient (the From Email field is used by default).',
      };
    }

    // Force a fresh config read so a key saved moments ago is the one tested.
    await emailService.reloadConfig();

    const result = await emailService.send({
      to: testEmail,
      subject: 'Test Email - Configuration Verified',
      html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Email Configuration Test</h2>
                <p>This is a test email to verify your email configuration is working correctly.</p>
                <p style="color: #666; font-size: 12px;">
                    If you received this email, your email configuration is working correctly.
                </p>
            </div>
        `,
      text: 'Email Configuration Test\n\nIf you received this email, your email configuration is working correctly.',
      metadata: { test: true },
    });

    if (!result.success) {
      return { success: false, error: result.error ?? 'Failed to send test email' };
    }

    if (result.simulated) {
      return {
        success: true,
        data: `Sending is disabled in this environment - the test email to ${testEmail} was simulated, not delivered.`,
      };
    }

    return { success: true, data: `Test email sent successfully to ${testEmail}` };
  } catch (error) {
    console.error('Test email error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send test email',
    };
  }
}

// Backup Operations with Backblaze B2 (engine: src/lib/backup.ts, #39)
export type { BackupInfo } from '@/lib/backup';

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
      return {
        success: false,
        error: 'Backups are disabled in settings',
      };
    }

    const result = await executeBackup(backupSettings);

    // Update last backup timestamp
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

    // Cleanup old backups based on retention, under the configured prefix (#39)
    await cleanupOldBackups(backupSettings.retentionDays, backupSettings.storageLocation);

    return { success: true, data: result };
  } catch (error) {
    console.error('Manual backup error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Backup failed',
    };
  }
}

// executeBackup / cleanupOldBackups live in src/lib/backup.ts (#39):
// execFile argument vectors (no shell interpolation), URL-parsed
// credentials, storageLocation honored as the key prefix.

/**
 * Restore a backup into the VERIFICATION database (#39).
 *
 * Deliberately never touches the primary: the target is
 * BACKUP_RESTORE_DATABASE_URL and the action refuses when it is unset or
 * equal to DATABASE_URL. Restoring over the primary is a manual,
 * eyes-open psql operation (documented in src/lib/backup.ts); a one-click
 * primary restore in a settings screen is a footgun, not a feature. The
 * CI backup-restore-check job proves restorability on every pipeline.
 */
export async function restoreBackupToScratch(key: string): Promise<ActionResult> {
  try {
    await requirePermission('settings', 'edit');
    const session = await getServerAuth();

    const target = process.env.BACKUP_RESTORE_DATABASE_URL;
    if (!target) {
      return {
        success: false,
        error:
          'BACKUP_RESTORE_DATABASE_URL is not configured; refusing to restore over the primary database.',
      };
    }
    if (target === getEnv('DATABASE_URL')) {
      return {
        success: false,
        error: 'BACKUP_RESTORE_DATABASE_URL must not point at the primary database.',
      };
    }

    // Key hygiene: stored-backup shape only, no traversal.
    if (key.includes('..') || !/^[\w\-./]+\.sql\.gz$/.test(key)) {
      return { success: false, error: 'Invalid backup key' };
    }

    await restoreBackupToDatabase(key, target);

    if (session?.user.id) {
      await createAuditLog({
        userId: session.user.id,
        action: AuditAction.UPDATE,
        tableName: 'backups',
        recordId: key,
        metadata: { action: 'backup_restore_verified', key, target: 'scratch' },
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Restore verification error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to restore backup',
    };
  }
}

/**
 * List available backups from B2
 */
export async function listBackups(): Promise<ActionResult<BackupInfo[]>> {
  try {
    await requirePermission('settings', 'view');

    const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    const { client, config } = await getB2Client();

    const prefix = `${config.keyName}/`;
    const backups: BackupInfo[] = [];
    let continuationToken: string | undefined;

    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );

      if (response.Contents) {
        for (const object of response.Contents) {
          if (object.Key?.endsWith('.sql.gz')) {
            const filename = object.Key.split('/').pop() || object.Key;
            const url = config.cdnUrl
              ? `${config.cdnUrl}/${object.Key}`
              : `${config.endpoint}/${config.bucketName}/${object.Key}`;

            backups.push({
              filename,
              key: object.Key,
              size: object.Size || 0,
              createdAt: object.LastModified?.toISOString() || '',
              url,
            });
          }
        }
      }

      continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    // Sort by date, newest first
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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

    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { client, config } = await getB2Client();

    // Validate key is within our backup folder
    if (!key.startsWith(`${config.keyName}/`)) {
      return { success: false, error: 'Invalid backup key' };
    }

    const command = new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    });

    // Generate signed URL valid for 1 hour
    const signedUrl = await getSignedUrl(client, command, { expiresIn: 3600 });

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

    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const { client, config } = await getB2Client();

    // Validate key is within our backup folder
    if (!key.startsWith(`${config.keyName}/`)) {
      return { success: false, error: 'Invalid backup key' };
    }

    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucketName,
        Key: key,
      })
    );

    // Create audit log
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

  return data || null;
}

/**
 * Restore database from a backup
 */
// export async function restoreFromBackup(key: string): Promise<ActionResult> {
//     try {
//         await requirePermission('settings', 'edit');
//         const session = await getServerAuth();

//         const { exec } = await import('child_process');
//         const { promisify } = await import('util');
//         const fs = await import('fs/promises');
//         const path = await import('path');
//         const os = await import('os');
//         const { createGunzip } = await import('zlib');
//         const { createWriteStream } = await import('fs');
//         const { pipeline } = await import('stream/promises');
//         const { Readable } = await import('stream');
//         const { GetObjectCommand } = await import('@aws-sdk/client-s3');

//         const execAsync = promisify(exec);
//         const { client, config } = await getB2Client();

//         // Validate key
//         if (!key.startsWith(`${config.keyName}/`)) {
//             return { success: false, error: 'Invalid backup key' };
//         }

//         // Get database URL
//         const databaseUrl = getEnv('DATABASE_URL');
//         if (!databaseUrl) {
//             throw new Error('DATABASE_URL environment variable is not set');
//         }

//         const dbUrlMatch = databaseUrl.match(
//             /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(\?.*)?$/
//         );

//         if (!dbUrlMatch) {
//             throw new Error('Invalid DATABASE_URL format');
//         }

//         const [, user, password, host, port, database] = dbUrlMatch;

//         // Create temp directory
//         const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-'));
//         const gzPath = path.join(tempDir, 'backup.sql.gz');
//         const sqlPath = path.join(tempDir, 'backup.sql');

//         try {
//             // Download backup from B2
//             console.log('Downloading backup from B2...');
//             const response = await client.send(new GetObjectCommand({
//                 Bucket: config.bucketName,
//                 Key: key,
//             }));

//             if (!response.Body) {
//                 throw new Error('Empty response from B2');
//             }

//             // Write to temp file
//             const writeStream = createWriteStream(gzPath);

//             await pipeline(response.Body as Readable, writeStream);

//             // Decompress
//             console.log('Decompressing backup...');
//             const { createReadStream } = await import('fs');
//             await pipeline(
//                 createReadStream(gzPath),
//                 createGunzip(),
//                 createWriteStream(sqlPath)
//             );

//             // Restore database
//             console.log('Restoring database...');

//             // First, drop and recreate schema (optional - be careful!)
//             // await execAsync(
//             //     `psql -h ${host} -p ${port} -U ${user} -d ${database} -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`,
//             //     { env: { ...process.env, PGPASSWORD: password } }
//             // );

//             // Restore from SQL file
//             await execAsync(
//                 `psql -h ${host} -p ${port} -U ${user} -d ${database} -f "${sqlPath}"`,
//                 {
//                     env: { ...process.env, PGPASSWORD: password },
//                     maxBuffer: 1024 * 1024 * 100,
//                 }
//             );

//             // Create audit log
//             if (session?.user.id) {
//                 await createAuditLog({
//                     userId: session.user.id,
//                     action: AuditAction.UPDATE,
//                     tableName: 'database',
//                     recordId: 'restore',
//                     metadata: {
//                         action: 'database_restored',
//                         backupKey: key,
//                         restoredAt: new Date().toISOString(),
//                     },
//                 });
//             }

//             console.log('Database restored successfully');
//             return { success: true };
//         } finally {
//             // Cleanup temp files
//             await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { });
//         }
//     } catch (error) {
//         console.error('Restore error:', error);
//         return {
//             success: false,
//             error: error instanceof Error ? error.message : 'Failed to restore backup'
//         };
//     }
// }

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

    return { success: true, data: data || null };
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

    const { HeadBucketCommand } = await import('@aws-sdk/client-s3');
    const { client, config } = await getB2Client();

    await client.send(
      new HeadBucketCommand({
        Bucket: config.bucketName,
      })
    );

    return {
      success: true,
      data: {
        bucketName: config.bucketName,
        endpoint: config.endpoint,
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
