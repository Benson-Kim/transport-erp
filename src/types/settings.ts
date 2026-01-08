/** Email provider options */
export type EmailProvider = 'resend' | 'smtp' | 'sendgrid' | 'ses';

/** Paper size options */
export type PaperSize = 'A4' | 'Letter' | 'Legal';

/** Logo position options */
export type LogoPosition = 'left' | 'center' | 'right';

/** Backup frequency options */
export type BackupFrequency = 'daily' | 'weekly' | 'monthly' | 'never';

/** Number sequence reset options */
export type SequenceReset = 'yearly' | 'monthly' | 'never' | 'manual';

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

/** Setting key enum for type safety */
export enum SettingKey {
  EMAIL = 'email_config',
  PDF = 'pdf_settings',
  BACKUP = 'backup_settings',
  NUMBER_SEQUENCES = 'number_sequences',
  GENERAL = 'general_settings',
  LAST_BACKUP = 'last_backup_timestamp',
}
