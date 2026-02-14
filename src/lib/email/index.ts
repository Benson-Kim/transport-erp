import { EmailService } from './service';

export { EmailService } from './service';
export { getEmailConfig } from './config';
export type { EmailConfig } from '@/types/mail';

export const emailService = EmailService.getInstance();

export const sendEmail = emailService.send.bind(emailService);
export const sendTemplate = emailService.sendTemplate.bind(emailService);
export const queueEmail = emailService.queueEmail.bind(emailService);
export const sendBatch = emailService.sendBatch.bind(emailService);
