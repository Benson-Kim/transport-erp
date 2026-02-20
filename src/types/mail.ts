/**
 * Email types and interfaces
 * @module email-types
 */

import type { Tag } from 'resend';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';
export type Environment = 'development' | 'staging' | 'production' | 'test';
export type EmailMetadata = Record<string, string | number | boolean | null>;
export type EmailPriority = 'high' | 'normal' | 'low';

export interface EmailConfig {
  environment: Environment;
  resendApiKey: string;
  from: {
    email: string;
    name: string;
  };
  replyTo: string;
  baseUrl: string;
  company: {
    name: string;
    address: string;
    taxId?: string;
    supportEmail: string;
    billingEmail: string;
  };
  sending: {
    enabled: boolean;
    maxRetries: number;
    retryDelay: number;
    batchSize: number;
    rateLimitPerHour?: number;
  };
  queue: {
    enabled: boolean;
  };
  logging: {
    enabled: boolean;
    debug: boolean;
  };
  restrictions: {
    allowedDomains?: string[]; // For staging - only send to specific domains
    testRecipients?: string[]; // Override recipients in dev/staging
  };
}

/**
 * Email attachment interface
 */
export interface EmailAttachment {
  filename: string;
  content?: Buffer | string;
  path?: string;
  contentType?: string;
  cid?: string; // Content ID for inline attachments
}

/**
 * Base email options interface
 */
export interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: EmailAttachment[];
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  headers?: Record<string, string>;
  priority?: EmailPriority;
  tags?: Tag[];
  metadata?: EmailMetadata;
  scheduledAt?: Date; // For scheduled sending
  trackOpens?: boolean;
  trackClicks?: boolean;
}

/**
 * Email send result interface
 */
export interface EmailSendResult {
  id: string;
  success: boolean;
  message?: string;
  error?: string;
  timestamp: Date;
}

/**
 * Email queue job interface (Database model)
 */
export interface EmailQueueRecord {
  id: string;
  template: string;
  to: string;
  data: string;
  priority: string;
  status: string;
  attempts: number;
  scheduledAt: Date | null;
  sentAt: Date | null;
  messageId: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmailLogData {
  id?: string;
  to: string;
  subject: string;
  status: 'sent' | 'failed' | 'bounced';
  error?: string;
  metadata?: EmailMetadata;
}

/**
 * Email job interface (Runtime model)
 */
export interface EmailJob {
  id: string;
  template: EmailTemplate;
  to: string | string[];
  data: EmailTemplateData;
  attempts: number;
  maxAttempts: number;
  priority: EmailPriority;
  scheduledAt?: Date;
  createdAt: Date;
  processedAt?: Date;
  error?: string;
}

/**
 * Email template data interfaces
 */
export interface VerificationEmailData {
  name: string;
  email: string;
  verificationUrl: string;
  expiresIn: string;
}

export interface PasswordResetEmailData {
  name: string;
  email: string;
  resetUrl: string;
  expiresIn: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface WelcomeEmailData {
  name: string;
  email: string;
  loginUrl: string;
  features: string[];
}

export interface InvoiceEmailData {
  recipientName: string;
  recipientEmail: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  currency: string;
  viewUrl: string;
  downloadUrl: string;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  paymentTerms?: string;
  notes?: string;
  taxId?: string;
  companyDetails?: {
    name: string;
    address: string;
    phone?: string;
    email?: string;
  };
}

export interface LoadingOrderEmailData {
  recipientName: string;
  recipientEmail: string;
  orderNumber: string;
  orderDate: string;
  services: Array<{
    serviceNumber: string;
    description: string;
    origin: string;
    destination: string;
    weight?: string;
    volume?: string;
    estimatedDelivery?: string;
  }>;
  viewUrl: string;
  downloadUrl: string;
  trackingUrl?: string;
  specialInstructions?: string;
}

export interface NotificationEmailData {
  recipientName: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  type: NotificationType;
  metadata?: EmailMetadata;
}

export interface AccountLockedEmailData {
  name: string;
  email: string;
  reason: string;
  unlockUrl: string;
  supportUrl: string;
  lockedAt: string;
}

export interface TwoFactorEmailData {
  name: string;
  email: string;
  code: string;
  expiresIn: string;
}

/**
 * Email template data type union
 */
export const EmailTemplate = {
  VERIFICATION: 'verification',
  PASSWORD_RESET: 'password-reset',
  WELCOME: 'welcome',
  INVOICE: 'invoice',
  LOADING_ORDER: 'loading-order',
  NOTIFICATION: 'notification',
  ACCOUNT_LOCKED: 'account-locked',
  TWO_FACTOR: 'two-factor',
} as const;

export type EmailTemplate = (typeof EmailTemplate)[keyof typeof EmailTemplate];

export type EmailTemplateData =
  | VerificationEmailData
  | PasswordResetEmailData
  | WelcomeEmailData
  | InvoiceEmailData
  | LoadingOrderEmailData
  | NotificationEmailData
  | AccountLockedEmailData
  | TwoFactorEmailData;
