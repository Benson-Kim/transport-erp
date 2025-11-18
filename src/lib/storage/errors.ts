
/**
 * Base storage error class
 */
export class StorageError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 500,
        public details?: any
    ) {
        super(message);
        this.name = 'StorageError';
    }
}

/**
 * File not found error
 */
export class FileNotFoundError extends StorageError {
    constructor(path: string) {
        super(`File not found: ${path}`, 'FILE_NOT_FOUND', 404);
    }
}

/**
 * File upload error
 */
export class FileUploadError extends StorageError {
    constructor(message: string, details?: any) {
        super(message, 'FILE_UPLOAD_FAILED', 400, details);
    }
}

/**
 * File validation error
 */
export class FileValidationError extends StorageError {
    constructor(message: string, details?: any) {
        super(message, 'FILE_VALIDATION_FAILED', 400, details);
    }
}

/**
 * Storage configuration error
 */
export class StorageConfigError extends StorageError {
    constructor(message: string) {
        super(message, 'STORAGE_CONFIG_ERROR', 500);
    }
}

/**
 * Storage quota exceeded error
 */
export class StorageQuotaError extends StorageError {
    constructor(message: string = 'Storage quota exceeded') {
        super(message, 'STORAGE_QUOTA_EXCEEDED', 507);
    }
}

/**
 * Permission denied error
 */
export class StoragePermissionError extends StorageError {
    constructor(message: string = 'Permission denied') {
        super(message, 'PERMISSION_DENIED', 403);
    }
}