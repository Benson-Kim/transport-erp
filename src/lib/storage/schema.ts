import z from "zod";

/**
 * B2 Storage Configuration Schema
 */
export const b2ConfigSchema = z.object({
    applicationKeyId: z.string().min(1, 'B2 Application Key ID is required'),
    applicationKey: z.string().min(1, 'B2 Application Key is required'),
    bucketId: z.string().min(1, 'B2 Bucket ID is required'),
    bucketName: z.string().min(1, 'B2 Bucket Name is required'),
    region: z.string().default('us-east-005'),
    endpoint: z.url('Invalid B2 endpoint URL'),
    cdnUrl: z.url('Invalid CDN URL').optional(),
    maxFileSize: z.number().default(10 * 1024 * 1024), // 10MB default
    allowedMimeTypes: z.array(z.string()).optional(),
});

export type B2Config = z.infer<typeof b2ConfigSchema>;