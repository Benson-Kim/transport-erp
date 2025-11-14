/**
 * Email options interface
 */
export interface EmailOptions {
    to: string | string[];
    subject: string;
    html?: string | undefined;
    text?: string | undefined;
    attachments?:
    | Array<{
        filename: string;
        content?: Buffer | string | undefined;
        path?: string | undefined;
        contentType?: string | undefined;
    }>
    | undefined;
    cc?: string | string[] | undefined;
    bcc?: string | string[] | undefined;
    replyTo?: string | undefined;
    headers?: Record<string, string> | undefined;
    priority?: 'high' | 'normal' | 'low' | undefined;
    tags?: string[] | undefined;
    metadata?: Record<string, any> | undefined;
}

/**
 * Email template data interfaces
 */
export interface VerificationEmailData {
    name: string;
    email: string;
    verificationUrl: string;
    expiresIn: string;
}

export interface PasswordResetEmailData {
    name: string;
    email: string;
    resetUrl: string;
    expiresIn: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface WelcomeEmailData {
    name: string;
    email: string;
    loginUrl: string;
    features: string[];
}

export interface InvoiceEmailData {
    recipientName: string;
    recipientEmail: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    totalAmount: string;
    currency: string;
    viewUrl: string;
    downloadUrl: string;
    items: Array<{
        description: string;
        quantity: number;
        unitPrice: string;
        total: string;
    }>;
}

export interface LoadingOrderEmailData {
    recipientName: string;
    recipientEmail: string;
    orderNumber: string;
    orderDate: string;
    services: Array<{
        serviceNumber: string;
        description: string;
        origin: string;
        destination: string;
    }>;
    viewUrl: string;
    downloadUrl: string;
}

export interface NotificationEmailData {
    recipientName: string;
    title: string;
    message: string;
    actionUrl?: string;
    actionLabel?: string;
    type: 'info' | 'success' | 'warning' | 'error';
}