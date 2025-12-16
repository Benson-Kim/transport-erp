// /lib/utils/number-format.ts
import { format as formatDate } from 'date-fns';

// Valid tokens for number formats
export const FORMAT_TOKENS = {
    YYYY: { description: 'Full year', example: '2024' },
    YY: { description: '2-digit year', example: '24' },
    MM: { description: 'Month', example: '01-12' },
    DD: { description: 'Day', example: '01-31' },
    NNNNN: { description: '5-digit number', example: '00042' },
    NNNN: { description: '4-digit number', example: '0042' },
    NNN: { description: '3-digit number', example: '042' },
} as const;

export type FormatToken = keyof typeof FORMAT_TOKENS;

export interface ValidationResult {
    valid: boolean;
    error?: string;
    warnings?: string[];
}

/**
 * Validate a number format string
 */
export function validateNumberFormat(format: string): ValidationResult {
    const warnings: string[] = [];

    if (!format || format.trim() === '') {
        return { valid: false, error: 'Format is required' };
    }

    const hasNumberToken = /N{3,5}/.test(format);
    if (!hasNumberToken) {
        return {
            valid: false,
            error: 'Format must contain a number token (NNN, NNNN, or NNNNN)'
        };
    }

    const numberTokenMatches = format.match(/N{3,5}/g);
    if (numberTokenMatches && numberTokenMatches.length > 1) {
        warnings.push('Multiple number tokens detected. Only the first will be used for sequencing.');
    }

    const hasYearToken = /YY(YY)?/.test(format);
    if (!hasYearToken) {
        warnings.push('Consider adding a year token (YYYY or YY) for better organization.');
    }

    if (format.length > 30) {
        warnings.push('Format is quite long. Consider a shorter format for better readability.');
    }

    return {
        valid: true,
        warnings: warnings.length > 0 ? warnings : undefined
    };
}

/**
 * Generate number format preview
 */
export function generateNumberPreview(format: string, currentNumber: number): string {
    if (!format || typeof format !== 'string') {
        return '';
    }

    const now = new Date();

    // Order matters! Replace longer tokens first to avoid partial replacements
    const replacements: [string, string][] = [
        ['YYYY', now.getFullYear().toString()],
        ['YY', now.getFullYear().toString().slice(-2)],
        ['MM', formatDate(now, 'MM')],
        ['DD', formatDate(now, 'dd')],
        ['NNNNN', currentNumber.toString().padStart(5, '0')],
        ['NNNN', currentNumber.toString().padStart(4, '0')],
        ['NNN', currentNumber.toString().padStart(3, '0')],
    ];

    let preview = format;

    for (const [token, value] of replacements) {
        preview = preview.replace(new RegExp(token, 'g'), value);
    }

    return preview;
}

/**
 * Parse format to identify tokens
 */
export function parseFormatTokens(format: string): {
    tokens: FormatToken[];
    hasNumber: boolean;
    hasYear: boolean;
    hasMonth: boolean;
    hasDay: boolean;
} {
    const tokens: FormatToken[] = [];

    // Check for each token (order by length to avoid partial matches)
    const tokenPatterns: FormatToken[] = ['NNNNN', 'NNNN', 'NNN', 'YYYY', 'YY', 'MM', 'DD'];

    for (const token of tokenPatterns) {
        if (format.includes(token)) {
            tokens.push(token);
        }
    }

    return {
        tokens,
        hasNumber: tokens.some(t => t.startsWith('N')),
        hasYear: tokens.includes('YYYY') || tokens.includes('YY'),
        hasMonth: tokens.includes('MM'),
        hasDay: tokens.includes('DD'),
    };
}