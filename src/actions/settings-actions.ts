// /actions/settings-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import {
  type CompanySettings,
  type EmailConfigInput,
  type BackupSettingsInput,
  type PDFSettingsInput,
  type NumberSequencesInput,
  type GeneralSettingsInput,
  type SystemSettings,
  companySettingsSchema,
  emailConfigSchema,
  backupSettingsSchema,
  pdfSettingsSchema,
  numberSequencesSchema,
  generalSettingsSchema,
  DEFAULT_SYSTEM_SETTINGS,
} from '@/lib/validations/settings-schema';

import prisma from '@/lib/prisma/prisma';
import { createAuditLog } from '@/lib/prisma/db-helpers';
import { requirePermission } from '@/lib/rbac';
import { getServerAuth, requireAuth } from '@/lib/auth';
import { AuditAction } from '@/app/generated/prisma';

import type { ActionResult } from '@/types/settings';
import { SettingKey } from '@/types/settings';
import z from 'zod';
import { format as formatDate } from 'date-fns';
import { getEnv } from '@/lib/utils/export';

/**
 * B2 Configuration Interface
 */
interface B2Config {
  applicationKeyId: string;
  applicationKey: string;
  bucketId: string;
  bucketName: string;
  region: string;
  endpoint: string;
  keyName: string;
  maxFileSize: number;
  cdnUrl?: string;
}

function getB2Config(): B2Config {
  const cleanEndpoint = getEnv('B2_ENDPOINT').trim().replace(/\/+$/, '');
  const endpoint = cleanEndpoint.startsWith('http') ? cleanEndpoint : `https://${cleanEndpoint}`;
  const config: B2Config = {
    applicationKeyId: getEnv('B2_APPLICATION_KEY_ID') || '',
    applicationKey: getEnv('B2_APPLICATION_KEY') || '',
    bucketId: getEnv('B2_BUCKET_ID') || '',
    bucketName: getEnv('B2_BUCKET_NAME') || '',
    region: getEnv('B2_REGION') || 'us-west-004',
    endpoint: endpoint || '',
    keyName: getEnv('B2_KEYNAME') || 'backups',
    maxFileSize: parseInt(getEnv('B2_MAX_FILE_SIZE') || '104857600', 10), // 100MB default
    cdnUrl: getEnv('B2_CDN_URL'),
  };

  return config;
}

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
    if (validated.logo && validated.logo.startsWith('data:')) {
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
  if (!matches || !matches[1] || !matches[2]) {
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
      address: company.addressLine1 + (company.addressLine2 ? '\n' + company.addressLine2 : ''),
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
    emailConfigSchema,
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

    if (!emailConfig || !emailConfig.fromEmail) {
      return {
        success: false,
        error: 'Email configuration not found. Please configure email settings first.',
      };
    }

    const recipient = testEmail || emailConfig.fromEmail;
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
        credentials = JSON.parse(config.apiKey);
      } catch {
        throw new Error(
          'Invalid AWS SES credentials. Expected JSON with accessKeyId, secretAccessKey, region.'
        );
      }

      const sesClient = new SESClient({
        region: credentials.region || 'eu-west-1',
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
      throw new Error(`Email provider '${config.provider}' is not supported`);
  }
}

// Backup Operations with Backblaze B2
export interface BackupInfo {
  filename: string;
  key: string;
  size: number;
  createdAt: string;
  url?: string;
}

/**
 * Get B2 S3 Client
 */
async function getB2Client() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  const b2Config = getB2Config();
  validateB2Config(b2Config);

  return {
    client: new S3Client({
      region: b2Config.region,
      endpoint: b2Config.endpoint,
      credentials: {
        accessKeyId: b2Config.applicationKeyId,
        secretAccessKey: b2Config.applicationKey,
      },
      forcePathStyle: true,
    }),
    config: b2Config,
  };
}

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

    // Cleanup old backups based on retention
    await cleanupOldBackups(backupSettings.retentionDays);

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
 * Execute backup - creates SQL dump and uploads to Backblaze B2
 */
async function executeBackup(_settings: BackupSettingsInput): Promise<BackupInfo> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');
  const { createGzip } = await import('zlib');
  const { createReadStream, createWriteStream } = await import('fs');
  const { pipeline } = await import('stream/promises');
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');

  const execAsync = promisify(exec);

  // Get database URL
  const databaseUrl = getEnv('DATABASE_URL');
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Parse database URL
  const dbUrlMatch = databaseUrl.match(
    /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)(\?.*)?$/
  );

  if (!dbUrlMatch) {
    throw new Error('Invalid DATABASE_URL format');
  }

  const [, user, password, host, port, database] = dbUrlMatch;

  if (!database) {
    throw new Error('Database name could not be parsed from DATABASE_URL');
  }

  // Create temp directory for backup
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-'));
  const timestamp = formatDate(new Date(), 'yyyy-MM-dd-HHmmss');
  const sqlFilename = `backup-${timestamp}.sql`;
  const gzFilename = `${sqlFilename}.gz`;
  const sqlPath = path.join(tempDir, sqlFilename);
  const gzPath = path.join(tempDir, gzFilename);

  try {
    // Create SQL dump using pg_dump
    console.log('Creating database dump...');
    await execAsync(
      `pg_dump -h ${host} -p ${port} -U ${user} -d ${database} --no-owner --no-acl -F p -f "${sqlPath}"`,
      {
        env: { ...process.env, PGPASSWORD: password },
        maxBuffer: 1024 * 1024 * 100, // 100MB buffer
      }
    );

    // Compress the SQL file
    console.log('Compressing backup...');
    await pipeline(createReadStream(sqlPath), createGzip({ level: 9 }), createWriteStream(gzPath));

    // Get compressed file stats
    const stats = await fs.stat(gzPath);
    const b2Config = getB2Config();

    // Check file size limit
    if (stats.size > b2Config.maxFileSize) {
      throw new Error(
        `Backup size (${formatBytes(stats.size)}) exceeds maximum allowed size (${formatBytes(b2Config.maxFileSize)})`
      );
    }

    // Upload to B2
    console.log('Uploading to Backblaze B2...');
    const { client, config } = await getB2Client();
    const key = `${config.keyName}/${gzFilename}`;

    const fileContent = await fs.readFile(gzPath);

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: fileContent,
        ContentType: 'application/gzip',
        ContentLength: stats.size,
        Metadata: {
          'backup-timestamp': new Date().toISOString(),
          database: database,
          'original-size': (await fs.stat(sqlPath).catch(() => ({ size: 0 }))).size.toString(),
        },
      })
    );

    console.log(`Backup uploaded successfully: ${key}`);

    // Generate URL
    const url = config.cdnUrl
      ? `${config.cdnUrl}/${key}`
      : `${config.endpoint}/${config.bucketName}/${key}`;

    return {
      filename: gzFilename,
      key,
      size: stats.size,
      createdAt: new Date().toISOString(),
      url,
    };
  } finally {
    // Cleanup temp files
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Clean up old backups based on retention policy
 */
async function cleanupOldBackups(retentionDays: number): Promise<number> {
  const { ListObjectsV2Command, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const { client, config } = await getB2Client();

  const prefix = `${config.keyName}/`;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  let deletedCount = 0;
  let continuationToken: string | undefined;

  do {
    const listResponse = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    if (listResponse.Contents) {
      for (const object of listResponse.Contents) {
        if (object.LastModified && object.LastModified < cutoffDate && object.Key) {
          await client.send(
            new DeleteObjectCommand({
              Bucket: config.bucketName,
              Key: object.Key,
            })
          );
          console.log(`Deleted old backup: ${object.Key}`);
          deletedCount++;
        }
      }
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  return deletedCount;
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
          if (object.Key && object.Key.endsWith('.sql.gz')) {
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
