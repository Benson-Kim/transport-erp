/**
 * Signup allow-list (#23) - the single authority on who may obtain a NEW
 * account, for BOTH provisioning paths:
 *
 * - OAuth: the PrismaAdapter auto-creates a user row for any profile the
 *   signIn callback lets through, so that callback is the only gate against
 *   open self-provisioning (evaluateOAuthSignIn).
 * - Credentials: the public /register form creates accounts directly
 *   (isSignupAllowed) - gating OAuth alone would be decoration.
 *
 * Rules (fail closed):
 * - An existing, active, non-deleted user row is an invitation: allowed
 *   regardless of env config, so a missing variable can never lock the
 *   team out. Soft-deleted / disabled accounts are explicit denials.
 * - Otherwise the email must match AUTH_ALLOWED_SIGNUP_EMAILS (exact) or
 *   AUTH_ALLOWED_SIGNUP_DOMAINS (exact domain after '@'; subdomains and
 *   lookalike domains do NOT match). Case-insensitive.
 * - No config at all -> new identities are DENIED.
 *
 * Pure module: unit-tested without a database (tests/unit/signup-allowlist).
 * Env vars documented in .env.example and src/types/env.d.ts (#24 contract).
 */

export interface SignupAllowlistConfig {
  domains: readonly string[];
  emails: readonly string[];
}

interface SignupAllowlistEnv {
  AUTH_ALLOWED_SIGNUP_DOMAINS?: string | undefined;
  AUTH_ALLOWED_SIGNUP_EMAILS?: string | undefined;
}

/** Parse a comma-separated allow-list entry: trimmed, lowercased, empties dropped. */
export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

export function getSignupAllowlistConfig(
  env: SignupAllowlistEnv = process.env
): SignupAllowlistConfig {
  return {
    domains: parseAllowlist(env.AUTH_ALLOWED_SIGNUP_DOMAINS),
    emails: parseAllowlist(env.AUTH_ALLOWED_SIGNUP_EMAILS),
  };
}

/**
 * May a NEW account be created for this email? (No existing-user semantics:
 * callers with an existing row use evaluateOAuthSignIn instead.)
 */
export function isSignupAllowed(email: string, config: SignupAllowlistConfig): boolean {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return false;

  if (config.emails.includes(normalized)) return true;

  const domain = normalized.slice(at + 1);
  return config.domains.includes(domain);
}

/** Minimal existing-user state the decision needs. */
export interface ExistingSignupUser {
  isActive: boolean;
  deletedAt: Date | null;
}

export type OAuthSignInDecision =
  | { allowed: true; reason: 'existing-user' | 'allowlisted' }
  | { allowed: false; reason: 'no-email' | 'account-disabled' | 'account-deleted' | 'not-invited' };

/**
 * Decide an OAuth sign-in. Existing users are invited (unless disabled or
 * soft-deleted - the old callback ignored deletedAt, letting removed users
 * sign back in); new identities go through the allow-list; the typed reason
 * feeds the audit trail instead of an inscrutable `false`.
 */
export function evaluateOAuthSignIn(
  email: string | null | undefined,
  existingUser: ExistingSignupUser | null,
  config: SignupAllowlistConfig
): OAuthSignInDecision {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) {
    return { allowed: false, reason: 'no-email' };
  }

  if (existingUser) {
    if (existingUser.deletedAt) return { allowed: false, reason: 'account-deleted' };
    if (!existingUser.isActive) return { allowed: false, reason: 'account-disabled' };
    return { allowed: true, reason: 'existing-user' };
  }

  if (isSignupAllowed(normalized, config)) {
    return { allowed: true, reason: 'allowlisted' };
  }

  return { allowed: false, reason: 'not-invited' };
}
