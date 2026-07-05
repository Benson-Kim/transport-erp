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

/**
 * Headers for a given environment (#24). Everything applies in EVERY
 * environment - CSP violations must surface in dev, not first in prod.
 * Strict-Transport-Security alone is production-only: HSTS pins the host to
 * HTTPS and would break http://localhost development.
 * (Previously next.config.ts served NO headers outside production, while the
 * !16 record claimed "all environments" - source and claim now agree.)
 */
export function securityHeadersForEnv(isProduction: boolean): SecurityHeader[] {
  if (isProduction) return securityHeaders;
  return securityHeaders.filter((header) => header.key !== 'Strict-Transport-Security');
}

/**
 * Nonce-based CSP (#63). script-src carries a per-request nonce and drops
 * BOTH 'unsafe-eval' and 'unsafe-inline'; all other directives mirror the
 * #24 baseline above (this function derives from the same authority - do
 * not fork the directive list).
 *
 * Rollout: src/proxy.ts ships this as Content-Security-Policy-Report-Only
 * until CSP_ENFORCE_NONCE=true. During enforcement the static baseline
 * still ships from next.config; browsers apply BOTH policies and a script
 * must satisfy EACH, so the nonce policy is the effective one. Applies in
 * dev too (#24 decision: CSP breakage surfaces in dev, not first in prod).
 */
export function contentSecurityPolicyWithNonce(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.backblazeb2.com https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    "connect-src 'self' https://*.backblazeb2.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}
