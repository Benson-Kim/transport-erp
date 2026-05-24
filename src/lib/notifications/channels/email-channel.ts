/**
 * Email Channel — enqueues into the existing EmailQueue table.
 *
 * This is intentionally lightweight — the existing email cron consumer
 * handles actual delivery (SendGrid, SES, Resend, etc).
 */

import prisma from '@/lib/prisma/prisma';
import type {
  INotificationChannel,
  NotificationSendResult,
  NotificationTemplate,
} from './types';

export class EmailChannel implements INotificationChannel {
  readonly name = 'email';

  async send(
    email: string,
    template: NotificationTemplate,
    data: Record<string, unknown>,
  ): Promise<NotificationSendResult> {
    if (!email || !email.includes('@')) {
      return { success: false, channel: this.name, error: 'Invalid email address' };
    }

    try {
      const queued = await prisma.emailQueue.create({
        data: {
          template,
          to: email,
          data: data as any,
          priority: this.isHighPriority(template) ? 'high' : 'normal',
          status: 'pending',
        },
      });

      return { success: true, channel: this.name, messageId: queued.id };
    } catch (err: any) {
      console.error(`[Email] Failed to enqueue ${template}:`, err?.message);
      return { success: false, channel: this.name, error: err?.message ?? 'Unknown error' };
    }
  }

  private isHighPriority(template: NotificationTemplate): boolean {
    return ['DELIVERED', 'PUDO_AVAILABLE', 'OUT_FOR_DELIVERY'].includes(template);
  }
}
