/**
 * Backup Manager
 *
 * Deep module that absorbs all pg_dump, compression, S3 upload,
 * retention cleanup, and listing logic behind a 3-method interface.
 *
 * Callers (settings-actions) only see: run(), list(), cleanup().
 */

import { storageService } from './service';
import { getB2Config } from './utils';
import { getEnv } from '@/lib/utils/export';

import type { B2Config } from './schema';

export interface BackupInfo {
  filename: string;
  key: string;
  size: number;
  createdAt: string;
  url?: string;
}

export class BackupManager {
  /**
   * Execute a full backup: pg_dump → gzip → upload to object storage.
   */
  static async run(): Promise<BackupInfo> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    const { createGzip } = await import('zlib');
    const { createReadStream, createWriteStream } = await import('fs');
    const { pipeline } = await import('stream/promises');

    const execAsync = promisify(exec);

    const databaseUrl = getEnv('DATABASE_URL');
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

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

    const { format: formatDate } = await import('date-fns');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'backup-'));
    const timestamp = formatDate(new Date(), 'yyyy-MM-dd-HHmmss');
    const sqlFilename = `backup-${timestamp}.sql`;
    const gzFilename = `${sqlFilename}.gz`;
    const sqlPath = path.join(tempDir, sqlFilename);
    const gzPath = path.join(tempDir, gzFilename);

    try {
      await execAsync(
        `pg_dump -h ${host} -p ${port} -U ${user} -d ${database} --no-owner --no-acl -F p -f "${sqlPath}"`,
        {
          env: { ...process.env, PGPASSWORD: password },
          maxBuffer: 1024 * 1024 * 100,
        }
      );

      await pipeline(createReadStream(sqlPath), createGzip({ level: 9 }), createWriteStream(gzPath));

      const stats = await fs.stat(gzPath);
      const b2Config = getB2Config();

      if (stats.size > b2Config.maxFileSize) {
        throw new Error(
          `Backup size (${formatBytes(stats.size)}) exceeds maximum allowed size (${formatBytes(b2Config.maxFileSize)})`
        );
      }

      const fileContent = await fs.readFile(gzPath);
      const key = `${b2Config.keyName}/${gzFilename}`;

      const uploadedFile = await storageService.uploadFile(
        Buffer.from(fileContent),
        gzFilename,
        {
          contentType: 'application/gzip',
          metadata: {
            'backup-timestamp': new Date().toISOString(),
            database,
            'original-size': (await fs.stat(sqlPath).catch(() => ({ size: 0 }))).size.toString(),
          },
        }
      );

      const url = buildUrl(b2Config, key);

      return {
        filename: gzFilename,
        key: uploadedFile.key || key,
        size: stats.size,
        createdAt: new Date().toISOString(),
        url,
      };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => { });
    }
  }

  /**
   * List all .sql.gz backups from object storage, newest first.
   */
  static async list(): Promise<BackupInfo[]> {
    const b2Config = getB2Config();
    const prefix = `${b2Config.keyName}/`;

    const allFiles: BackupInfo[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await storageService.listFiles({
        prefix,
        ...(continuationToken && { continuationToken }),
      });

      for (const file of result.files) {
        if (file.key.endsWith('.sql.gz')) {
          const filename = file.key.split('/').pop() ?? file.key;
          allFiles.push({
            filename,
            key: file.key,
            size: file.size,
            createdAt: file.lastModified.toISOString(),
            url: buildUrl(b2Config, file.key),
          });
        }
      }

      continuationToken = result.continuationToken;
    } while (continuationToken);

    return allFiles.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  /**
   * Delete backups older than retentionDays.
   */
  static async cleanup(retentionDays: number): Promise<number> {
    const b2Config = getB2Config();
    const prefix = `${b2Config.keyName}/`;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const keysToDelete: string[] = [];
    let continuationToken: string | undefined;

    do {
      const result = await storageService.listFiles({
        prefix,
        ...(continuationToken && { continuationToken }),
      });

      for (const file of result.files) {
        if (file.lastModified < cutoffDate) {
          keysToDelete.push(file.key);
        }
      }

      continuationToken = result.continuationToken;
    } while (continuationToken);

    if (keysToDelete.length === 0) return 0;

    await storageService.deleteFiles(keysToDelete);
    return keysToDelete.length;
  }
}

function buildUrl(config: B2Config, key: string): string {
  return config.cdnUrl
    ? `${config.cdnUrl}/${key}`
    : `${config.endpoint}/${config.bucketName}/${key}`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
