// /actions/settings-actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import {
    companySettingsSchema,
    type CompanySettings,
} from '@/lib/validations/settings-schema';

import prisma from '@/lib/prisma/prisma';
import { createAuditLog } from '@/lib/prisma/db-helpers';
import { requirePermission } from '@/lib/rbac';
import { requireAuth } from '@/lib/auth';
import { AuditAction } from '@/app/generated/prisma';
import { uploadToStorage } from '@/lib/utils/export';

/**
 * Update company settings
 */
export async function updateCompanySettings(data: CompanySettings) {
    try {
        const session = await requireAuth();
        await requirePermission('settings', 'edit');

        const validated = companySettingsSchema.parse(data);

        // Save logo to storage if provided
        let logoUrl = validated.logo;
        if (validated.logo && validated.logo.startsWith('data:')) {
            // TODO: Upload to S3/storage and get URL
            logoUrl = await uploadToStorage(validated.logo, 'logos');
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
            // Log audit
            await createAuditLog({
                userId: session.user.id,
                action: AuditAction.CREATE,
                tableName: 'companies',
                recordId: company.id,
                newValues: validated,
                metadata: {
                    action: 'company_settings_create'
                },
            });
        } else {
            company = await prisma.company.create({
                data: {
                    code: 'DEFAULT',
                    legalName: validated.companyName,
                    tradeName: validated.companyName,
                    vatNumber: validated.vatNumber,
                    addressLine1: validated.address,
                    city: 'Default City', // Required field
                    postalCode: '00000', // Required field
                    email: validated.email,
                    phone: validated.phone,
                    website: validated.website || null,
                    iban: validated.bankAccount || null,
                    bankAccount: validated.bankAccount || null,
                    logoUrl: logoUrl || null,
                },
            });
            // Log audit
            await createAuditLog({
                userId: session.user.id,
                action: AuditAction.UPDATE,
                tableName: 'companies',
                recordId: company.id,
                newValues: validated,
                metadata: {
                    action: 'company_settings_update'
                },
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
