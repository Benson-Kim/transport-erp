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


export const pdfSettingsSchema = z.object({
    paperSize: z.enum(['A4', 'Letter', 'Legal']),
    includeLogo: z.boolean(),
    logoPosition: z.enum(['left', 'center', 'right']),
    footerText: z.string().max(200).optional(),
});


/**
 * Validation for number format strings
 */
const numberFormatSchema = z
    .string()
    .min(1, 'Format is required')
    .refine(
        (value) => /N{3,5}/.test(value),
        { message: 'Format must contain a number token (NNN, NNNN, or NNNNN)' }
    )
    .refine(
        (value) => {
            // Check for valid tokens only (no invalid patterns)
            const validTokens = ['YYYY', 'YY', 'MM', 'DD', 'NNNNN', 'NNNN', 'NNN'];
            const tokenPattern = /[A-Z]{2,5}/g;
            const matches = value.match(tokenPattern) || [];

            return matches.every(match =>
                validTokens.includes(match) ||
                // Allow custom prefixes (letters that aren't tokens)
                !['YY', 'MM', 'DD', 'NN'].some(token => match.includes(token))
            );
        },
        { message: 'Format contains invalid tokens. Use YYYY, YY, MM, DD, NNN, NNNN, or NNNNN' }
    );

// Number sequences schema
export const numberSequencesSchema = z.object({
    serviceFormat: numberFormatSchema,
    invoiceFormat: numberFormatSchema,
    loadingOrderFormat: numberFormatSchema,
    paymentNumberFormat: numberFormatSchema,
    sequenceReset: z.enum(['yearly', 'monthly', 'never', 'manual']),
});

export const generalSettingsSchema = z.object({
    defaultCurrency: z.enum(['EUR', 'USD', 'GBP']),
    dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD.MM.YYYY']),
    timeFormat: z.enum(['24', '12']),
    defaultVatRate: z.number()
        .min(0, 'VAT rate cannot be negative')
        .max(100, 'VAT rate cannot exceed 100%'),
    defaultIrpfRate: z.number()
        .min(0, 'IRPF rate cannot be negative')
        .max(100, 'IRPF rate cannot exceed 100%'),
    itemsPerPage: z.number()
        .int()
        .min(10, 'Minimum 10 items per page')
        .max(100, 'Maximum 100 items per page'),

    // Feature toggles
    enableTwoFactor: z.boolean(),
    enableNotifications: z.boolean(),
    enableAutoBackup: z.boolean(),
    requireClientVat: z.boolean(),
    autoArchiveMonths: z.number()
        .int()
        .min(0, 'Cannot be negative')
        .max(120, 'Maximum 120 months')
})

// Combined system settings schema
export const systemSettingsSchema = z.object({
    pdf: pdfSettingsSchema,
    numberSequences: numberSequencesSchema,
    general: generalSettingsSchema,
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

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
    pdf: {
        paperSize: 'A4',
        includeLogo: true,
        logoPosition: 'left',
        footerText: '',
    },
    numberSequences: {
        serviceFormat: 'SRV-YYYY-NNNNN',
        invoiceFormat: 'INV-YYYY-NNNNN',
        loadingOrderFormat: 'LO-YYYY-NNNNN',
        paymentNumberFormat: 'PAY-YYYY-NNNNN',
        sequenceReset: 'yearly',
    },
    general: {
        defaultCurrency: 'EUR',
        dateFormat: 'DD/MM/YYYY',
        timeFormat: '24',
        defaultVatRate: 21,
        defaultIrpfRate: 15,
        itemsPerPage: 50,
        enableTwoFactor: false,
        enableNotifications: true,
        enableAutoBackup: true,
        requireClientVat: false,
        autoArchiveMonths: 12,
    },
};


/** Type exports from schemas */
export type SystemSettings = z.infer<typeof systemSettingsSchema>;
export type PDFSettingsInput = z.infer<typeof pdfSettingsSchema>;
export type NumberSequencesInput = z.infer<typeof numberSequencesSchema>;
export type GeneralSettingsInput = z.infer<typeof generalSettingsSchema>

export type CompanySettings = z.infer<typeof companySettingsSchema>;
export type CreateUser = z.infer<typeof createUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
export type PasswordChange = z.infer<typeof passwordChangeSchema>;
export type AuditLogFilter = z.infer<typeof auditLogFilterSchema>;