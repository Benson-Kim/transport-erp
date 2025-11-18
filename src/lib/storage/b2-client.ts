// /lib/storage/b2-client.ts
import {
    S3Client,
    // HeadBucketCommand,
    ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { StorageConfigError } from './errors';
import { getB2Config } from './utils';
import { B2Config } from './schema';
import { Agent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';

/**
 * B2 Storage Client Singleton
 */
class B2StorageClient {
    private static instance: B2StorageClient;
    private client: S3Client | null = null;
    private config: B2Config;
    private initialized: boolean = false;

    private constructor() {
        this.config = getB2Config();
    }

    /**
     * Create S3 client configured for B2
     */
    private createClient(): S3Client {
        if (!this.config.applicationKeyId || !this.config.applicationKey) {
            throw new StorageConfigError('B2 credentials not configured');
        }

        console.log('Creating B2 client with config:', {
            endpoint: this.config.endpoint,
            region: this.config.region,
            bucketName: this.config.bucketName,
            hasKeyId: !!this.config.applicationKeyId,
            hasKey: !!this.config.applicationKey,
        });

        return new S3Client({
            endpoint: this.config.endpoint,
            region: this.config.region,
            credentials: {
                accessKeyId: this.config.applicationKeyId,
                secretAccessKey: this.config.applicationKey,
            },
            forcePathStyle: true, // Required for B2
            maxAttempts: 3, // Retry up to 3 times
            retryMode: 'adaptive', // Use adaptive retry strategy
            requestHandler: new NodeHttpHandler({
                connectionTimeout: 30000, // 30 seconds connection timeout
                requestTimeout: 60000, // 60 seconds request timeout
                httpAgent: new Agent({           // ← Add persistent HTTP agent
                    keepAlive: true,
                    maxSockets: 50,
                    keepAliveMsecs: 30000,
                }),
                httpsAgent: new HttpsAgent({          // ← Same for HTTPS
                    keepAlive: true,
                    maxSockets: 50,
                    keepAliveMsecs: 30000,
                }),
                throwOnRequestTimeout: true,
            }),
        });
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): B2StorageClient {
        if (!B2StorageClient.instance) {
            B2StorageClient.instance = new B2StorageClient();
        }
        return B2StorageClient.instance;
    }

    /**
     * Get S3 client
     */
    public async getClient(): Promise<S3Client> {
        if (!this.initialized || !this.client) {
            await this.initialize();
        }

        if (!this.client) {
            throw new StorageConfigError('B2 client not available');
        }
        return this.client;
    }

    /**
     * Get configuration
     */
    public getConfig(): B2Config {
        return this.config;
    }

    /**
     * Get bucket name
     */
    public getBucketName(): string {
        return this.config.bucketName;
    }

    /**
     * Get CDN URL
     */
    public getCdnUrl(): string | undefined {
        return this.config.cdnUrl;
    }

    /**
     * Test connection to B2
     */
    private async testConnection(): Promise<void> {
        if (!this.client) {
            throw new StorageConfigError('Client not initialized');
        }

        try {
            console.log(`Testing connection to bucket: ${this.config.bucketName}`);

            // Try to list objects in the bucket (limited to 1) to verify connection
            // This is more reliable than HeadBucket for B2 application keys
            const command = new ListObjectsV2Command({
                Bucket: this.config.bucketName,
                MaxKeys: 1,
            });

            const response = await this.client.send(command);
            console.log('B2 connection test successful', {
                bucketName: response.Name,
                keyCount: response.KeyCount,
            });
        } catch (error: any) {
            console.error('B2 connection test failed:', {
                error: error.message,
                code: error.Code || error.name,
                statusCode: error.$metadata?.httpStatusCode,
                bucketName: this.config.bucketName,
            });

            // Provide more specific error messages
            if (error.Code === 'InvalidAccessKeyId' || error.Code === 'SignatureDoesNotMatch') {
                throw new StorageConfigError(
                    'Invalid B2 credentials. Please check your application key ID and key.'
                );
            }
            if (error.Code === 'NoSuchBucket') {
                throw new StorageConfigError(
                    `Bucket "${this.config.bucketName}" not found. Please check your B2_BUCKET_NAME configuration.`
                );
            }
            if (error.Code === 'AccessDenied' || error.$metadata?.httpStatusCode === 403) {
                throw new StorageConfigError(
                    'Access denied. Please ensure your B2 application key has access to the bucket.'
                );
            }
            if (error.Code === 'RequestTimeout' || error.message?.includes('ECONNRESET') || error.message?.includes('ETIMEDOUT')) {
                throw new StorageConfigError(
                    `Connection to B2 failed. This could be due to:\n` +
                    `1. Network/firewall blocking the connection\n` +
                    `2. Incorrect endpoint URL (current: ${this.config.endpoint})\n` +
                    `3. B2 service temporarily unavailable`
                );
            }

            // For any other error, provide the original message
            throw new StorageConfigError(
                `Failed to connect to B2: ${error.message || 'Unknown error'}`
            );
        }
    }

    /**
     * Initialize and test connection
     */
    public async initialize(): Promise<void> {
        try {
            console.log('Initializing B2 client...');

            // Validate configuration
            if (!this.config.applicationKeyId || !this.config.applicationKey) {
                throw new StorageConfigError(
                    'B2 credentials missing. Please set B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY environment variables.'
                );
            }

            if (!this.config.bucketName) {
                throw new StorageConfigError(
                    'B2 bucket name missing. Please set B2_BUCKET_NAME environment variable.'
                );
            }

            // Validate endpoint format
            if (!this.config.endpoint.startsWith('https://')) {
                throw new StorageConfigError(
                    `Invalid B2 endpoint: ${this.config.endpoint}. It should start with "https://"`
                );
            }

            // Create client
            this.client = this.createClient();

            // Test the connection
            // await this.testConnection();

            this.initialized = true;
            console.log('B2 client initialized successfully');
        } catch (error) {
            console.error('Failed to initialize B2 client:', error);
            this.initialized = false;
            this.client = null;

            if (error instanceof StorageConfigError) {
                throw error;
            }

            throw new StorageConfigError(
                `Failed to initialize B2 storage: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
        }
    }

    /**
     * Reinitialize client
     */
    public async reinitialize(): Promise<void> {
        console.log('Reinitializing B2 client...');
        this.client = null;
        this.initialized = false;
        this.config = getB2Config();
        await this.initialize();
    }

    /**
     * Check if client is initialized
     */
    public isInitialized(): boolean {
        return this.initialized;
    }
}

export const b2Client = B2StorageClient.getInstance();