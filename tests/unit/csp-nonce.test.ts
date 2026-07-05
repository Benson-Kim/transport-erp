/**
 * #63: nonce-based CSP policy shape. The nonce policy must drop BOTH
 * 'unsafe-eval' and 'unsafe-inline' from script-src while carrying the
 * per-request nonce; the #24 baseline keeps them until enforcement so the
 * report-only phase runs against real pages.
 */

import {
  CONTENT_SECURITY_POLICY,
  contentSecurityPolicyWithNonce,
} from '@/lib/security-headers';

describe('contentSecurityPolicyWithNonce (#63)', () => {
  const nonce = 'dGVzdC1ub25jZQ==';
  const policy = contentSecurityPolicyWithNonce(nonce);
  const scriptSrc = policy
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('script-src'));

  it('carries the per-request nonce in script-src', () => {
    expect(scriptSrc).toContain(`'nonce-${nonce}'`);
  });

  it("drops 'unsafe-eval' and 'unsafe-inline' from script-src", () => {
    expect(scriptSrc).not.toContain('unsafe-eval');
    expect(scriptSrc).not.toContain('unsafe-inline');
  });

  it('keeps style-src inline (Next injects styled content) and the hard directives', () => {
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
  });

  it('the #24 baseline still permits inline until enforcement flips', () => {
    // Both policies ship during enforcement; a script must satisfy EACH,
    // so the nonce policy is the effective one. The baseline keeps the
    // permissive script-src so report-only can run against real pages.
    expect(CONTENT_SECURITY_POLICY).toContain("'unsafe-inline'");
  });
});
