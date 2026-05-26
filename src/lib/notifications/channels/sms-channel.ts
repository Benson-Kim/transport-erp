/**
 * SMS Channel — Twilio / Link Mobility
 *
 * Requires env vars:
 * - SMS_PROVIDER (twilio | link-mobility)
 * - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
 */

import type {
  INotificationChannel,
  NotificationSendResult,
  NotificationTemplate,
} from './types';

/** Renders a localised SMS body for the given template. */
function renderSmsTemplate(
  template: NotificationTemplate,
  data: Record<string, unknown>,
): string {
  const name = (data.recipientName as string) || 'Cliente';
  const tracking = data.trackingToken ? `\nSeguimiento: ${process.env.NEXT_PUBLIC_APP_URL}/track/${data.trackingToken}` : '';

  const messages: Record<NotificationTemplate, string> = {
    ORDER_CONFIRMED: `Hola ${name}, su pedido ha sido confirmado.${tracking}`,
    OUT_FOR_DELIVERY: `Hola ${name}, su paquete está en reparto.${tracking}`,
    DELIVERED: `Hola ${name}, su paquete ha sido entregado.${tracking}`,
    PUDO_AVAILABLE: `Hola ${name}, su paquete está disponible para recogida en ${data.pudoName ?? 'su punto de recogida'}.${tracking}`,
    DELIVERY_WINDOW: `Hola ${name}, su entrega está estimada entre ${data.from ?? ''} - ${data.to ?? ''}.${tracking}`,
  };

  return messages[template] ?? `Actualización de envío.${tracking}`;
}

export class SmsChannel implements INotificationChannel {
  readonly name = 'sms';

  async send(
    phone: string,
    template: NotificationTemplate,
    data: Record<string, unknown>,
  ): Promise<NotificationSendResult> {
    const provider = process.env.SMS_PROVIDER ?? 'twilio';

    if (provider === 'twilio') {
      return this.sendViaTwilio(phone, template, data);
    }

    if (provider === 'link-mobility') {
      return this.sendViaLinkMobility(phone, template, data);
    }

    return { success: false, channel: this.name, error: `Unsupported SMS provider: ${provider}` };
  }

  private async sendViaLinkMobility(
    phone: string,
    template: NotificationTemplate,
    data: Record<string, unknown>,
  ): Promise<NotificationSendResult> {
    const apiKey = process.env.LINK_MOBILITY_API_KEY;
    const sender = process.env.LINK_MOBILITY_SENDER ?? 'TransportERP';

    if (!apiKey) {
      return { success: false, channel: this.name, error: 'Link Mobility credentials not configured' };
    }

    try {
      const body = renderSmsTemplate(template, data);

      const response = await fetch('https://gatewayapi.com/rest/mtsms', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender,
          message: body,
          recipients: [{ msisdn: phone.replace('+', '') }]
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error(`[SMS] Link Mobility error for ${template}:`, err);
        return { success: false, channel: this.name, error: `HTTP ${response.status}` };
      }

      const json = await response.json();
      return { success: true, channel: this.name, messageId: json?.ids?.[0] };
    } catch (err: unknown) {
      console.error(`[SMS] Failed to send ${template}:`, err instanceof Error ? err.message : String(err));
      return { success: false, channel: this.name, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  private async sendViaTwilio(
    phone: string,
    template: NotificationTemplate,
    data: Record<string, unknown>,
  ): Promise<NotificationSendResult> {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (!sid || !token || !from) {
      return { success: false, channel: this.name, error: 'Twilio credentials not configured' };
    }

    try {
      const body = renderSmsTemplate(template, data);
      const params = new URLSearchParams({ To: phone, From: from, Body: body });

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        },
      );

      if (!response.ok) {
        const err = await response.text();
        console.error(`[SMS] Twilio error for ${template}:`, err);
        return { success: false, channel: this.name, error: `HTTP ${response.status}` };
      }

      const json = await response.json();
      return { success: true, channel: this.name, messageId: json?.sid };
    } catch (err: any) {
      console.error(`[SMS] Failed to send ${template}:`, err?.message);
      return { success: false, channel: this.name, error: err?.message ?? 'Unknown error' };
    }
  }
}
