// /actions/settings-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import {
    type CompanySettings,
    type NumberSequencesInput,
    type GeneralSettingsInput,
    type SystemSettings,
    companySettingsSchema,
    numberSequencesSchema,
    generalSettingsSchema,
    DEFAULT_SYSTEM_SETTINGS,
} from '@/lib/validations/settings-schema';

import prisma from '@/lib/prisma/prisma';
import { createAuditLog } from '@/lib/prisma/db-helpers';
import { requirePermission } from '@/lib/rbac';
import { getServerAuth, requireAuth } from '@/lib/auth';
import { AuditAction } from '@/app/generated/prisma';

import type { ActionResult } from '@/types/settings';
import { SettingKey } from '@/types/settings';
import z from 'zod';
import { getEnv } from '@/lib/utils/export';

/**
 * B2 Configuration Interface
 */
interface B2Config {
    applicationKeyId: string;
    applicationKey: string;
    bucketId: string;
    bucketName: string;
    region: string;
    endpoint: string;
    keyName: string;
    maxFileSize: number;
    cdnUrl?: string;
}

function getB2Config(): B2Config {
    const cleanEndpoint = getEnv('B2_ENDPOINT').trim().replace(/\/+$/, '');
    const endpoint = cleanEndpoint.startsWith('http')
        ? cleanEndpoint
        : `https://${cleanEndpoint}`;
    const config: B2Config = {
        applicationKeyId: getEnv('B2_APPLICATION_KEY_ID') || '',
        applicationKey: getEnv('B2_APPLICATION_KEY') || '',
        bucketId: getEnv('B2_BUCKET_ID') || '',
        bucketName: getEnv('B2_BUCKET_NAME') || '',
        region: getEnv('B2_REGION') || 'us-west-004',
        endpoint: endpoint || '',
        keyName: getEnv('B2_KEYNAME') || 'backups',
        maxFileSize: parseInt(getEnv('B2_MAX_FILE_SIZE') || '104857600', 10), // 100MB default
        cdnUrl: getEnv('B2_CDN_URL'),
    };

    return config;
}

function validateB2Config(config: B2Config): void {
    const required = ['applicationKeyId', 'applicationKey', 'bucketName', 'endpoint'] as const;
    const missing = required.filter(key => !config[key]);

    if (missing.length > 0) {
        throw new Error(`Missing B2 configuration: ${missing.join(', ')}`);
    }
}

/**
 * Update company settings
 */
export async function updateCompanySettings(data: CompanySettings) {
    try {
        const session = await requireAuth();
        await requirePermission('settings', 'edit');

        const validated = companySettingsSchema.parse(data);

        let logoUrl = validated.logo;
        if (validated.logo && validated.logo.startsWith('data:')) {
            // Upload logo to B2
            logoUrl = await uploadLogoToB2(validated.logo);
        }

        let company = await prisma.company.findFirst({
            where: {
                code: 'DEFAULT',
                deletedAt: null
            }
        });

        if (company) {
            company = await prisma.company.update({
                where: { id: company.id },
                data: {
                    legalName: validated.companyName,
                    tradeName: validated.companyName,
                    vatNumber: validated.vatNumber,
                    addressLine1: validated.address,
                    email: validated.email,
                    phone: validated.phone,
                    website: validated.website || null,
                    iban: validated.bankAccount || null,
                    bankAccount: validated.bankAccount || null,
                    logoUrl: logoUrl || null,
                    updatedAt: new Date(),
                },
            });
            await createAuditLog({
                userId: session.user.id,
                action: AuditAction.UPDATE,
                tableName: 'companies',
                recordId: company.id,
                newValues: validated,
                metadata: { action: 'company_settings_update' },
            });
        } else {
            company = await prisma.company.create({
                data: {
                    code: 'DEFAULT',
                    legalName: validated.companyName,
                    tradeName: validated.companyName,
                    vatNumber: validated.vatNumber,
                    addressLine1: validated.address,
                    city: 'Default City',
                    postalCode: '00000',
                    email: validated.email,
                    phone: validated.phone,
                    website: validated.website || null,
                    iban: validated.bankAccount || null,
                    bankAccount: validated.bankAccount || null,
                    logoUrl: logoUrl || null,
                },
            });
            await createAuditLog({
                userId: session.user.id,
                action: AuditAction.CREATE,
                tableName: 'companies',
                recordId: company.id,
                newValues: validated,
                metadata: { action: 'company_settings_create' },
            });
        }

        revalidatePath('/settings/company');
        return { success: true, data: company };
    } catch (error) {
        console.error('Update company settings error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to update settings'
        };
    }
}

/**
 * Upload logo to B2
 */
async function uploadLogoToB2(base64Data: string): Promise<string> {
    const b2Config = getB2Config();
    validateB2Config(b2Config);

    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

    // Extract mime type and data from base64
    const matches = base64Data.match(/^data:(.+);base64,(.+)$/);
    if (!matches || !matches[1] || !matches[2]) {
        throw new Error('Invalid base64 image format');
    }

    const mimeType = matches[1];
    const base64Content = matches[2];

    const buffer = Buffer.from(base64Content, 'base64');

    // Generate unique filename
    const extension = mimeType?.split('/')[1] || 'png';
    const filename = `logos/company-logo-${Date.now()}.${extension}`;

    const s3Client = new S3Client({
        region: b2Config.region,
        endpoint: b2Config.endpoint,
        credentials: {
            accessKeyId: b2Config.applicationKeyId,
            secretAccessKey: b2Config.applicationKey,
        },
        forcePathStyle: true,
    });

    await s3Client.send(new PutObjectCommand({
        Bucket: b2Config.bucketName,
        Key: filename,
        Body: buffer,
        ContentType: mimeType,
    }));

    // Return CDN URL if available, otherwise construct B2 URL
    if (b2Config.cdnUrl) {
        return `${b2Config.cdnUrl}/${filename}`;
    }

    return `${b2Config.endpoint}/${b2Config.bucketName}/${filename}`;
}

/**
 * Get company settings
 */
export async function getCompanySettings() {
    try {
        await requirePermission('settings', 'view');

        const company = await prisma.company.findFirst({
            where: {
                code: 'DEFAULT',
                deletedAt: null
            },
        });

        if (!company) {
            return { success: true, data: null };
        }

        const settings: CompanySettings = {
            companyName: company.legalName,
            address: company.addressLine1 + (company.addressLine2 ? '\n' + company.addressLine2 : ''),
            vatNumber: company.vatNumber,
            email: company.email,
            phone: company.phone,
            website: company.website || '',
            bankAccount: company.iban || '',
            bankDetails: company.bankName || '',
            logo: company.logoUrl || undefined,
        };

        return { success: true, data: settings };
    } catch (error) {
        console.error('Get company settings error:', error);
        return {
            success: false,
            data: null,
            error: error instanceof Error ? error.message : 'Failed to fetch settings'
        };
    }
}

/**
 * Get a single setting by key
 */
async function getSetting<T>(key: SettingKey, defaultValue: T): Promise<T> {
    const setting = await prisma.systemSetting.findUnique({
        where: { key },
    });

    return (setting?.value as T) ?? defaultValue;
}

/**
 * Update or create a setting
 */
async function upsertSetting(
    key: SettingKey,
    value: unknown,
    description?: string,
    userId?: string
): Promise<void> {
    await prisma.$transaction(async (tx) => {
        await tx.systemSetting.upsert({
            where: { key },
            create: { key, value: value as object, description: description ?? null, isPublic: false },
            update: { value: value as object },
        });
        if (userId) {
            await tx.auditLog.create({
                data: {
                    userId,
                    action: 'UPDATE',
                    tableName: 'system_settings',
                    recordId: key,
                    metadata: {
                        section: key,
                        timestamp: new Date().toISOString(),
                    },
                },
            });
        }
    });
}

async function updateSetting<T>(
    key: SettingKey,
    data: unknown,
    schema: z.ZodSchema<T>,
    description: string
): Promise<ActionResult> {
    try {
        await requirePermission('settings', 'edit');
        const session = await getServerAuth();

        const validated = schema.parse(data);
        await upsertSetting(key, validated, description, session?.user.id);

        revalidatePath('/settings/system');
        return { success: true };
    } catch (error) {
        console.error(`Failed to update ${key}:`, error);
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: error.issues.map(issue => issue.message).join(', ')
            };
        }

        return {
            success: false,
            error: error instanceof Error ? error.message : 'Update failed'
        };
    }
}


/**
 * Get all system settings
 */
export async function getSystemSettings(): Promise<SystemSettings> {
    await requirePermission('settings', 'view');

    const [numberSequences, general] = await Promise.all([
        getSetting<NumberSequencesInput>
            (SettingKey.NUMBER_SEQUENCES, DEFAULT_SYSTEM_SETTINGS.numberSequences),
        getSetting<GeneralSettingsInput>
            (SettingKey.GENERAL, DEFAULT_SYSTEM_SETTINGS.general),
    ]);

    return {
        numberSequences: { ...DEFAULT_SYSTEM_SETTINGS.numberSequences, ...numberSequences },
        general: { ...DEFAULT_SYSTEM_SETTINGS.general, ...general },
    };
}




export async function updateNumberSequences(data: unknown): Promise<ActionResult> {
    return updateSetting(
        SettingKey.NUMBER_SEQUENCES,
        data,
        numberSequencesSchema,
        'Document number formatting and sequences'
    );
}

export async function updateGeneral(data: unknown): Promise<ActionResult> {
    return updateSetting(
        SettingKey.GENERAL,
        data,
        generalSettingsSchema,
        'General application settings'
    );
}
