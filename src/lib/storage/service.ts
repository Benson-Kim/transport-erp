// /lib/storage/storage-service.ts
import {
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    CopyObjectCommand,
    DeleteObjectsCommand,
    type PutObjectCommandInput,
    type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import mime from 'mime-types';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { FileInfo, ListFilesOptions, UploadOptions } from '@/types/storage';
import { b2Client } from './b2-client';
import { FILE_RESTRICTIONS, StoragePath } from './constants';
import { FileNotFoundError, FileUploadError, FileValidationError, StorageError } from './errors';


/**
 * Storage Service
 */
class StorageService {
    // private bucketName = b2Client.getBucketName();
    private get bucket() {
        return b2Client.getBucketName();
    }


    /**
     * Get the S3 client (async)
     */
    private async getClient(): Promise<S3Client> {
        return await b2Client.getClient();
    }

    /**
     * Generate unique file name
     */
    private generateFileName(originalName: string, prefix?: string): string {
        const ext = path.extname(originalName);
        const timestamp = Date.now();
        const randomString = crypto.randomBytes(8).toString('hex');
        const safeName = originalName
            .replace(ext, '')
            .replace(/[^a-zA-Z0-9-_]/g, '-')
            .toLowerCase();

        const parts = [prefix, safeName, timestamp, randomString].filter(Boolean);
        return `${parts.join('-')}${ext}`;
    }

    /**
     * Get full file path
     */
    public getFilePath(fileName: string, storagePath?: StoragePath): string {
        const parts = [storagePath, fileName].filter(Boolean);
        return parts.join('/');
    }

    /**
     * Validate file
     */
    private async validateFile(
        buffer: Buffer,
        originalName: string,
        validateType?: keyof typeof FILE_RESTRICTIONS
    ): Promise<void> {
        if (!validateType) return;

        const restrictions = FILE_RESTRICTIONS[validateType];

        // Check file size
        if (buffer.length > restrictions.maxSize) {
            throw new FileValidationError(
                `File size exceeds maximum allowed size of ${restrictions.maxSize / 1024 / 1024}MB`
            );
        }

        // Check file extension
        const ext = path.extname(originalName).toLowerCase();
        if (!restrictions.extensions.includes(ext)) {
            throw new FileValidationError(
                `File type ${ext} is not allowed. Allowed types: ${restrictions.extensions.join(', ')}`
            );
        }

        // Check MIME type from file content
        const fileType = await fileTypeFromBuffer(buffer);
        if (fileType && !restrictions.mimeTypes.includes(fileType.mime)) {
            throw new FileValidationError(
                `File MIME type ${fileType.mime} is not allowed`
            );
        }
    }

    /**
     * Process image (resize, optimize)
     */
    private async processImage(
        buffer: Buffer,
        options?: UploadOptions['resize']
    ): Promise<Buffer> {
        if (!options) return buffer;

        try {
            let pipeline = sharp(buffer);

            if (options.width || options.height) {
                pipeline = pipeline.resize({
                    width: options.width,
                    height: options.height,
                    fit: options.fit || 'cover',
                    withoutEnlargement: true,
                });
            }

            // Optimize based on format
            const metadata = await sharp(buffer).metadata();
            if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
                pipeline = pipeline.jpeg({ quality: 85, progressive: true });
            } else if (metadata.format === 'png') {
                pipeline = pipeline.png({ quality: 85, compressionLevel: 9 });
            } else if (metadata.format === 'webp') {
                pipeline = pipeline.webp({ quality: 85 });
            }

            return await pipeline.toBuffer();
        } catch (error) {
            console.error('Image processing error:', error);
            return buffer; // Return original if processing fails
        }
    }

    /**
     * Upload file from buffer
     */
    public async uploadFile(
        buffer: Buffer,
        originalName: string,
        options: UploadOptions = {}
    ): Promise<FileInfo> {
        try {
            // Validate file
            await this.validateFile(buffer, originalName, options.validateType);

            // Process image if needed
            let processedBuffer = buffer;
            if (options.resize && options.validateType === 'images') {
                processedBuffer = await this.processImage(buffer, options.resize);
            }

            // Generate file name and path
            const fileName = options.fileName || this.generateFileName(originalName);
            const key = this.getFilePath(fileName, options.path);

            // Determine content type
            const contentType =
                options.contentType ||
                mime.lookup(originalName) ||
                'application/octet-stream';

            // Prepare upload parameters
            const uploadParams: PutObjectCommandInput = {
                Bucket: this.bucket,
                Key: key,
                Body: processedBuffer,
                ContentType: contentType,
                Metadata: {
                    ...options.metadata,
                    originalName,
                    uploadedAt: new Date().toISOString(),
                },
                CacheControl: options.isPublic ? 'public, max-age=31536000' : 'private',
            };

            // // Get client with retry logic for connection errors
            // let client: S3Client;
            // let retries = 0;
            // const maxRetries = 3;

            // while (retries < maxRetries) {
            //     try {
            //         client = await this.getClient();
            //         break;
            //     } catch (error) {
            //         retries++;
            //         console.error(`Failed to get B2 client (attempt ${retries}/${maxRetries}):`, error);

            //         if (retries >= maxRetries) {
            //             throw new StorageError(
            //                 'Failed to connect to B2 storage after multiple attempts',
            //                 'CONNECTION_FAILED',
            //                 503,
            //                 { originalError: error }
            //             );
            //         }

            //         // Wait before retrying (exponential backoff)
            //         await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retries)));

            //         // Try to reinitialize the client
            //         if (retries === 2) {
            //             console.log('Attempting to reinitialize B2 client...');
            //             await b2Client.reinitialize();
            //         }
            //     }
            // }

            // // Upload to B2 with timeout
            // const uploadPromise = client!.send(new PutObjectCommand(uploadParams));
            // const timeoutPromise = new Promise((_, reject) =>
            //     setTimeout(() => reject(new Error('Upload timeout after 60 seconds')), 60000)
            // );

            // await Promise.race([uploadPromise, timeoutPromise]);

            const client = await this.getClient();

            // THIS IS THE NEW, BULLETPROOF UPLOADER
            const upload = new Upload({
                client,
                params: uploadParams,
                queueSize: 4,
                partSize: 10 * 1024 * 1024, // 10 MB parts (safe for B2)
                leavePartsOnError: false,
            });

            const result = await upload.done();

            // Get file info
            const fileInfo: FileInfo = {
                key,
                size: processedBuffer.length,
                contentType,
                lastModified: new Date(),
                ...(result.ETag && { etag: result.ETag?.replace(/"/g, '') }),
                ...(uploadParams.Metadata && { metadata: uploadParams.Metadata }),
            };

            // Add public URL if available
            if (options.isPublic && b2Client.getCdnUrl()) {
                fileInfo.url = `${b2Client.getCdnUrl()}/${key}`;
            }

            return fileInfo;
        } catch (error: any) {
            // Log detailed error information
            console.error('Upload error details:', {
                errorMessage: error.message,
                errorCode: error.Code,
                statusCode: error.$metadata?.httpStatusCode,
                originalName,
                bufferSize: buffer.length,
            });

            if (error instanceof StorageError) {
                throw error;
            }

            // Provide more specific error messages
            if (error.message?.includes('ECONNRESET') || error.message?.includes('ETIMEDOUT')) {
                throw new FileUploadError(
                    'Connection to storage service was lost. Please try again.',
                    { originalName, error }
                );
            }

            if (error.message?.includes('timeout')) {
                throw new FileUploadError(
                    'Upload timed out. The file might be too large or the connection is slow.',
                    { originalName, error }
                );
            }

            throw new FileUploadError(
                `Failed to upload file: ${error.message || 'Unknown error'}`,
                { originalName, error }
            );
        }
    }

    /**
     * Upload file from path (for large files)
     */
    public async uploadLargeFile(
        filePath: string,
        options: UploadOptions = {}
    ): Promise<FileInfo> {
        try {
            // Get file stats
            const stats = await stat(filePath);
            const originalName = path.basename(filePath);

            // Generate file name and key
            const fileName = options.fileName || this.generateFileName(originalName);
            const key = this.getFilePath(fileName, options.path);

            // Determine content type
            const contentType =
                options.contentType ||
                mime.lookup(filePath) ||
                'application/octet-stream';

            // Get client
            const client = await this.getClient();

            // Use multipart upload for large files
            const upload = new Upload({
                client,
                params: {
                    Bucket: this.bucket,
                    Key: key,
                    Body: createReadStream(filePath),
                    ContentType: contentType,
                    Metadata: {
                        ...options.metadata,
                        originalName,
                        uploadedAt: new Date().toISOString(),
                    },
                },
                partSize: 5 * 1024 * 1024, // 5MB parts
                queueSize: 4, // Concurrent parts
            });

            // Track progress
            upload.on('httpUploadProgress', (progress) => {
                if (progress.loaded && progress.total) {
                    const percentage = Math.round((progress.loaded / progress.total) * 100);
                    console.log(`Upload progress: ${percentage}%`);
                }
            });

            await upload.done();

            return {
                key,
                size: stats.size,
                contentType,
                lastModified: new Date(),
                url: `${b2Client.getCdnUrl()}/${key}`
            };
        } catch (error) {
            throw new FileUploadError(
                `Failed to upload large file: ${error instanceof Error ? error.message : 'Unknown error'}`,
                { filePath, error }
            );
        }
    }

    /**
     * Get file
     */
    public async getFile(key: string): Promise<Buffer> {
        try {
            const client = await this.getClient();
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });

            const response = await client.send(command);

            if (!response.Body) {
                throw new FileNotFoundError(key);
            }

            const chunks: Uint8Array[] = [];
            for await (const chunk of response.Body as any) {
                chunks.push(chunk);
            }

            return Buffer.concat(chunks);
        } catch (error: any) {
            if (error.Code === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
                throw new FileNotFoundError(key);
            }
            throw new StorageError(
                `Failed to get file: ${error.message}`,
                'FILE_GET_FAILED',
                500,
                { key, error }
            );
        }
    }

    /**
     * Get file info
     */
    public async getFileInfo(key: string): Promise<FileInfo> {
        try {
            const client = await this.getClient();
            const command = new HeadObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });

            const response = await client.send(command);

            return {
                key,
                size: response.ContentLength || 0,
                contentType: response.ContentType || 'application/octet-stream',
                lastModified: response.LastModified || new Date(),
                ...(response.ETag && { etag: response.ETag }),
                ...(response.Metadata && { metadata: response.Metadata }),
            };
        } catch (error: any) {
            if (error.Code === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
                throw new FileNotFoundError(key);
            }
            throw new StorageError(
                `Failed to get file info: ${error.message}`,
                'FILE_INFO_FAILED',
                500,
                { key, error }
            );
        }
    }

    /**
     * Delete file
     */
    public async deleteFile(key: string): Promise<void> {
        try {
            const client = await this.getClient();
            const command = new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: key,
            });

            await client.send(command);
        } catch (error: any) {
            // B2 doesn't return error for non-existent files
            if (error.Code === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
                return; // File already deleted
            }
            throw new StorageError(
                `Failed to delete file: ${error.message}`,
                'FILE_DELETE_FAILED',
                500,
                { key, error }
            );
        }
    }

    /**
     * Delete multiple files
     */
    public async deleteFiles(keys: string[]): Promise<void> {
        if (keys.length === 0) return;

        try {
            const client = await this.getClient();
            const command = new DeleteObjectsCommand({
                Bucket: this.bucket,
                Delete: {
                    Objects: keys.map(key => ({ Key: key })),
                    Quiet: true,
                },
            });

            await client.send(command);
        } catch (error: any) {
            throw new StorageError(
                `Failed to delete files: ${error.message}`,
                'FILES_DELETE_FAILED',
                500,
                { keys, error }
            );
        }
    }

    /**
     * Copy file
     */
    public async copyFile(sourceKey: string, destinationKey: string): Promise<FileInfo> {
        try {
            const client = await this.getClient();
            const command = new CopyObjectCommand({
                Bucket: this.bucket,
                CopySource: `${this.bucket}/${sourceKey}`,
                Key: destinationKey,
            });

            await client.send(command);

            return this.getFileInfo(destinationKey);
        } catch (error: any) {
            if (error.Code === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
                throw new FileNotFoundError(sourceKey);
            }
            throw new StorageError(
                `Failed to copy file: ${error.message}`,
                'FILE_COPY_FAILED',
                500,
                { sourceKey, destinationKey, error }
            );
        }
    }

    /**
     * Move file
     */
    public async moveFile(sourceKey: string, destinationKey: string): Promise<FileInfo> {
        try {
            const fileInfo = await this.copyFile(sourceKey, destinationKey);
            await this.deleteFile(sourceKey);
            return fileInfo;
        } catch (error) {
            throw new StorageError(
                `Failed to move file: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'FILE_MOVE_FAILED',
                500,
                { sourceKey, destinationKey, error }
            );
        }
    }

    /**
     * List files
     */
    public async listFiles(options: ListFilesOptions = {}): Promise<{
        files: FileInfo[];
        continuationToken?: string;
    }> {
        try {
            const client = await this.getClient();
            const command = new ListObjectsV2Command({
                Bucket: this.bucket,
                Prefix: options.prefix,
                MaxKeys: options.maxKeys || 1000,
                ContinuationToken: options.continuationToken,
            });

            const response = await client.send(command);

            const files: FileInfo[] = (response.Contents || []).map(item => ({
                key: item.Key!,
                size: item.Size || 0,
                contentType: 'application/octet-stream', // B2 doesn't return this in list
                lastModified: item.LastModified || new Date(),
                ...(item.ETag && { etag: item.ETag }),
            }));

            return {
                files,
                ...(response.NextContinuationToken && {
                    continuationToken: response.NextContinuationToken,
                }),
            };
        } catch (error: any) {
            throw new StorageError(
                `Failed to list files: ${error.message}`,
                'FILE_LIST_FAILED',
                500,
                { options, error }
            );
        }
    }

    /**
     * Ensure directory exists (B2 doesn't have real directories, this is for compatibility)
     */
    public async ensureDirectory(directory: string): Promise<void> {
        // In B2, directories don't exist - they're just key prefixes
        // This method is here for API compatibility
        console.log(`Directory ensured: ${directory}`);
    }

    /**
     * Generate presigned URL for direct upload
     */
    public async getPresignedUploadUrl(
        key: string,
        contentType: string,
        expiresIn: number = 3600
    ): Promise<string> {
        try {
            const client = await this.getClient();
            const command = new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                ContentType: contentType,
            });

            return await getSignedUrl(client, command, { expiresIn });
        } catch (error: any) {
            throw new StorageError(
                `Failed to generate upload URL: ${error.message}`,
                'PRESIGNED_URL_FAILED',
                500,
                { key, error }
            );
        }
    }

    /**
     * Generate presigned URL for download
     */
    public async getPresignedDownloadUrl(
        key: string,
        expiresIn: number = 3600,
        fileName?: string
    ): Promise<string> {
        try {
            const client = await this.getClient();
            const command = new GetObjectCommand({
                Bucket: this.bucket,
                Key: key,
                ResponseContentDisposition: fileName
                    ? `attachment; filename="${fileName}"`
                    : undefined,
            });

            return await getSignedUrl(client, command, { expiresIn });
        } catch (error: any) {
            throw new StorageError(
                `Failed to generate download URL: ${error.message}`,
                'PRESIGNED_URL_FAILED',
                500,
                { key, error }
            );
        }
    }
}

export const storageService = new StorageService();