/** Email provider options. Narrowed to Resend in #40 - ONE email subsystem;
 * the sendgrid/ses/smtp options were dead affordances that only the old
 * test-email path implemented, so selecting one silently broke real sends. */
export type EmailProvider = 'resend';

/** Paper size options */
export type PaperSize = 'A4' | 'Letter' | 'Legal';

/** Logo position options */
export type LogoPosition = 'left' | 'center' | 'right';

/** Backup frequency options */
export type BackupFrequency = 'daily' | 'weekly' | 'monthly' | 'never';

/** Currency options */
export type Currency = 'EUR' | 'USD' | 'GBP';

/** Date format options */
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD' | 'DD.MM.YYYY';

/** Time format options */
export type TimeFormat = '24' | '12';

/** Action result type */
export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Setting key enum for type safety. NUMBER_SEQUENCES was deleted in #36
 * (the setting was written by the UI but read by nothing - numbering is the
 * hardcoded document_counters allocator, #12). Orphaned 'number_sequences'
 * rows in system_settings are unread and harmless. */
export enum SettingKey {
  EMAIL = 'email_config',
  PDF = 'pdf_settings',
  BACKUP = 'backup_settings',
  GENERAL = 'general_settings',
  LAST_BACKUP = 'last_backup_timestamp',
}
