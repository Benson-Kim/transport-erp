/**
 * Email Service
 * Environment-aware email handling with React Email templates
 */

import { type CreateEmailOptions, Resend } from 'resend';
import { render } from '@react-email/render';
import * as React from 'react';

import prisma from '@/lib/prisma/prisma';
import { getEmailConfig } from './config';
import {
  VerificationEmailTemplate,
  PasswordResetEmailTemplate,
  WelcomeEmailTemplate,
  InvoiceEmailTemplate,
  LoadingOrderEmailTemplate,
  NotificationEmailTemplate,
  TwoFactorEmailTemplate,
  AccountLockedEmailTemplate,
} from './email-templates';

import type {
  EmailConfig,
  EmailOptions,
  EmailSendResult,
  EmailTemplate,
  EmailTemplateData,
  EmailPriority,
  EmailQueueRecord,
  EmailLogData,
  // VerificationEmailData,
  // PasswordResetEmailData,
  // WelcomeEmailData,
  InvoiceEmailData,
  LoadingOrderEmailData,
  NotificationEmailData,
  // TwoFactorEmailData,
  // AccountLockedEmailData,
} from '@/types/mail';

/**
 * Email Service Class
 * Singleton with environment-aware sending, queuing, retries, and logging
 */
export class EmailService {
  private static instance: EmailService;
  private config: EmailConfig;
  private resend: Resend | null = null;

  private constructor() {
    this.config = getEmailConfig();

    if (this.config.resendApiKey) {
      this.resend = new Resend(this.config.resendApiKey);
    }
  }

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  /**
   * Reload config (useful for testing)
   */
  public reloadConfig(): void {
    this.config = getEmailConfig();
    this.resend = this.config.resendApiKey
      ? new Resend(this.config.resendApiKey)
      : null;
  }

  /**
   * Send email with template
   */
  public async sendTemplate<T extends EmailTemplateData>(
    template: EmailTemplate,
    to: string | string[],
    data: T,
    options?: Partial<EmailOptions>
  ): Promise<EmailSendResult> {
    try {
      const html = await this.renderTemplate(template, data);
      const subject = this.getTemplateSubject(template, data);

      return await this.send({
        to,
        subject,
        html,
        ...options,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `Template send error [${template}]:`, errorMessage);

      return {
        id: '',
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }


  /**
   * Send raw email with environment guards
   */
  public async send(options: EmailOptions): Promise<EmailSendResult> {
    try {
      const recipients = this.resolveRecipients(options.to);

      // No valid recipients after filtering
      if (recipients.length === 0) {
        const msg = 'No valid recipients after environment filtering';
        this.log('warn', msg, { original: options.to });

        return {
          id: '',
          success: true,
          message: msg,
          timestamp: new Date(),
        };
      }

      // Debug logging
      if (this.config.logging.debug) {
        this.log('debug', 'Sending email:', {
          to: recipients,
          subject: options.subject,
          environment: this.config.environment,
          sendingEnabled: this.config.sending.enabled,
        });
      }

      // If sending is disabled, log and return success
      if (!this.config.sending.enabled) {
        this.log(
          'info',
          `[${this.config.environment}] Email not sent (sending disabled):`,
          { to: recipients, subject: options.subject }
        );

        // Still log to DB if logging is enabled
        if (this.config.logging.enabled) {
          await this.logEmail({
            to: recipients.join(', '),
            subject: options.subject,
            status: 'sent',
            metadata: {
              ...options.metadata,
              environment: this.config.environment,
              simulated: true,
            },
          });
        }

        return {
          id: `sim_${Date.now()}`,
          success: true,
          message: `Email simulated in ${this.config.environment}`,
          timestamp: new Date(),
        };
      }

      // Validate Resend client
      if (!this.resend) {
        throw new Error(
          'Resend API key not configured. Set RESEND_API_KEY environment variable.'
        );
      }

      // Build payload
      const cc = options.cc
        ? Array.isArray(options.cc)
          ? options.cc
          : [options.cc]
        : undefined;
      const bcc = options.bcc
        ? Array.isArray(options.bcc)
          ? options.bcc
          : [options.bcc]
        : undefined;

      const payload: CreateEmailOptions = {
        from: `${this.config.from.name} <${this.config.from.email}>`,
        to: recipients,
        cc,
        bcc,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo || this.config.replyTo,
        headers: options.headers,
        attachments: options.attachments,
        tags: options.tags,
      } as CreateEmailOptions & ({ html: string } | { text: string });

      const { data, error } = await this.resend.emails.send(payload);

      if (error) {
        throw new Error(error.message);
      }

      // Log success
      if (this.config.logging.enabled) {
        await this.logEmail({
          id: data?.id || '',
          to: recipients.join(', '),
          subject: options.subject,
          status: 'sent',
          metadata: options.metadata ?? {},
        });
      }

      return {
        id: data?.id || '',
        success: true,
        message: 'Email sent successfully',
        timestamp: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.log('error', 'Email send error:', errorMessage);

      if (this.config.logging.enabled) {
        await this.logEmail({
          to: Array.isArray(options.to)
            ? options.to.join(', ')
            : options.to,
          subject: options.subject,
          status: 'failed',
          error: errorMessage,
          metadata: options.metadata ?? {},
        });
      }

      return {
        id: '',
        success: false,
        error: errorMessage,
        timestamp: new Date(),
      };
    }
  }


  /**
   * Send email batch with rate limiting
   */
  public async sendBatch(
    emails: EmailOptions[]
  ): Promise<EmailSendResult[]> {
    const results: EmailSendResult[] = [];
    const { batchSize } = this.config.sending;

    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map((email) => this.send(email))
      );
      results.push(...batchResults);

      // Rate limit between batches
      if (i + batchSize < emails.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results;
  }


  /**
   * Queue email for later sending
   */
  public async queueEmail<T extends EmailTemplateData>(
    template: EmailTemplate,
    to: string | string[],
    data: T,
    scheduledAt?: Date,
    priority: EmailPriority = 'normal'
  ): Promise<string> {
    if (!this.config.queue.enabled) {
      // If queuing is disabled, send immediately
      await this.sendTemplate(template, to, data);
      return `immediate_${Date.now()}`;
    }

    const job = await prisma.emailQueue.create({
      data: {
        template,
        to: Array.isArray(to) ? to.join(',') : to,
        data: JSON.stringify(data),
        priority,
        scheduledAt: scheduledAt ?? null,
        status: 'pending',
      },
    });

    return job.id;
  }

  /**
   * Process email queue
   */
  public async processQueue(): Promise<{ processed: number; failed: number }> {
    const jobs = await prisma.emailQueue.findMany({
      where: {
        status: 'pending',
        OR: [
          { scheduledAt: null },
          { scheduledAt: { lte: new Date() } },
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
      take: this.config.sending.batchSize,
    });

    let processed = 0;
    let failed = 0;

    for (const job of jobs) {
      const success = await this.processQueueJob(
        job as EmailQueueRecord
      );
      if (success) processed++;
      else failed++;
    }

    return { processed, failed };
  }


  /**
   * Resolve and filter recipients based on environment
   */
  private resolveRecipients(to: string | string[]): string[] {
    let recipients = Array.isArray(to) ? to : [to];
    const { restrictions } = this.config;

    // In dev/staging with test recipients configured, override all recipients
    if (Array.isArray(restrictions.testRecipients) && restrictions.testRecipients.length > 0) {
      this.log(
        'info',
        `Redirecting emails to test recipients:`,
        {
          original: recipients,
          redirected: restrictions.testRecipients,
        }
      );
      return restrictions.testRecipients;
    }

    // In staging with allowed domains, filter recipients
    const allowedDomains = restrictions.allowedDomains;

    if (Array.isArray(allowedDomains) && allowedDomains.length > 0) {
      const filtered = recipients.filter((email) =>
        allowedDomains.some((domain) =>
          email.toLowerCase().endsWith(domain.toLowerCase())
        )
      );

      if (filtered.length < recipients.length) {
        this.log('warn', 'Recipients filtered by domain restriction:', {
          original: recipients,
          filtered,
          allowedDomains: restrictions.allowedDomains,
        });
      }

      return filtered;
    }

    return recipients;
  }

  /**
   * Process single queue job
   */
  private async processQueueJob(job: EmailQueueRecord): Promise<boolean> {
    try {
      await prisma.emailQueue.update({
        where: { id: job.id },
        data: {
          status: 'processing',
          attempts: { increment: 1 },
        },
      });

      const parsedData = JSON.parse(job.data) as EmailTemplateData;
      const recipients = job.to.includes(',')
        ? job.to.split(',').map((s) => s.trim())
        : job.to;

      const result = await this.sendTemplate(
        job.template as EmailTemplate,
        recipients,
        parsedData
      );

      if (result.success) {
        await prisma.emailQueue.update({
          where: { id: job.id },
          data: {
            status: 'sent',
            sentAt: new Date(),
            messageId: result.id,
          },
        });
        return true;
      }

      // Retry logic
      const currentAttempts = job.attempts + 1;
      if (currentAttempts < this.config.sending.maxRetries) {
        await prisma.emailQueue.update({
          where: { id: job.id },
          data: {
            status: 'pending',
            error: result.error ?? 'Send failed, retrying',
            scheduledAt: new Date(
              Date.now() +
              this.config.sending.retryDelay * currentAttempts
            ),
          },
        });
      } else {
        await prisma.emailQueue.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            error: result.error ?? 'Max retries reached',
          },
        });
      }

      return false;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.log('error', 'Queue job error:', errorMessage);

      await prisma.emailQueue.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: errorMessage,
        },
      });

      return false;
    }
  }

  /**
   * Render email template to HTML
   */
  private async renderTemplate(
    template: EmailTemplate,
    data: EmailTemplateData
  ): Promise<string> {
    const templateMap: Record<
      EmailTemplate,
      React.ComponentType<any>
    > = {
      verification: VerificationEmailTemplate,
      'password-reset': PasswordResetEmailTemplate,
      welcome: WelcomeEmailTemplate,
      invoice: InvoiceEmailTemplate,
      'loading-order': LoadingOrderEmailTemplate,
      notification: NotificationEmailTemplate,
      'two-factor': TwoFactorEmailTemplate,
      'account-locked': AccountLockedEmailTemplate,
    };

    const Component = templateMap[template];
    if (!Component) {
      throw new Error(`Unknown email template: ${template}`);
    }

    return render(React.createElement(Component, data));
  }

  /**
   * Get subject line for template
   */
  private getTemplateSubject(
    template: EmailTemplate,
    data: EmailTemplateData
  ): string {
    const { name } = this.config.company;

    const subjects: Record<EmailTemplate, () => string> = {
      verification: () => `Verify your email address — ${name}`,
      'password-reset': () => `Reset your password — ${name}`,
      welcome: () => `Welcome to ${name}!`,
      invoice: () =>
        `Invoice ${(data as InvoiceEmailData).invoiceNumber}`,
      'loading-order': () =>
        `Loading Order ${(data as LoadingOrderEmailData).orderNumber}`,
      notification: () => (data as NotificationEmailData).title,
      'two-factor': () => `Your ${name} verification code`,
      'account-locked': () => `Security Alert: Account Locked — ${name}`,
    };

    return subjects[template]?.() || `Notification from ${name}`;
  }

  /**
   * Log email to database
   */
  private async logEmail(data: EmailLogData): Promise<void> {
    try {
      await prisma.emailLog.create({
        data: {
          messageId: data.id ?? null,
          to: data.to,
          subject: data.subject,
          status: data.status,
          error: data.error ?? null,
          metadata: data.metadata || {},
        },
      });
    } catch (error) {
      // Don't let logging failures break email sending
      console.error(
        '[EmailService] Logging error:',
        error instanceof Error ? error.message : error
      );
    }
  }

  /**
   * Internal structured logging
   */
  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: unknown
  ): void {
    if (!this.config.logging.enabled) return;
    if (level === 'debug' && !this.config.logging.debug) return;

    const prefix = `[EmailService][${this.config.environment}]`;
    const logFn = level === 'error'
      ? console.error
      : level === 'warn'
        ? console.warn
        : console.log;

    logFn(`${prefix} ${message}`, data !== undefined ? data : '');
  }
}