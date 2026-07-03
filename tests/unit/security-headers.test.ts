/**
 * #24 - security headers present and correct.
 */
import { describe, expect, it } from '@jest/globals';

import {
  CONTENT_SECURITY_POLICY,
  securityHeaders,
  securityHeadersForEnv,
} from '@/lib/security-headers';

function headerValue(key: string): string | undefined {
  return securityHeaders.find((h) => h.key === key)?.value;
}

describe('securityHeaders', () => {
  it('includes Content-Security-Policy and Strict-Transport-Security', () => {
    expect(headerValue('Content-Security-Policy')).toBe(CONTENT_SECURITY_POLICY);
    expect(headerValue('Strict-Transport-Security')).toContain('max-age=');
    expect(headerValue('Strict-Transport-Security')).toContain('includeSubDomains');
  });

  it('drops the deprecated X-XSS-Protection header', () => {
    expect(headerValue('X-XSS-Protection')).toBeUndefined();
  });

  it('keeps the standard hardening headers', () => {
    expect(headerValue('X-Content-Type-Options')).toBe('nosniff');
    expect(headerValue('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(headerValue('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});

describe('CONTENT_SECURITY_POLICY', () => {
  it('forbids framing and plugins, and restricts base/form targets', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("object-src 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("base-uri 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("form-action 'self'");
  });

  it('allows the actual upload/avatar hosts for images', () => {
    expect(CONTENT_SECURITY_POLICY).toContain('https://*.backblazeb2.com');
    expect(CONTENT_SECURITY_POLICY).toContain('https://lh3.googleusercontent.com');
  });

  it('defaults to self', () => {
    expect(CONTENT_SECURITY_POLICY.startsWith("default-src 'self'")).toBe(true);
  });
});

describe('securityHeadersForEnv (#24 close-out)', () => {
  it('production serves the full set, including CSP and HSTS', () => {
    const keys = securityHeadersForEnv(true).map((header) => header.key);
    expect(keys).toContain('Content-Security-Policy');
    expect(keys).toContain('Strict-Transport-Security');
    expect(keys).toHaveLength(securityHeaders.length);
  });

  it('non-production serves everything EXCEPT HSTS (would pin http://localhost)', () => {
    const keys = securityHeadersForEnv(false).map((header) => header.key);
    expect(keys).toContain('Content-Security-Policy');
    expect(keys).not.toContain('Strict-Transport-Security');
    expect(keys).toHaveLength(securityHeaders.length - 1);
  });
});
