// /lib/storage/b2-client.ts
import { Agent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';

import { S3Client } from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';

import { logger } from '@/lib/logger';

import { StorageConfigError } from './errors';
import { getB2Config } from './utils';

import type { B2Config } from './schema';

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

    // #42/#58: no config values in logs - presence flags only.
    logger.debug('Creating B2 client', {
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
        httpAgent: new Agent({
          // ← Add persistent HTTP agent
          keepAlive: true,
          maxSockets: 50,
          keepAliveMsecs: 30000,
        }),
        httpsAgent: new HttpsAgent({
          // ← Same for HTTPS
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
   * Initialize and test connection
   */
  public async initialize(): Promise<void> {
    try {
      logger.debug('Initializing B2 client');

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

      // Connection test is deferred to first real operation (issue #49).

      this.initialized = true;
      logger.info('B2 client initialized');
    } catch (error) {
      logger.error('Failed to initialize B2 client', {
        error: error instanceof Error ? error.message : String(error),
      });
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
    logger.info('Reinitializing B2 client');
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

// #58: LAZY facade. `export const b2Client = B2StorageClient.getInstance()`
// constructed B2 config AT IMPORT TIME, so one unset B2_* variable crashed
// every route whose module graph touched storage. Instantiation now happens
// on FIRST USE: with B2 unconfigured the app boots and only the storage-
// dependent feature surfaces a StorageConfigError.
function singleton(): B2StorageClient {
  return B2StorageClient.getInstance();
}

export const b2Client = {
  getClient: () => singleton().getClient(),
  getConfig: () => singleton().getConfig(),
  getBucketName: () => singleton().getBucketName(),
  getCdnUrl: () => singleton().getCdnUrl(),
  initialize: () => singleton().initialize(),
  reinitialize: () => singleton().reinitialize(),
  isInitialized: () => singleton().isInitialized(),
};
