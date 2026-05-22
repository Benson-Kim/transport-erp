declare namespace NodeJS {
    interface ProcessEnv {
        NODE_ENV: 'development' | 'production' | 'test';

        APP_ENV?: 'staging' | 'development' | 'production' | 'test';

        RESEND_API_KEY?: string;

        EMAIL_FROM?: string;
        EMAIL_FROM_NAME?: string;
        EMAIL_REPLY_TO?: string;

        NEXT_PUBLIC_APP_URL?: string;
        NEXT_PUBLIC_COMPANY_NAME?: string;
        NEXT_PUBLIC_COMPANY_ADDRESS?: string;
        NEXT_PUBLIC_COMPANY_TAX_ID?: string;
        NEXT_PUBLIC_SUPPORT_EMAIL?: string;
        NEXT_PUBLIC_BILLING_EMAIL?: string;

        EMAIL_ENABLE_SENDING?: 'true' | 'false';
        EMAIL_TEST_RECIPIENTS?: string;
        EMAIL_ALLOWED_DOMAINS?: string;
    }
}
