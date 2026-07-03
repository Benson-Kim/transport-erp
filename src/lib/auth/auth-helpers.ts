/**
 * Authentication Helper Functions
 * Utilities for auth operations, token generation, and password management
 */

export const runtime = 'nodejs';

import { hash, compare } from 'bcryptjs';
import { addHours } from 'date-fns';

import { Prisma, UserRole } from '@/app/generated/prisma';
import { createAuditLog, withTransaction } from '@/lib/prisma/db-helpers';
import prisma from '@/lib/prisma/prisma';

import { emailService } from '../email';
import { EmailTemplate } from '@/types/mail';

/**
 * Password hashing configuration
 */
const SALT_ROUNDS = 12;

/**
 * Token expiry durations (HOURS)
 */
const TOKEN_EXPIRY = {
  VERIFICATION: 24,
  PASSWORD_RESET: 1,
  TWO_FACTOR: 0.25,
};

/**
 * Token identifier prefixes.
 *
 * NOTE (#18): PASSWORD_RESET previously held a corrupted secret-scanner
 * replacement literal that had been committed into source, so generated
 * reset identifiers never matched the intended namespace. Corrected to the
 * intended 'password-reset:' prefix; generate and verify both use this
 * constant so the fix propagates atomically.
 */
const TOKEN_PREFIX = {
  VERIFICATION: 'email-verification:',
  PASSWORD_RESET: 'password-reset:',
  TWO_FACTOR: '2fa:',
} as const;

/**
 * Hash a password
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return compare(password, hashedPassword);
}

/**
 * Check password strength
 */
export function checkPasswordStrength(password: string): {
  score: number;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) score++;
  else feedback.push('Password must be at least 8 characters');

  if (password.length >= 12) score++;

  if (/[A-Z]/.test(password)) score++;
  else feedback.push('Include at least one uppercase letter');

  if (/[a-z]/.test(password)) score++;
  else feedback.push('Include at least one lowercase letter');

  if (/\d/.test(password)) score++;
  else feedback.push('Include at least one number');

  if (/[^A-Za-z0-9]/.test(password)) score++;
  else feedback.push('Include at least one special character');

  return { score: Math.round((score / 6) * 5), feedback };
}

/**
 * Hash a raw token with SHA-256 for at-rest storage. (#18)
 *
 * The raw token is sent to the user via email; only its hash is stored in the
 * DB. A leaked verification_tokens row cannot be used to reset a password
 * because the attacker would need to reverse SHA-256 to recover the raw token.
 *
 * Uses the Web Crypto API (available in Node 18+ and Edge runtimes).
 * Exported for unit testing.
 */
export async function hashToken(rawToken: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawToken);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a secure session token
 */
export function generateSessionToken(): string {
  return generateToken(48);
}

/**
 * Generate and store email verification token.
 *
 * Stores the SHA-256 hash of the token in the DB; returns the raw token for
 * inclusion in the verification URL. A leaked DB row cannot be used to verify
 * an account without the raw token. (#18)
 */
export async function generateVerificationToken(email: string): Promise<string> {
  const rawToken = generateToken();
  const tokenHash = await hashToken(rawToken);
  const expires = addHours(new Date(), TOKEN_EXPIRY.VERIFICATION);
  const identifier = `${TOKEN_PREFIX.VERIFICATION}${email}`;

  // Delete any existing tokens for this email
  await prisma.verificationToken.deleteMany({
    where: { identifier },
  });

  // Store the hash, not the raw token
  await prisma.verificationToken.create({
    data: { identifier, token: tokenHash, expires },
  });

  // Return the raw token for inclusion in the email URL
  return rawToken;
}

/**
 * Verify email verification token.
 *
 * Hashes the incoming raw token and looks up the hash. Consumes (deletes) the
 * token on success. Should only be called from a POST-confirmed action, not
 * directly from a GET render, to prevent email scanners from burning the
 * token. (#18)
 */
export async function verifyEmailToken(
  rawToken: string
): Promise<{ success: boolean; email?: string; error?: string }> {
  try {
    const tokenHash = await hashToken(rawToken);

    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token: tokenHash },
    });

    if (!verificationToken) {
      return { success: false, error: 'Invalid token' };
    }

    if (!verificationToken.identifier.startsWith(TOKEN_PREFIX.VERIFICATION)) {
      return { success: false, error: 'Invalid token' };
    }

    if (verificationToken.expires < new Date()) {
      await prisma.verificationToken.delete({
        where: { token: tokenHash },
      });
      return { success: false, error: 'Token expired' };
    }

    const email = verificationToken.identifier.replaceAll(TOKEN_PREFIX.VERIFICATION, '');

    // Update user's email verification status
    const user = await prisma.user.update({
      where: { email },
      data: { emailVerified: new Date() },
      select: { id: true },
    });

    // Delete used token
    await prisma.verificationToken.delete({
      where: { token: tokenHash },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        tableName: 'users',
        recordId: user.id,
        newValues: { emailVerified: new Date() },
        metadata: { action: 'email_verification' },
      },
    });

    return { success: true, email };
  } catch (error) {
    console.error('Error verifying email token:', error);
    return { success: false, error: 'Failed to verify token' };
  }
}

/**
 * Check whether a verification token exists and is unexpired, WITHOUT
 * consuming it. Used by the verify-email GET page to show the correct UI
 * state before the user clicks the POST-confirm button. (#18)
 */
export async function peekVerificationToken(
  rawToken: string
): Promise<{ valid: boolean; expired: boolean }> {
  try {
    const tokenHash = await hashToken(rawToken);
    const record = await prisma.verificationToken.findUnique({
      where: { token: tokenHash },
    });
    if (!record || !record.identifier.startsWith(TOKEN_PREFIX.VERIFICATION)) {
      return { valid: false, expired: false };
    }
    if (record.expires < new Date()) {
      return { valid: false, expired: true };
    }
    return { valid: true, expired: false };
  } catch {
    return { valid: false, expired: false };
  }
}

/**
 * Generate and store password reset token.
 *
 * Stores the SHA-256 hash; returns the raw token for the reset URL. (#18)
 */
export async function generatePasswordResetToken(email: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (!user) return null;

    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);
    const expires = addHours(new Date(), TOKEN_EXPIRY.PASSWORD_RESET);
    const identifier = `${TOKEN_PREFIX.PASSWORD_RESET}${email}`;

    // Delete any existing tokens for this email
    await prisma.verificationToken.deleteMany({
      where: { identifier },
    });

    // Store the hash
    await prisma.verificationToken.create({
      data: { identifier, token: tokenHash, expires },
    });

    return rawToken;
  } catch (error) {
    console.error('Error generating password reset token:', error);
    return null;
  }
}

/**
 * Reset password with token.
 *
 * Hashes the incoming raw token and looks up the hash. (#18)
 */
export async function resetPasswordWithToken(
  rawToken: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const tokenHash = await hashToken(rawToken);

    const resetToken = await prisma.verificationToken.findUnique({
      where: { token: tokenHash },
    });

    if (!resetToken?.identifier.startsWith(TOKEN_PREFIX.PASSWORD_RESET)) {
      return { success: false, error: 'Invalid token' };
    }

    if (resetToken.expires < new Date()) {
      await prisma.verificationToken.delete({
        where: { token: tokenHash },
      });
      return { success: false, error: 'Token expired' };
    }

    const email = resetToken.identifier.replaceAll(TOKEN_PREFIX.PASSWORD_RESET, '');
    const hashedPassword = await hashPassword(newPassword);

    // Update user password and revoke existing JWTs via tokenVersion bump (#15).
    const user = await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
      select: { id: true },
    });

    // Delete used token
    await prisma.verificationToken.delete({
      where: { token: tokenHash },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'UPDATE',
        tableName: 'users',
        recordId: user.id,
        metadata: { action: 'password_reset' },
      },
    });

    // session.deleteMany is inert under JWT; the tokenVersion bump above is
    // the effective revocation mechanism (wired in #15).
    await prisma.session.deleteMany({
      where: { userId: user.id },
    });

    return { success: true };
  } catch (error) {
    console.error('Error resetting password:', error);
    return { success: false, error: 'Failed to reset password' };
  }
}

/**
 * Regenerate verification token for an existing user.
 * Returns null if user doesn't exist or is already verified.
 */
export async function regenerateVerificationToken(
  email: string
): Promise<{ token: string; email: string } | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerified: true },
    });

    if (!user || user.emailVerified) {
      return null;
    }

    const token = await generateVerificationToken(email);

    return { token, email: user.email };
  } catch (error) {
    console.error('Error regenerating verification token:', error);
    return null;
  }
}

/**
 * Typed duplicate-account rejection (!27 review item 2): callers needing the
 * anti-enumeration neutral response match this by instanceof - never by
 * message text, which can be reworded without any test failing.
 */
export class DuplicateUserError extends Error {
  constructor(message = 'A user with this email already exists') {
    super(message);
    this.name = 'DuplicateUserError';
  }
}

/**
 * Duplicate detection across both failure paths: the pre-check
 * (DuplicateUserError) and the unique-index backstop when two registrations
 * race (Prisma P2002). Pure predicate, unit-tested without a database
 * (tests/unit/registration-errors.test.ts).
 */
export function isDuplicateUserError(error: unknown): boolean {
  return (
    error instanceof DuplicateUserError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
  );
}

/**
 * Create user account
 */
export async function createUser(data: {
  email: string;
  password: string;
  name: string;
  role?: UserRole;
}) {
  // Check for existing user
  const existingUser = await prisma.user.findUnique({
    where: { email: data.email },
    select: { id: true },
  });

  if (existingUser) {
    throw new DuplicateUserError();
  }

  const hashedPassword = await hashPassword(data.password);

  // User row + audit row commit - or roll back - together (#27 doctrine,
  // !27 review item 4): account creation is a security-relevant event and
  // must never exist without its trail.
  const user = await withTransaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        role: data.role || UserRole.VIEWER,
      },
    });

    await createAuditLog(
      {
        userId: created.id,
        action: 'CREATE',
        tableName: 'users',
        recordId: created.id,
        newValues: {
          email: created.email,
          name: created.name,
          role: created.role,
        },
      },
      tx
    );

    return created;
  });

  // Verification email AFTER commit (!27 review item 4): a send failure must
  // not lose the account or its audit row, and callers must not report
  // "failed to create" for an account that exists. /resend-verification is
  // the recovery path; registerUser's neutral message only promises a link
  // "if eligible".
  let verificationToken: string | null = null;
  try {
    verificationToken = await generateVerificationToken(user.email);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

    await emailService.sendTemplate(EmailTemplate.VERIFICATION, user.email, {
      name: user.name || 'User',
      email: user.email,
      verificationUrl,
      expiresIn: '24 hours',
    });
  } catch (error) {
    console.error('Verification email failed after user creation:', error);
  }

  return { user, verificationToken };
}

/**
 * Update user password
 */
export async function updatePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });

    if (!user?.password) {
      return { success: false, error: 'User not found' };
    }

    // Verify current password
    const validPassword = await verifyPassword(currentPassword, user.password);
    if (!validPassword) {
      return { success: false, error: 'Current password is incorrect' };
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password and revoke existing JWTs via tokenVersion bump (#15).
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        tokenVersion: { increment: 1 },
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'UPDATE',
        tableName: 'users',
        recordId: userId,
        metadata: { action: 'password_change' },
      },
    });

    return { success: true };
  } catch (error) {
    console.error('Error updating password:', error);
    return { success: false, error: 'Failed to update password' };
  }
}

/**
 * Check if session is expired
 */
interface SessionLike {
  expires: string | Date;
}

export function isSessionExpired(session: SessionLike): boolean {
  if (!session?.expires) return true;
  return new Date(session.expires) < new Date();
}
