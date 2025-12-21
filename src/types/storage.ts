import { FILE_RESTRICTIONS, StoragePath } from '@/lib/storage/constants';

/**
 * File upload options
 */
export interface UploadOptions {
  path?: StoragePath;
  fileName?: string;
  contentType?: string;
  metadata?: Record<string, string>;
  isPublic?: boolean;
  validateType?: keyof typeof FILE_RESTRICTIONS;
  resize?: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  };
}

/**
 * File information
 */
export interface FileInfo {
  key: string;
  size: number;
  contentType: string;
  lastModified: Date;
  etag?: string;
  metadata?: Record<string, string>;
  url?: string;
}

/**
 * List files options
 */
export interface ListFilesOptions {
  prefix?: string;
  maxKeys?: number;
  continuationToken?: string;
}
