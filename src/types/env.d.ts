declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production' | 'test';
    APP_ENV?: 'staging' | 'development' | 'production' | 'test';

    // Database
    DATABASE_URL: string;
    DIRECT_URL?: string;

    // Authentication (NextAuth v5)
    AUTH_SECRET?: string;
    AUTH_URL?: string;
    /** Deprecated v4 name; supported as a transitional fallback only. */
    NEXTAUTH_SECRET?: string;
    NEXTAUTH_URL?: string;

    // OAuth (Google)
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;

    // Signup allow-list (#23): who may obtain a NEW account (OAuth
    // auto-provisioning and the /register form). Comma-separated; empty =
    // new identities denied (fail closed), existing users unaffected.
    AUTH_ALLOWED_SIGNUP_DOMAINS?: string;
    AUTH_ALLOWED_SIGNUP_EMAILS?: string;

    // Email (Resend)
    RESEND_API_KEY?: string;
    EMAIL_FROM?: string;
    EMAIL_FROM_NAME?: string;
    EMAIL_REPLY_TO?: string;
    EMAIL_ENABLE_SENDING?: 'true' | 'false';
    EMAIL_TEST_RECIPIENTS?: string;
    EMAIL_ALLOWED_DOMAINS?: string;

    // File storage (Backblaze B2 / S3-compatible)
    B2_ENDPOINT?: string;
    B2_REGION?: string;
    B2_APPLICATION_KEY_ID?: string;
    B2_APPLICATION_KEY?: string;
    B2_BUCKET_ID?: string;
    B2_BUCKET_NAME?: string;
    B2_CDN_URL?: string;
    B2_MAX_FILE_SIZE?: string;

    // Server Actions / CSP origins
    ALLOWED_ORIGINS?: string;

    // Public
    NEXT_PUBLIC_APP_URL?: string;
    NEXT_PUBLIC_APP_NAME?: string;
  }
}
