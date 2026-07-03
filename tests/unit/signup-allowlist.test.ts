/**
 * #23 - signup allow-list: the single authority for OAuth AND /register
 * provisioning. Acceptance pinned: a non-allow-listed identity cannot pass;
 * an allow-listed one can; existing active users always keep working;
 * missing config fails CLOSED.
 */
import { describe, expect, it } from '@jest/globals';

import {
  evaluateOAuthSignIn,
  getSignupAllowlistConfig,
  isSignupAllowed,
  parseAllowlist,
} from '@/lib/auth/signup-allowlist';

const EMPTY = { domains: [], emails: [] } as const;
const ACME = { domains: ['acme.es'], emails: ['externo@gestor.com'] } as const;

describe('parseAllowlist / config (#23)', () => {
  it('splits, trims, lowercases and drops empties', () => {
    expect(parseAllowlist(' Acme.ES ,, transporte.com , ')).toEqual(['acme.es', 'transporte.com']);
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist('')).toEqual([]);
  });

  it('reads both env vars', () => {
    const config = getSignupAllowlistConfig({
      AUTH_ALLOWED_SIGNUP_DOMAINS: 'acme.es',
      AUTH_ALLOWED_SIGNUP_EMAILS: 'Externo@Gestor.com',
    });
    expect(config.domains).toEqual(['acme.es']);
    expect(config.emails).toEqual(['externo@gestor.com']);
  });
});

describe('isSignupAllowed (#23 - /register path)', () => {
  it('fails CLOSED with no config', () => {
    expect(isSignupAllowed('ana@acme.es', EMPTY)).toBe(false);
  });

  it('allows an allow-listed domain or exact email, case-insensitively', () => {
    expect(isSignupAllowed('Ana@ACME.es', ACME)).toBe(true);
    expect(isSignupAllowed('EXTERNO@gestor.COM', ACME)).toBe(true);
  });

  it('rejects lookalike and subdomain matches - exact domain only', () => {
    expect(isSignupAllowed('ana@evilacme.es', ACME)).toBe(false);
    expect(isSignupAllowed('ana@sub.acme.es', ACME)).toBe(false);
    expect(isSignupAllowed('ana@acme.es.evil.com', ACME)).toBe(false);
  });

  it('rejects malformed addresses', () => {
    expect(isSignupAllowed('@acme.es', ACME)).toBe(false);
    expect(isSignupAllowed('ana@', ACME)).toBe(false);
    expect(isSignupAllowed('acme.es', ACME)).toBe(false);
  });
});

describe('evaluateOAuthSignIn (#23 - signIn callback path)', () => {
  it('an existing ACTIVE user is invited even with empty config', () => {
    const decision = evaluateOAuthSignIn(
      'ana@anywhere.org',
      { isActive: true, deletedAt: null },
      EMPTY
    );
    expect(decision).toEqual({ allowed: true, reason: 'existing-user' });
  });

  it('a soft-deleted user is denied even when their domain is allow-listed', () => {
    const decision = evaluateOAuthSignIn(
      'ana@acme.es',
      { isActive: true, deletedAt: new Date('2026-01-01') },
      ACME
    );
    expect(decision).toEqual({ allowed: false, reason: 'account-deleted' });
  });

  it('a disabled user is denied', () => {
    const decision = evaluateOAuthSignIn(
      'ana@acme.es',
      { isActive: false, deletedAt: null },
      ACME
    );
    expect(decision).toEqual({ allowed: false, reason: 'account-disabled' });
  });

  it('a NEW allow-listed identity is allowed; a non-allow-listed one is not', () => {
    expect(evaluateOAuthSignIn('nueva@acme.es', null, ACME)).toEqual({
      allowed: true,
      reason: 'allowlisted',
    });
    expect(evaluateOAuthSignIn('random@gmail.com', null, ACME)).toEqual({
      allowed: false,
      reason: 'not-invited',
    });
  });

  it('a NEW identity with no config is denied - fail closed', () => {
    expect(evaluateOAuthSignIn('nueva@acme.es', null, EMPTY)).toEqual({
      allowed: false,
      reason: 'not-invited',
    });
  });

  it('a missing or malformed email is denied', () => {
    expect(evaluateOAuthSignIn(null, null, ACME)).toEqual({ allowed: false, reason: 'no-email' });
    expect(evaluateOAuthSignIn(undefined, null, ACME)).toEqual({
      allowed: false,
      reason: 'no-email',
    });
    expect(evaluateOAuthSignIn('not-an-email', null, ACME)).toEqual({
      allowed: false,
      reason: 'no-email',
    });
  });
});
