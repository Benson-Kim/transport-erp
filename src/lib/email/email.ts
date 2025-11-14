/**
 * Email Service
 * Handles all email sending functionality with multiple provider support
 */

import nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import { render } from '@react-email/components';

import {
  VerificationEmailTemplate,
  PasswordResetEmailTemplate,
  WelcomeEmailTemplate,
  InvoiceEmailTemplate,
  LoadingOrderEmailTemplate,
  NotificationEmailTemplate,
} from './email-templates';
import { EmailConfig, emailConfigSchema } from '../validations/mail-schema';
import { EmailOptions, InvoiceEmailData, LoadingOrderEmailData, NotificationEmailData, PasswordResetEmailData, VerificationEmailData, WelcomeEmailData } from '@/types/mail';


/**
 * Email Service Class
 */
class EmailService {
  private transporter: Transporter | null = null;
  private config: EmailConfig;
  private emailQueue: EmailOptions[] = [];
  private processing = false;

  constructor() {
    this.config = this.loadConfig();
    this.initializeTransporter();
  }

  /**
   * Load email configuration from environment
   */
  private loadConfig(): EmailConfig {
    const config: EmailConfig = {
      from: process.env['EMAIL_FROM'] || 'noreply@enterprise-dashboard.com',
      replyTo: process.env['EMAIL_REPLY_TO'],
      provider: (process.env['EMAIL_PROVIDER'] as EmailConfig['provider']) || 'smtp',
      smtp: {
        host: process.env['EMAIL_SERVER_HOST'] || 'localhost',
        port: parseInt(process.env['EMAIL_SERVER_PORT'] || '587'),
        secure: process.env['EMAIL_SERVER_PORT'] === '465',
        auth: {
          user: process.env['EMAIL_SERVER_USER'] || '',
          pass: process.env['EMAIL_SERVER_PASSWORD'] || '',
        },
      },
    };

    // Add provider-specific configurations
    if (config.provider === 'sendgrid') {
      config.sendgrid = {
        apiKey: process.env['SENDGRID_API_KEY'] || '',
      };
    } else if (config.provider === 'resend') {
      config.resend = {
        apiKey: process.env['RESEND_API_KEY'] || '',
      };
    } else if (config.provider === 'aws-ses') {
      config.awsSes = {
        region: process.env['AWS_REGION'] || 'us-east-1',
        accessKeyId: process.env['AWS_ACCESS_KEY_ID'] || '',
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] || '',
      };
    }

    return emailConfigSchema.parse(config);
  }

  /**
   * Initialize email transporter based on provider
   */
  private async initializeTransporter(): Promise<void> {
    try {
      switch (this.config.provider) {
        case 'smtp':
          this.transporter = nodemailer.createTransport(this.config.smtp!);
          break;

        case 'sendgrid':
          // For SendGrid, we use SMTP with their settings
          this.transporter = nodemailer.createTransport({
            host: 'smtp.sendgrid.net',
            port: 587,
            auth: {
              user: 'apikey',
              pass: this.config.sendgrid!.apiKey,
            },
          });
          break;

        case 'resend':
          // For Resend, we'll use their API directly
          // This is a placeholder - implement Resend API integration
          this.transporter = nodemailer.createTransport({
            host: 'smtp.resend.com',
            port: 587,
            auth: {
              user: 'resend',
              pass: this.config.resend!.apiKey,
            },
          });
          break;

        case 'aws-ses':
          // For AWS SES, configure with AWS SDK
          // This is a placeholder - implement AWS SES integration
          // const aws = await import('@aws-sdk/client-ses');
          // const ses = new aws.SES({
          //   region: this.config.awsSes!.region,
          //   credentials: {
          //     accessKeyId: this.config.awsSes!.accessKeyId,
          //     secretAccessKey: this.config.awsSes!.secretAccessKey,
          //   },
          // });
          // Create nodemailer SES transport
          break;

        default:
          throw new Error(`Unsupported email provider: ${this.config.provider}`);
      }

      // Verify connection
      if (this.transporter && process.env['NODE_ENV'] === 'production') {
        await this.transporter.verify();
        console.log('Email service connected successfully');
      }
    } catch (error) {
      console.error('Email service initialization failed:', error);
      // In development, create a test account
      if (process.env['NODE_ENV'] === 'development') {
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        console.log('Using Ethereal test email account');
      }
    }
  }

  /**
   * Send an email
   */
  async send(
    options: EmailOptions
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!this.transporter) {
        throw new Error('Email transporter not initialized');
      }

      // Prepare email options
      const mailOptions = {
        from: this.config.from,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        html: options.html,
        text: options.text || this.extractTextFromHtml(options.html || ''),
        cc: options.cc
          ? Array.isArray(options.cc)
            ? options.cc.join(', ')
            : options.cc
          : undefined,
        bcc: options.bcc
          ? Array.isArray(options.bcc)
            ? options.bcc.join(', ')
            : options.bcc
          : undefined,
        replyTo: options.replyTo || this.config.replyTo,
        attachments: options.attachments,
        headers: options.headers,
        priority: options.priority,
      };

      // Send email
      const info = await this.transporter.sendMail(mailOptions);

      // Log in development
      if (process.env['NODE_ENV'] === 'development') {
        console.log('Email sent:', info.messageId);
        console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
      }

      // Log email sent event
      await this.logEmailEvent({
        messageId: info.messageId,
        to: options.to,
        subject: options.subject,
        status: 'sent',
        tags: options.tags,
        metadata: options.metadata,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      console.error('Email send error:', error);

      // Log email failed event
      await this.logEmailEvent({
        to: options.to,
        subject: options.subject,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        tags: options.tags,
        metadata: options.metadata,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email',
      };
    }
  }

  /**
   * Queue an email for sending
   */
  async queueEmail(options: EmailOptions): Promise<void> {
    this.emailQueue.push(options);
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Process email queue
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.emailQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.emailQueue.length > 0) {
      const email = this.emailQueue.shift();
      if (email) {
        await this.send(email);
        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    this.processing = false;
  }

  /**
   * Extract text from HTML
   */
  private extractTextFromHtml(html: string): string {
    // Simple HTML to text conversion
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Log email event for tracking
   */
  private async logEmailEvent(event: {
    messageId?: string | undefined;
    to: string | string[];
    subject: string;
    status: 'sent' | 'failed' | 'bounced' | 'delivered' | 'opened' | 'clicked';
    error?: string | undefined;
    tags?: string[] | undefined;
    metadata?: Record<string, any> | undefined;
  }): Promise<void> {
    console.log('Email event:', event);
  }

  /**
   * Send verification email
   */
  async sendVerificationEmail(
    to: string,
    data: VerificationEmailData
  ): Promise<{ success: boolean; error?: string }> {
    const html = await render(VerificationEmailTemplate(data));

    return this.send({
      to,
      subject: 'Verify your email address',
      html,
      tags: ['verification'],
      metadata: { userId: data.email },
      priority: 'high',
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    to: string,
    data: PasswordResetEmailData
  ): Promise<{ success: boolean; error?: string }> {
    const html = await render(PasswordResetEmailTemplate(data));

    return this.send({
      to,
      subject: 'Reset your password',
      html,
      tags: ['password-reset'],
      metadata: { userId: data.email },
      priority: 'high',
    });
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(
    to: string,
    data: WelcomeEmailData
  ): Promise<{ success: boolean; error?: string }> {
    const html = await render(WelcomeEmailTemplate(data));

    return this.send({
      to,
      subject: 'Welcome to Enterprise Dashboard!',
      html,
      tags: ['welcome'],
      metadata: { userId: data.email },
    });
  }

  /**
   * Send invoice email
   */
  async sendInvoiceEmail(
    to: string,
    data: InvoiceEmailData,
    attachments?: EmailOptions['attachments']
  ): Promise<{ success: boolean; error?: string }> {
    const html = await render(InvoiceEmailTemplate(data));

    return this.send({
      to,
      subject: `Invoice ${data.invoiceNumber} - ${data.totalAmount} ${data.currency}`,
      html,
      attachments,
      tags: ['invoice'],
      metadata: {
        invoiceNumber: data.invoiceNumber,
        recipientEmail: data.recipientEmail,
      },
    });
  }

  /**
   * Send loading order email
   */
  async sendLoadingOrderEmail(
    to: string,
    data: LoadingOrderEmailData,
    attachments?: EmailOptions['attachments']
  ): Promise<{ success: boolean; error?: string }> {
    const html = await render(LoadingOrderEmailTemplate(data));

    return this.send({
      to,
      subject: `Loading Order ${data.orderNumber}`,
      html,
      attachments,
      tags: ['loading-order'],
      metadata: {
        orderNumber: data.orderNumber,
        recipientEmail: data.recipientEmail,
      },
    });
  }

  /**
   * Send notification email
   */
  async sendNotificationEmail(
    to: string,
    data: NotificationEmailData
  ): Promise<{ success: boolean; error?: string }> {
    const html = await render(NotificationEmailTemplate(data));

    return this.send({
      to,
      subject: data.title,
      html,
      tags: ['notification', data.type],
      priority: data.type === 'error' ? 'high' : 'normal',
    });
  }

  /**
   * Send bulk emails
   */
  async sendBulk(
    emails: Array<{
      to: string;
      data: any;
      template: 'verification' | 'password-reset' | 'welcome' | 'invoice' | 'notification';
    }>
  ): Promise<Array<{ to: string; success: boolean; error?: string }>> {
    const results = [];

    for (const email of emails) {
      let result;

      switch (email.template) {
        case 'verification':
          result = await this.sendVerificationEmail(email.to, email.data);
          break;
        case 'password-reset':
          result = await this.sendPasswordResetEmail(email.to, email.data);
          break;
        case 'welcome':
          result = await this.sendWelcomeEmail(email.to, email.data);
          break;
        case 'invoice':
          result = await this.sendInvoiceEmail(email.to, email.data);
          break;
        case 'notification':
          result = await this.sendNotificationEmail(email.to, email.data);
          break;
        default:
          result = { success: false, error: 'Unknown template' };
      }

      results.push({
        to: email.to,
        ...result,
      });

      // Add delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return results;
  }

  /**
   * Validate email address
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Sanitize email address
   */
  sanitizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }
}

// Export singleton instance
export const emailService = new EmailService();

// Export helper functions
export const sendVerificationEmail = (email: string, token: string) => {
  const verificationUrl = `${process.env['NEXT_PUBLIC_APP_URL']}/verify-email?token=${token}`;

  return emailService.sendVerificationEmail(email, {
    name: email.split('@')[0] ?? 'User', // Fallback name
    email,
    verificationUrl,
    expiresIn: '24 hours',
  });
};

export const sendPasswordResetEmail = (email: string, token: string) => {
  const resetUrl = `${process.env['NEXT_PUBLIC_APP_URL']}/reset-password?token=${token}`;

  return emailService.sendPasswordResetEmail(email, {
    name: email.split('@')[0] ?? 'User', // Fallback name
    email,
    resetUrl,
    expiresIn: '1 hour',
  });
};

export const sendWelcomeEmail = (email: string, name: string) => {
  return emailService.sendWelcomeEmail(email, {
    name,
    email,
    loginUrl: `${process.env['NEXT_PUBLIC_APP_URL']}/login`,
    features: [
      'Complete service management',
      'Client and supplier tracking',
      'Invoice generation',
      'Real-time reporting',
      'Document management',
    ],
  });
};
