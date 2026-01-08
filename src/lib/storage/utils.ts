import z from 'zod';


import type { FileInfo } from '@/types/storage';

import { getEnv } from '../utils/export';

import { STORAGE_PATHS } from './constants';
import { b2ConfigSchema } from './schema';
import { storageService } from './service';

import type { StoragePath } from './constants';
import type { B2Config} from './schema';

/**
 * Get B2 configuration from environment
 */
export function getB2Config(): B2Config {
  try {
    const cleanEndpoint = getEnv('B2_ENDPOINT').trim().replace(/\/+$/, '');
    const endpoint = cleanEndpoint.startsWith('http') ? cleanEndpoint : `https://${cleanEndpoint}`;

    const config = {
      applicationKeyId: getEnv('B2_APPLICATION_KEY_ID'),
      applicationKey: getEnv('B2_APPLICATION_KEY'),
      bucketId: getEnv('B2_BUCKET_ID'),
      bucketName: getEnv('B2_BUCKET_NAME'),
      region: getEnv('B2_REGION'),
      // region: getEnv('B2_REGION') || 'us-west-000',
      // endpoint: getEnv('B2_ENDPOINT') || `https://s3.${getEnv('B2_REGION') || 'us-west-000'}.backblazeb2.com`,
      endpoint,
      cdnUrl: getEnv('B2_CDN_URL'),
      maxFileSize: getEnv('B2_MAX_FILE_SIZE')
        ? parseInt(getEnv('B2_MAX_FILE_SIZE'))
        : 10 * 1024 * 1024,
    };

    const _config = {
      ...config,
      endpoint: config.endpoint.startsWith('http') ? config.endpoint : `https://${config.endpoint}`,
    };
    return b2ConfigSchema.parse(_config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid B2 configuration: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Convert base64 to buffer
 */
export function base64ToBuffer(base64: string): Buffer {
  // Remove data URL prefix if present
  const base64Data = base64.replace(/^data:.*?;base64,/, '');
  return Buffer.from(base64Data, 'base64');
}

/**
 * Get file extension from MIME type
 */
export function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
    'text/csv': '.csv',
  };

  return mimeToExt[mimeType] || '.bin';
}

/**
 * Upload company logo
 */
export async function uploadCompanyLogo(base64Data: string): Promise<string> {
  const buffer = base64ToBuffer(base64Data);
  const fileInfo = await storageService.uploadFile(buffer, 'logo.png', {
    path: STORAGE_PATHS.COMPANY_LOGOS,
    validateType: 'images',
    resize: {
      width: 200,
      height: 200,
      fit: 'contain',
    },
    isPublic: true,
  });

  return fileInfo.url || fileInfo.key;
}

/**
 * Upload user avatar
 */
export async function uploadUserAvatar(userId: string, base64Data: string): Promise<string> {
  const buffer = base64ToBuffer(base64Data);
  const fileInfo = await storageService.uploadFile(buffer, `avatar-${userId}.jpg`, {
    path: STORAGE_PATHS.USER_AVATARS,
    validateType: 'images',
    resize: {
      width: 150,
      height: 150,
      fit: 'cover',
    },
    isPublic: true,
  });

  return fileInfo.url || fileInfo.key;
}

/**
 * Upload document
 */
export async function uploadDocument(
  file: Buffer,
  fileName: string,
  metadata?: Record<string, string>
): Promise<FileInfo> {
  return storageService.uploadFile(file, fileName, {
    path: STORAGE_PATHS.DOCUMENTS,
    validateType: 'documents',
    ...(metadata && { metadata }),
  });
}

/**
 * Delete old files (cleanup utility)
 */
export async function deleteOldFiles(path: StoragePath, olderThanDays: number): Promise<number> {
  const { files } = await storageService.listFiles({ prefix: path });

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const filesToDelete = files.filter((file) => file.lastModified < cutoffDate);

  if (filesToDelete.length > 0) {
    await storageService.deleteFiles(filesToDelete.map((f) => f.key));
  }

  return filesToDelete.length;
}

/**
 * Helper function to upload files to storage
 */
export async function uploadToStorage(base64Data: string, folder: string): Promise<string> {
  try {
    const buffer = base64ToBuffer(base64Data);

    const storagePath =
      folder === 'logos'
        ? STORAGE_PATHS.COMPANY_LOGOS
        : folder === 'avatars'
          ? STORAGE_PATHS.USER_AVATARS
          : STORAGE_PATHS.TEMP;

    const resizeOptions =
      folder === 'logos'
        ? { width: 200, height: 200, fit: 'contain' as const }
        : folder === 'avatars'
          ? { width: 150, height: 150, fit: 'cover' as const }
          : undefined;

    // Upload file
    const fileInfo = await storageService.uploadFile(buffer, `upload-${Date.now()}.jpg`, {
      path: storagePath,
      validateType: 'images',
      ...(resizeOptions && { resize: resizeOptions }),
      isPublic: true,
    });

    return fileInfo.url || fileInfo.key;
  } catch (error) {
    console.error('Storage upload error:', error);
    throw new Error('Failed to upload file to storage');
  }
}
