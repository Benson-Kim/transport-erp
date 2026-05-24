/**
 * Unified Notification Service
 *
 * Routes messages to the correct channels (Email, SMS, WhatsApp)
 * respecting the customer's GDPR/AEPD notification preferences.
 *
 * Architecture:
 *  - Uses the Strategy Pattern (INotificationChannel) — adding a new channel
 *    (e.g. Telegram) requires only a new class, not modifying this file.
 *  - `Promise.allSettled` ensures one channel failure does NOT block others.
 *  - Results are logged per-channel for observability.
 */

import prisma from '@/lib/prisma/prisma';
import {
  WhatsAppChannel,
  SmsChannel,
  EmailChannel,
  type INotificationChannel,
  type NotificationSendResult,
  type NotificationTemplate,
} from './channels';

export interface NotificationPayload {
  shipmentId: string;
  template: NotificationTemplate;
  data: Record<string, unknown>;
}

// Singleton channel instances
const whatsAppChannel = new WhatsAppChannel();
const smsChannel = new SmsChannel();
const emailChannel = new EmailChannel();

/** Templates for which email is appropriate (receipts/confirmations). */
const EMAIL_TEMPLATES: Set<NotificationTemplate> = new Set([
  'ORDER_CONFIRMED',
  'DELIVERED',
  'PUDO_AVAILABLE',
]);

export class NotificationService {
  /**
   * Dispatches a notification across all preferred channels for a shipment.
   * Failures are per-channel and never throw — results are returned for logging.
   */
  static async dispatch(
    payload: NotificationPayload,
  ): Promise<NotificationSendResult[]> {
    const shipment = await prisma.shipment.findUnique({
      where: { id: payload.shipmentId },
    });

    if (!shipment) {
      console.error(`[NotificationService] Shipment not found: ${payload.shipmentId}`);
      return [{ success: false, channel: 'system', error: 'Shipment not found' }];
    }

    const channels: { channel: INotificationChannel; to: string }[] = [];

    // 1. WhatsApp is highest priority (95% open rate in Spain)
    if (shipment.notifyViaWhatsapp && shipment.recipientPhone) {
      channels.push({ channel: whatsAppChannel, to: shipment.recipientPhone });
    }
    // 2. Fallback to SMS if WhatsApp not preferred
    else if (shipment.notifyViaSms && shipment.recipientPhone) {
      channels.push({ channel: smsChannel, to: shipment.recipientPhone });
    }

    // 3. Email is always sent for receipts/confirmations if allowed
    if (
      shipment.notifyViaEmail &&
      shipment.recipientEmail &&
      EMAIL_TEMPLATES.has(payload.template)
    ) {
      channels.push({ channel: emailChannel, to: shipment.recipientEmail });
    }

    if (channels.length === 0) {
      console.warn(
        `[NotificationService] No channels configured for shipment ${payload.shipmentId}`,
      );
      return [];
    }

    // Fire all channels concurrently — partial failure is acceptable
    const settled = await Promise.allSettled(
      channels.map(({ channel, to }) =>
        channel.send(to, payload.template, payload.data),
      ),
    );

    const results: NotificationSendResult[] = settled.map((s, idx) => {
      if (s.status === 'fulfilled') {
        if (!s.value.success) {
          console.warn(
            `[NotificationService] ${channels[idx]!.channel.name} delivery failed:`,
            s.value.error,
          );
        }
        return s.value;
      }
      // Rejected promise — unexpected crash in channel
      const channelName = channels[idx]!.channel.name;
      console.error(
        `[NotificationService] ${channelName} threw unexpectedly:`,
        s.reason,
      );
      return {
        success: false,
        channel: channelName,
        error: String(s.reason),
      };
    });

    return results;
  }

  /**
   * Convenience: send a direct notification to a specific channel + recipient,
   * bypassing the shipment lookup.
   */
  static async sendDirect(
    channel: 'whatsapp' | 'sms' | 'email',
    to: string,
    template: NotificationTemplate,
    data: Record<string, unknown>,
  ): Promise<NotificationSendResult> {
    const channelMap: Record<string, INotificationChannel> = {
      whatsapp: whatsAppChannel,
      sms: smsChannel,
      email: emailChannel,
    };

    const impl = channelMap[channel];
    if (!impl) {
      return { success: false, channel, error: `Unknown channel: ${channel}` };
    }

    return impl.send(to, template, data);
  }
}

// Re-export types for convenience
export type { NotificationTemplate, NotificationSendResult };
