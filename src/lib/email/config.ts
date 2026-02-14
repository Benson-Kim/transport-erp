/**
 * Email configuration
 */

import { EmailConfig, Environment } from "@/types/mail";

function parseEnvList(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function resolveEnvironment(): Environment {
    const env = process.env.NODE_ENV || 'development';
    // Allow explicit override for staging
    const override = process.env.APP_ENV;
    if (override === 'staging') return 'staging';
    if (env === 'production') return 'production';
    if (env === 'test') return 'test';
    return 'development';
}

export function getEmailConfig(): EmailConfig {
    const environment = resolveEnvironment();

    const base: EmailConfig = {
        environment,
        resendApiKey: process.env.RESEND_API_KEY || '',
        from: {
            email: process.env.EMAIL_FROM || 'noreply@transport-erp.com',
            name: process.env.EMAIL_FROM_NAME || 'Transport ERP',
        },
        replyTo: process.env.EMAIL_REPLY_TO || 'support@transport-erp.com',
        baseUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        company: {
            name: process.env.NEXT_PUBLIC_COMPANY_NAME || 'Transport ERP',
            address:
                process.env.NEXT_PUBLIC_COMPANY_ADDRESS ||
                '123 Business St, Madrid, Spain 28001',
            taxId: process.env.NEXT_PUBLIC_COMPANY_TAX_ID || '',
            supportEmail:
                process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@transport-erp.com',
            billingEmail:
                process.env.NEXT_PUBLIC_BILLING_EMAIL || 'billing@transport-erp.com',
        },
        sending: {
            enabled: false,
            maxRetries: 3,
            retryDelay: 5000,
            batchSize: 100,
            rateLimitPerHour: 500,
        },
        queue: {
            enabled: false,
        },
        logging: {
            enabled: true,
            debug: false,
        },
        restrictions: {
            allowedDomains: [],
            testRecipients: [],
        },
    };

    switch (environment) {
        case 'development':
            return {
                ...base,
                sending: {
                    ...base.sending,
                    // Opt-in: set EMAIL_ENABLE_SENDING=true to actually send in dev
                    enabled: process.env.EMAIL_ENABLE_SENDING === 'true',
                },
                logging: {
                    enabled: true,
                    debug: true,
                },
                restrictions: {
                    // In dev, only send to test recipients if sending is enabled
                    allowedDomains: [],
                    testRecipients: parseEnvList(process.env.EMAIL_TEST_RECIPIENTS),
                },
            };

        case 'staging':
            return {
                ...base,
                sending: {
                    ...base.sending,
                    enabled: true,
                    rateLimitPerHour: 100,
                },
                queue: {
                    enabled: true,
                },
                logging: {
                    enabled: true,
                    debug: true,
                },
                restrictions: {
                    // In staging, only send to allowed domains
                    allowedDomains: parseEnvList(
                        process.env.EMAIL_ALLOWED_DOMAINS
                    ),
                    testRecipients: parseEnvList(process.env.EMAIL_TEST_RECIPIENTS),
                },
            };

        case 'production':
            return {
                ...base,
                sending: {
                    ...base.sending,
                    enabled: true,
                },
                queue: {
                    enabled: true,
                },
                logging: {
                    enabled: true,
                    debug: false,
                },
                restrictions: {
                    // No restrictions in production
                    allowedDomains: [],
                    testRecipients: [],
                },
            };

        case 'test':
            return {
                ...base,
                sending: {
                    ...base.sending,
                    enabled: false,
                },
                logging: {
                    enabled: false,
                    debug: false,
                },
            };

        default:
            return base;
    }
}