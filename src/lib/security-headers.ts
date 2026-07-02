/**
 * Security response headers (applied to every route via next.config headers()).
 *
 * Extracted from next.config so the policy is unit-testable without importing
 * the webpack/bundle-analyzer config graph. (#24)
 */

/**
 * Content-Security-Policy.
 *
 * Next.js App Router injects inline bootstrap/hydration scripts and styled
 * content, so 'unsafe-inline' is required for script/style until a per-request
 * nonce is wired through middleware. This baseline blocks external script
 * injection and framing; nonce-based hardening of script-src is a follow-up.
 * img/connect allow self + Backblaze B2 (uploads) + Google (OAuth avatars).
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.backblazeb2.com https://lh3.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.backblazeb2.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

export interface SecurityHeader {
  key: string;
  value: string;
}

export const securityHeaders: SecurityHeader[] = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];
