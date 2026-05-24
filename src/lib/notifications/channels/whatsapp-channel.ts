/**
 * WhatsApp Channel — Meta WhatsApp Business Cloud API
 *
 * Requires env vars:
 * - WHATSAPP_PHONE_NUMBER_ID
 * - WHATSAPP_ACCESS_TOKEN
 */

import type {
  INotificationChannel,
  NotificationSendResult,
  NotificationTemplate,
} from './types';

/** Maps internal template names to WhatsApp-registered template names */
const TEMPLATE_MAP: Record<NotificationTemplate, string> = {
  ORDER_CONFIRMED: 'order_confirmed_es',
  OUT_FOR_DELIVERY: 'out_for_delivery_es',
  DELIVERED: 'delivered_es',
  PUDO_AVAILABLE: 'pudo_available_es',
  DELIVERY_WINDOW: 'delivery_window_es',
};

function buildComponents(data: Record<string, unknown>) {
  // WhatsApp template components are dynamic values (header, body params)
  const bodyParams = Object.values(data)
    .filter((v) => typeof v === 'string' || typeof v === 'number')
    .map((v) => ({ type: 'text' as const, text: String(v) }));

  return [{ type: 'body' as const, parameters: bodyParams }];
}

export class WhatsAppChannel implements INotificationChannel {
  readonly name = 'whatsapp';

  async send(
    phone: string,
    template: NotificationTemplate,
    data: Record<string, unknown>,
  ): Promise<NotificationSendResult> {
    const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token = process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneId || !token) {
      return { success: false, channel: this.name, error: 'WhatsApp credentials not configured' };
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v19.0/${phoneId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: phone.replace(/\D/g, ''), // strip non-digit chars
            type: 'template',
            template: {
              name: TEMPLATE_MAP[template],
              language: { code: 'es' },
              components: buildComponents(data),
            },
          }),
        },
      );

      if (!response.ok) {
        const err = await response.text();
        console.error(`[WhatsApp] API error for ${template}:`, err);
        return { success: false, channel: this.name, error: `HTTP ${response.status}` };
      }

      const json = await response.json();
      const messageId = json?.messages?.[0]?.id;
      return { success: true, channel: this.name, messageId };
    } catch (err: any) {
      console.error(`[WhatsApp] Failed to send ${template}:`, err?.message);
      return { success: false, channel: this.name, error: err?.message ?? 'Unknown error' };
    }
  }
}
