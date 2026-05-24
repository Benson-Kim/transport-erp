/**
 * Notification Channel Interface (Strategy Pattern)
 *
 * Each channel implements this interface.
 * Adding a new channel (e.g. Telegram) requires only a new file — no
 * modification to NotificationService (Open/Closed Principle).
 */

export type NotificationTemplate =
  | 'ORDER_CONFIRMED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'PUDO_AVAILABLE'
  | 'DELIVERY_WINDOW';

export interface INotificationChannel {
  readonly name: string;

  /**
   * Sends a notification using this channel.
   * Implementations MUST NOT throw — they should catch errors internally
   * and return a result object so the dispatcher can log per-channel outcomes.
   */
  send(
    to: string,
    template: NotificationTemplate,
    data: Record<string, unknown>,
  ): Promise<NotificationSendResult>;
}

export interface NotificationSendResult {
  success: boolean;
  channel: string;
  messageId?: string;
  error?: string;
}
