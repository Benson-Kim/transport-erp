/**
 * Backup engine (#39). NOT a 'use server' module: settings-actions.ts wraps
 * these in RBAC for the UI, and the #38 job runner calls runScheduledBackup
 * directly (cron has no session).
 *
 * Safety properties:
 * - pg_dump/psql run via execFile with an ARGUMENT VECTOR - nothing from
 *   DATABASE_URL or settings is ever interpolated into a shell string.
 * - Credentials come from new URL() parsing (handles URL-encoded passwords).
 * - backupSettings.storageLocation is the B2 key prefix (falls back to the
 *   B2_KEYNAME env default) - the setting the UI writes is the one honored.
 * - Restore only ever targets an EXPLICIT database URL. The scratch-restore
 *   action refuses to touch the primary. Restoring over the primary is a
 *   deliberate manual operation:
 *     gunzip -c backup.sql.gz | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
 */

import { execFile } from 'child_process';
import { createReadStream, createWriteStream } from 'fs';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';
import { createGunzip, createGzip } from 'zlib';

import { format as formatDateFns } from 'date-fns';

import { getEnv, getOptionalEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import prisma from '@/lib/prisma/prisma';
import {
  backupSettingsSchema,
  type BackupSettingsInput,
} from '@/lib/validations/settings-schema';
import { SettingKey } from '@/types/settings';

const execFileAsync = promisify(execFile);

export interface BackupInfo {
  filename: string;
  key: string;
  size: number;
  createdAt: string;
  url?: string;
}

/** B2 Configuration (moved from settings-actions.ts - one implementation). */
export interface B2Config {
  applicationKeyId: string;
  applicationKey: string;
  bucketId: string;
  bucketName: string;
  region: string;
  endpoint: string;
  keyName: string;
  maxFileSize: number;
  // `| undefined` is deliberate (exactOptionalPropertyTypes): getOptionalEnv
  // returns string | undefined for the boot-optional B2_CDN_URL (#58).
  cdnUrl?: string | undefined;
}

export function getB2Config(): B2Config {
  // #58: getOptionalEnv per variable - the old getEnv THREW on any unset
  // name, so every `getEnv(x) || 'default'` fallback here was unreachable
  // and an unset OPTIONAL B2_CDN_URL took backups down entirely.
  // validateB2Config below is the single required-field gate.
  const rawEndpoint = (getOptionalEnv('B2_ENDPOINT') ?? '').trim().replace(/\/+$/, '');
  const endpoint =
    !rawEndpoint || rawEndpoint.startsWith('http') ? rawEndpoint : `https://${rawEndpoint}`;
  return {
    applicationKeyId: getOptionalEnv('B2_APPLICATION_KEY_ID') ?? '',
    applicationKey: getOptionalEnv('B2_APPLICATION_KEY') ?? '',
    bucketId: getOptionalEnv('B2_BUCKET_ID') ?? '',
    bucketName: getOptionalEnv('B2_BUCKET_NAME') ?? '',
    region: getOptionalEnv('B2_REGION') ?? 'us-west-004',
    endpoint,
    keyName: getOptionalEnv('B2_KEYNAME') ?? 'backups',
    maxFileSize: parseInt(getOptionalEnv('B2_MAX_FILE_SIZE') ?? '104857600', 10), // 100MB default
    cdnUrl: getOptionalEnv('B2_CDN_URL'),
  };
}

export function validateB2Config(config: B2Config): void {
  const required = ['applicationKeyId', 'applicationKey', 'bucketName', 'endpoint'] as const;
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing B2 configuration: ${missing.join(', ')}`);
  }
}

export async function getB2Client() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  const config = getB2Config();
  validateB2Config(config);

  return {
    client: new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.applicationKeyId,
        secretAccessKey: config.applicationKey,
      },
      forcePathStyle: true,
    }),
    config,
  };
}

interface DbConnection {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

/** URL parsing instead of the old regex: URL-encoded credentials survive. */
export function parseDatabaseUrl(raw: string): DbConnection {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid DATABASE_URL format');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must be a postgresql:// URL');
  }
  const database = url.pathname.replace(/^\//, '');
  if (!database) {
    throw new Error('Database name could not be parsed from DATABASE_URL');
  }
  return {
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

/** Effective key prefix: the setting the UI writes, else the env default. */
export function backupKeyPrefix(storageLocation: string | undefined, fallback: string): string {
  const cleaned = (storageLocation ?? '').trim().replace(/^\/+|\/+$/g, '');
  return cleaned || fallback;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Create a gzipped pg_dump and upload it to B2 under the configured prefix.
 */
export async function executeBackup(settings: BackupSettingsInput): Promise<BackupInfo> {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');

  const databaseUrl = getEnv('DATABASE_URL');
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }
  const db = parseDatabaseUrl(databaseUrl);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-'));
  const timestamp = formatDateFns(new Date(), 'yyyy-MM-dd-HHmmss');
  const sqlFilename = `backup-${timestamp}.sql`;
  const gzFilename = `${sqlFilename}.gz`;
  const sqlPath = path.join(tempDir, sqlFilename);
  const gzPath = path.join(tempDir, gzFilename);

  try {
    logger.info('Creating database dump', { database: db.database });
    // Argument vector - no shell, no interpolation (#39).
    await execFileAsync(
      'pg_dump',
      ['-h', db.host, '-p', db.port, '-U', db.user, '-d', db.database, '--no-owner', '--no-acl', '-F', 'p', '-f', sqlPath],
      {
        env: { ...process.env, PGPASSWORD: db.password },
        maxBuffer: 1024 * 1024 * 100,
      }
    );

    logger.info('Compressing backup');
    await pipeline(createReadStream(sqlPath), createGzip({ level: 9 }), createWriteStream(gzPath));

    const stats = await fs.stat(gzPath);
    const { client, config } = await getB2Client();

    if (stats.size > config.maxFileSize) {
      throw new Error(
        `Backup size (${formatBytes(stats.size)}) exceeds maximum allowed size (${formatBytes(config.maxFileSize)})`
      );
    }

    const prefix = backupKeyPrefix(settings.storageLocation, config.keyName);
    const key = `${prefix}/${gzFilename}`;

    logger.info('Uploading backup to B2', { key });
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
          database: db.database,
          'original-size': (await fs.stat(sqlPath).catch(() => ({ size: 0 }))).size.toString(),
        },
      })
    );

    logger.info('Backup uploaded', { key, size: stats.size });

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
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Delete backups older than the retention horizon under the given prefix. */
export async function cleanupOldBackups(
  retentionDays: number,
  storageLocation?: string
): Promise<number> {
  const { ListObjectsV2Command, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
  const { client, config } = await getB2Client();

  const prefix = `${backupKeyPrefix(storageLocation, config.keyName)}/`;
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
            new DeleteObjectCommand({ Bucket: config.bucketName, Key: object.Key })
          );
          logger.info('Deleted expired backup', { key: object.Key });
          deletedCount++;
        }
      }
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  return deletedCount;
}

/**
 * Restore a stored backup into an EXPLICIT target database. The caller is
 * responsible for target selection policy (see restoreBackupToScratch in
 * settings-actions.ts and the CI backup-restore-check job).
 */
export async function restoreBackupToDatabase(key: string, targetDatabaseUrl: string): Promise<void> {
  const { GetObjectCommand } = await import('@aws-sdk/client-s3');
  const { client, config } = await getB2Client();
  const target = parseDatabaseUrl(targetDatabaseUrl);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-'));
  const gzPath = path.join(tempDir, 'backup.sql.gz');
  const sqlPath = path.join(tempDir, 'backup.sql');

  try {
    logger.info('Downloading backup from B2', { key });
    const response = await client.send(
      new GetObjectCommand({ Bucket: config.bucketName, Key: key })
    );
    if (!response.Body) {
      throw new Error('Empty response from B2');
    }
    await pipeline(response.Body as Readable, createWriteStream(gzPath));

    logger.info('Decompressing backup');
    await pipeline(createReadStream(gzPath), createGunzip(), createWriteStream(sqlPath));

    logger.info('Restoring database', { database: target.database });
    await execFileAsync(
      'psql',
      ['-h', target.host, '-p', target.port, '-U', target.user, '-d', target.database, '-v', 'ON_ERROR_STOP=1', '-f', sqlPath],
      {
        env: { ...process.env, PGPASSWORD: target.password },
        maxBuffer: 1024 * 1024 * 100,
      }
    );
    logger.info('Restore completed', { database: target.database });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

const FREQUENCY_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  // Calendar months vary; 28 days guarantees at most one skipped invocation
  // under a daily cron, never a silently missed month.
  monthly: 28 * 24 * 60 * 60 * 1000,
};

export interface ScheduledBackupResult {
  ran: boolean;
  reason?: string;
  backup?: BackupInfo;
}

/**
 * #38 job-runner entry: run a backup if the stored settings say one is due.
 * Idempotent under repeated invocation (due-check against LAST_BACKUP);
 * one-shot semantics come from the SINGLE external cron calling
 * /api/jobs/run - never from per-replica boot.
 */
export async function runScheduledBackup(): Promise<ScheduledBackupResult> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SettingKey.BACKUP } });
  const parsed = backupSettingsSchema.safeParse(row?.value);
  if (!parsed.success) {
    return { ran: false, reason: 'No valid backup settings stored' };
  }
  const settings = parsed.data;

  if (!settings.enabled || settings.frequency === 'never') {
    return { ran: false, reason: 'Backups disabled' };
  }

  const interval = FREQUENCY_MS[settings.frequency];
  if (!interval) {
    return { ran: false, reason: `Unknown frequency: ${settings.frequency}` };
  }

  const lastRow = await prisma.systemSetting.findUnique({
    where: { key: SettingKey.LAST_BACKUP },
  });
  const lastTimestamp = (lastRow?.value as { timestamp?: string } | null)?.timestamp;
  if (lastTimestamp && Date.now() - new Date(lastTimestamp).getTime() < interval) {
    return { ran: false, reason: 'Not due yet' };
  }

  const backup = await executeBackup(settings);

  await prisma.systemSetting.upsert({
    where: { key: SettingKey.LAST_BACKUP },
    create: {
      key: SettingKey.LAST_BACKUP,
      value: {
        timestamp: backup.createdAt,
        filename: backup.filename,
        key: backup.key,
        size: backup.size,
      },
      description: 'Last backup information',
      isPublic: false,
    },
    update: {
      value: {
        timestamp: backup.createdAt,
        filename: backup.filename,
        key: backup.key,
        size: backup.size,
      },
    },
  });

  await cleanupOldBackups(settings.retentionDays, settings.storageLocation);

  return { ran: true, backup };
}
