// /lib/validations/settings-schema.ts
import { UserRole } from '@/app/generated/prisma';
import { z } from 'zod';
import { passwordSchema } from './auth-schema';

/**
 * Company settings validation schema
 */
export const companySettingsSchema = z.object({
    companyName: z.string()
        .min(2, 'Company name must be at least 2 characters')
        .max(100, 'Company name must be less than 100 characters')
        .trim(),
    address: z.string()
        .min(10, 'Address must be at least 10 characters')
        .max(500, 'Address must be less than 500 characters'),
    vatNumber: z.string()
        .regex(/^[A-Z]{2}[0-9A-Z]+$/, 'Invalid VAT number format')
        .transform(val => val.toUpperCase()),
    email: z.email('Invalid email address')
        .toLowerCase(),
    phone: z.string()
        .trim()
        .transform((val) => val.replace(/\s+/g, ''))
        .refine((val) => /^\+?[1-9]\d{7,14}$/.test(val), {
            message: 'Invalid phone number',
        }),
    website: z.union([
        z.url('Invalid website URL'),
        z.literal(''),
    ]).optional(),
    bankAccount: z.string()
        .regex(/^[A-Z]{2}\d{2}[A-Z0-9]+$/, 'Invalid IBAN format')
        .optional()
        .or(z.literal('')),
    bankDetails: z.string()
        .max(500, 'Bank details must be less than 500 characters')
        .optional(),
    logo: z.union([
        z.string().startsWith('data:image/', 'Invalid image format'),
        z.url('Invalid image URL'),
        z.undefined(),
    ]).optional(),
});

/**
 * User creation schema
 */
export const createUserSchema = z.object({
    name: z.string()
        .min(2, 'Name must be at least 2 characters')
        .max(100, 'Name must be less than 100 characters').trim(),
    email: z.email('Invalid email address').toLowerCase().trim(),
    role: z.enum(UserRole),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    status: z.enum(['active', 'inactive']).default('active'),
    department: z.string()
        .max(100, 'Department must be less than 100 characters')
        .optional(),
    phone: z.string().max(20).optional().nullable(),
    sendWelcomeEmail: z.boolean().default(true),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ['confirmPassword'],
});

/**
 * User update schema
 */
export const updateUserSchema = z.object({
    name: z.string()
        .min(2, 'Name must be at least 2 characters')
        .max(100, 'Name must be less than 100 characters').trim(),
    email: z.email('Invalid email address').toLowerCase().trim(),
    role: z.enum(UserRole),
    password: passwordSchema.optional().or(z.literal('')),
    confirmPassword: z.string().optional().or(z.literal('')),
    status: z.enum(['active', 'inactive']),
    department: z.string()
        .max(100, 'Department must be less than 100 characters')
        .optional()
        .nullable(),
    phone: z.string().max(20, 'Phone too long').optional().nullable(),
}).refine((data) => !data.password || data.password.trim() === '' || data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

/**
 * Profile update schema
 */
export const profileUpdateSchema = z.object({
    name: z.string()
        .min(2, 'Name must be at least 2 characters')
        .max(100, 'Name must be less than 100 characters').trim(),
    email: z.email('Invalid email address').toLowerCase().trim(),
    phone: z.union([
        z.string().regex(/^\+?[1-9]\d{7,14}$/, 'Invalid phone number'),
        z.literal(''),
        z.null(),
    ]).optional(),
    department: z.string()
        .max(100, 'Department must be less than 100 characters')
        .optional()
        .nullable(),
    language: z.enum(['en', 'es', 'ca']).default('es'),
    timezone: z.string()
        .min(1, 'Timezone is required')
        .default('Europe/Madrid'),
    avatar: z.union([
        z.string().startsWith('data:image/', 'Invalid image format'),
        z.url('Invalid image URL'),
        z.null(),
        z.undefined(),
    ]).optional(),
});

/**
 * Password change schema
 */
export const passwordChangeSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
}).refine((data) => data.newPassword !== data.currentPassword, {
    message: "New password must be different from current password",
    path: ['newPassword'],
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
});

/**
 * System settings schema
 */
export const systemSettingsSchema = z.object({
    emailProvider: z.enum(['resend', 'smtp', 'sendgrid', 'ses']).default('resend'),
    emailApiKey: z.string().optional(),
    smtpHost: z.string().optional(),
    smtpPort: z.number().int().min(1).max(65535).optional(),
    smtpUser: z.string().optional(),
    smtpPassword: z.string().optional(),
    smtpSecure: z.boolean().default(true).optional(),
    fromName: z.string()
        .min(1, 'From name is required')
        .max(100, 'From name must be less than 100 characters'),
    fromEmail: z.email('Invalid email address')
        .toLowerCase(),
    pdfPaperSize: z.enum(['A4', 'Letter', 'Legal']).default('A4'),
    pdfIncludeLogo: z.boolean().default(true),
    pdfLogoPosition: z.enum(['left', 'center', 'right']).default('left'),
    pdfFooterText: z.string().max(200).optional(),
    backupFrequency: z.enum(['daily', 'weekly', 'monthly', 'never']).default('daily'),
    backupTime: z.string()
        .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:MM)'),
    backupRetention: z.number()
        .int()
        .min(1, 'Retention must be at least 1 day')
        .max(365, 'Retention cannot exceed 365 days')
        .default(30),
    backupLocation: z.string()
        .min(1, 'Backup location is required'),
    serviceNumberFormat: z.string()
        .min(1, 'Service number format is required')
        .default('SRV-YYYY-NNNNN'),
    invoiceNumberFormat: z.string()
        .min(1, 'Invoice number format is required')
        .default('INV-YYYY-NNNNN'),
    loadingOrderNumberFormat: z.string()
        .min(1, 'Loading order format is required')
        .default('LO-YYYY-NNNNN'),
    paymentNumberFormat: z.string()
        .min(1, 'Payment number format is required')
        .default('PAY-YYYY-NNNNN'),
    sequenceReset: z.enum(['yearly', 'monthly', 'never', 'manual']).default('yearly'),
    defaultCurrency: z.enum(['EUR', 'USD', 'GBP']).default('EUR'),
    dateFormat: z.enum([
        'DD/MM/YYYY',
        'MM/DD/YYYY',
        'YYYY-MM-DD',
        'DD.MM.YYYY'
    ]).default('DD/MM/YYYY'),
    timeFormat: z.enum(['24', '12']).default('24'),
    defaultVatRate: z.number()
        .min(0, 'VAT rate cannot be negative')
        .max(100, 'VAT rate cannot exceed 100%')
        .default(21),
    defaultIrpfRate: z.number()
        .min(0, 'IRPF rate cannot be negative')
        .max(100, 'IRPF rate cannot exceed 100%')
        .default(15),
    itemsPerPage: z.number()
        .int()
        .min(10, 'Minimum 10 items per page')
        .max(100, 'Maximum 100 items per page')
        .default(50),

    // Feature toggles
    enableTwoFactor: z.boolean().default(false),
    enableNotifications: z.boolean().default(true),
    enableAutoBackup: z.boolean().default(true),
    requireClientVat: z.boolean().default(false),
    autoArchiveMonths: z.number()
        .int()
        .min(0, 'Cannot be negative')
        .max(120, 'Maximum 120 months')
        .default(12),
}).superRefine((data, ctx) => {
    // Validate SMTP settings if SMTP is selected
    if (data.emailProvider === 'smtp') {
        if (!data.smtpHost) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'SMTP host is required when using SMTP',
                path: ['smtpHost'],
            });
        }
        if (!data.smtpPort) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'SMTP port is required when using SMTP',
                path: ['smtpPort'],
            });
        }
    }

    // Validate API key for providers that need it
    if (['resend', 'sendgrid', 'ses'].includes(data.emailProvider) && !data.emailApiKey) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `API key is required for ${data.emailProvider}`,
            path: ['emailApiKey'],
        });
    }
});

/**
 * Audit log filter schema
 */
export const auditLogFilterSchema = z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(50),
    userId: z.string().optional(),
    action: z.string().optional(),
    tableName: z.string().optional(),
    startDate: z.date().optional(),
    endDate: z.date().optional(),
    search: z.string().optional(),
});

export type CompanySettings = z.infer<typeof companySettingsSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
export type PasswordChange = z.infer<typeof passwordChangeSchema>;
export type SystemSettings = z.infer<typeof systemSettingsSchema>;
export type AuditLogFilter = z.infer<typeof auditLogFilterSchema>;