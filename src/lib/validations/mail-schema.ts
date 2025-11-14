import z from "zod";

/**
 * Email configuration schema
 */



const emailWithOptionalName = z.union([
    z.email(), // Plain email: "email@domain.com"
    z.string().regex(
        /^[^<>]+\s*<[^\s@]+@[^\s@]+\.[^\s@]+>$/,
        "Invalid email format. Use 'email@domain.com' or 'Name <email@domain.com>'"
    ) // Name with email: "Name <email@domain.com>"
]);

export const emailConfigSchema = z.object({
    from: emailWithOptionalName,
    replyTo: emailWithOptionalName.optional(),
    provider: z.enum(['smtp', 'sendgrid', 'resend', 'aws-ses']),
    smtp: z
        .object({
            host: z.string(),
            port: z.number(),
            secure: z.boolean(),
            auth: z.object({
                user: z.string(),
                pass: z.string(),
            }),
        })
        .optional(),
    sendgrid: z
        .object({
            apiKey: z.string(),
        })
        .optional(),
    resend: z
        .object({
            apiKey: z.string(),
        })
        .optional(),
    awsSes: z
        .object({
            region: z.string(),
            accessKeyId: z.string(),
            secretAccessKey: z.string(),
        })
        .optional(),
});

export type EmailConfig = z.infer<typeof emailConfigSchema>;