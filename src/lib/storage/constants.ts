/**
 * Storage paths configuration
 */
export const STORAGE_PATHS = {
    COMPANY_LOGOS: 'company/logos',
    USER_AVATARS: 'users/avatars',
    DOCUMENTS: 'documents',
    INVOICES: 'invoices',
    LOADING_ORDERS: 'loading-orders',
    TEMP: 'temp',
    BACKUPS: 'backups',
} as const;

/**
 * File type restrictions
 */
type FileRestriction = {
    mimeTypes: string[];
    maxSize: number;
    extensions: string[];
};

export const FILE_RESTRICTIONS = {
    images: {
        mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
        maxSize: 5 * 1024 * 1024,
        extensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
    },
    documents: {
        mimeTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        maxSize: 10 * 1024 * 1024,
        extensions: ['.pdf', '.doc', '.docx'],
    },
    spreadsheets: {
        mimeTypes: [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv',
        ],
        maxSize: 10 * 1024 * 1024,
        extensions: ['.xls', '.xlsx', '.csv'],
    },
} satisfies Record<string, FileRestriction>;


export type StoragePath = typeof STORAGE_PATHS[keyof typeof STORAGE_PATHS];

