/**
 * Authentication Server Actions
 * Server-side functions for auth operations
 */

'use server';

import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  type LoginFormData,
  type RegisterFormData,
  type ForgotPasswordFormData,
  type ResetPasswordFormData,
  type ChangePasswordFormData,
} from '@/lib/validations/auth-schema';
import {
  signIn,
  signOut,
  getServerAuth,
  createUser,
  generatePasswordResetToken,
  resetPasswordWithToken,
  updatePassword,
  verifyEmailToken,
  regenerateVerificationToken,
} from '@/lib/auth';
import { AuthError } from 'next-auth';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import prisma from '@/lib/prisma/prisma';
import { z } from 'zod';
import { isDuplicateUserError } from '@/lib/auth/auth-helpers';
import {
  getSignupAllowlistConfig,
  isRegistrationEnabled,
  isSignupAllowed,
} from '@/lib/auth/signup-allowlist';
import { RATE_LIMITS, extractClientIp, rateLimiter, rateLimitKey } from '@/lib/rate-limiter';

import { EmailTemplate } from '@/types/mail';
import { emailService } from '@/lib/email';

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

/**
 * Get client IP and user agent
 */
export async function getClientInfo() {
  const headersList = await headers();
  // Shared extraction with authorize() - one implementation (#22): first
  // x-forwarded-for hop, then x-real-ip.
  const ipAddress = extractClientIp(headersList) ?? '';
  const userAgent = headersList.get('user-agent') || '';
  return { ipAddress, userAgent };
}

const AUTH_ERROR_MAP: Record<string, string> = {
  'Invalid email or password': 'Invalid email or password',
  CredentialsSignin: 'Invalid email or password',
  'Read more at': 'Invalid email or password',
  'Account is disabled': 'Account is disabled. Please contact support.',
  'Email not verified': 'Email not verified. We have sent you a new verification link.',
};

const getAuthErrorMessage = (message: string): string | null => {
  // Rate-limit rejections carry their own user-facing text (#22).
  if (message.startsWith('Too many')) {
    return message;
  }

  // A throttled verification send must NOT be mapped to the "we have sent
  // you a new verification link" text - the UI may not claim a send that
  // did not happen (#22).
  if (message.includes('Email not verified') && !message.includes('new verification link')) {
    return message;
  }

  if (message === 'NEXT_REDIRECT') {
    return null; // Indicates success
  }

  for (const [key, errorMessage] of Object.entries(AUTH_ERROR_MAP)) {
    if (message.includes(key)) {
      return errorMessage;
    }
  }

  console.error('Sign in error:', message);
  return 'Authentication failed. Please try again.';
};

/**
 * Sign in with credentials
 */
export async function signInWithCredentials(data: LoginFormData) {
  try {
    const { email, password, rememberMe } = loginSchema.parse(data);
    const { ipAddress, userAgent } = await getClientInfo();

    const result = await signIn('credentials', {
      email,
      password,
      rememberMe: String(rememberMe ?? false),
      ipAddress,
      userAgent,
      redirect: false,
    });

    // With redirect: false, signIn resolves with the callback URL on success.
    if (!result) {
      return { success: false, error: 'Authentication failed. Please try again.' };
    }

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    // NextAuth v5 wraps authorize() failures in an AuthError whose cause
    // carries the real error thrown by the credentials provider.
    if (error instanceof AuthError) {
      const cause = error.cause?.err;
      const message = getAuthErrorMessage(cause instanceof Error ? cause.message : error.type);
      return message === null ? { success: true } : { success: false, error: message };
    }

    if (!(error instanceof Error)) {
      return { success: false, error: 'An unexpected error occurred' };
    }

    const errorMessage = getAuthErrorMessage(error.message);
    if (errorMessage === null) {
      return { success: true };
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Sign in with OAuth provider. Only Google is configured (#23): the
 * 'microsoft-entra-id' union member fed a dead button that always ended on
 * an error page; narrowing the type keeps the dead path from being re-wired
 * silently.
 */
export async function signInWithProvider(provider: 'google') {
  await signIn(provider, { redirectTo: '/dashboard' });
}

/**
 * Neutral registration outcome (#35): identical whether the email was new or
 * already registered, so the public form cannot be used to probe which
 * addresses hold accounts (same pattern as requestPasswordReset).
 *
 * Accepted trade-off (!27 review): this defends the direct oracle only - a
 * duplicate returns after one SELECT while a fresh signup pays bcrypt +
 * insert + send, so a timing probe can still distinguish them. Same accepted
 * posture as requestPasswordReset.
 */
const REGISTRATION_NEUTRAL_MESSAGE =
  'Registration received. If your email is eligible, you will receive a verification link shortly.';

/**
 * Register new user
 */
export async function registerUser(data: RegisterFormData) {
  try {
    const validatedData = registerSchema.parse(data);

    // Master switch (#35): server-side only - a NEXT_PUBLIC_ flag would be
    // decoration, not enforcement - and checked HERE as well as in the page
    // render, because the action is callable without the form. Fail closed.
    if (!isRegistrationEnabled()) {
      return { success: false, error: 'Registration is currently disabled.' };
    }

    // Per-IP bound (!27 review item 1): limiter keys include the email, so
    // an attacker rotating addresses would otherwise get a fresh budget per
    // address - each attempt costing a bcrypt hash and, when allow-listed,
    // a user row + verification send. Consumed BEFORE the allow-list check
    // so membership is not probeable at line rate.
    const { ipAddress } = await getClientInfo();
    const ipGate = await rateLimiter.consume(
      rateLimitKey('registration', '', ipAddress || null),
      RATE_LIMITS.REGISTRATION
    );
    if (!ipGate.success) {
      return {
        success: false,
        error: 'Too many registration attempts. Please try again later.',
      };
    }

    // Signup allow-list (#23): gating OAuth alone would be decoration if
    // anyone could still self-provision a VIEWER account with a password
    // through this public form. Same single authority as the OAuth path;
    // checked before any DB work.
    if (!isSignupAllowed(validatedData.email, getSignupAllowlistConfig())) {
      return {
        success: false,
        error: 'Registration is by invitation. Contact your administrator for access.',
      };
    }

    // Per-email send budget: registration sends a verification email
    // (createUser), so it draws from the same 'verification-email' budget as
    // the unverified-login send path and the public resend form (#22) - one
    // Postgres-enforced cap that registering cannot bypass. Distinct from
    // the IP gate above: send volume per address vs attempt volume per
    // caller.
    const sendGate = await rateLimiter.consume(
      rateLimitKey('verification-email', validatedData.email, ipAddress || null),
      RATE_LIMITS.EMAIL_SEND
    );
    if (!sendGate.success) {
      return {
        success: false,
        error: 'Too many registration attempts. Please try again later.',
      };
    }

    // Create user account (server-assigned defaults: VIEWER, active - the
    // payload can never carry role/isActive).
    await createUser({
      email: validatedData.email,
      password: validatedData.password,
      name: validatedData.name,
    });

    return { success: true, message: REGISTRATION_NEUTRAL_MESSAGE };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.issues.map((issue) => issue.message).join(', '),
      };
    }

    // No user enumeration (#35): an already-registered email gets the SAME
    // neutral success as a fresh one. Typed contract (!27 review item 2):
    // isDuplicateUserError matches the DuplicateUserError pre-check and the
    // P2002 unique-index backstop by instanceof - never by message text.
    if (isDuplicateUserError(error)) {
      return { success: true, message: REGISTRATION_NEUTRAL_MESSAGE };
    }

    console.error('Registration error:', error);
    return { success: false, error: 'Failed to create account' };
  }
}

/**
 * Sign out current user
 */
export async function signOutUser() {
  await signOut({ redirectTo: '/login' });
}

/**
 * Request password reset
 */
export async function requestPasswordReset(data: ForgotPasswordFormData) {
  try {
    const { email } = forgotPasswordSchema.parse(data);
    const { ipAddress, userAgent } = await getClientInfo();
    const baseUrl = getBaseUrl();

    // Throttle the public send trigger (#22): keyed by IP+email, enforced in
    // Postgres across instances. The response stays enumeration-safe - the
    // throttle applies whether or not the account exists.
    const sendGate = await rateLimiter.consume(
      rateLimitKey('password-reset-email', email, ipAddress || null),
      RATE_LIMITS.EMAIL_SEND
    );
    if (!sendGate.success) {
      return {
        success: false,
        error: 'Too many password reset requests. Please try again later.',
      };
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { name: true },
    });

    const token = await generatePasswordResetToken(email);

    if (token && user) {
      // Send password reset email
      const resetUrl = `${baseUrl}/reset-password?token=${token}`;
      await emailService.sendTemplate(EmailTemplate.PASSWORD_RESET, email, {
        name: user.name || 'User',
        email,
        resetUrl,
        expiresIn: '1 hour',
        ipAddress,
        userAgent,
      });
    }

    return {
      success: true,
      message: 'If an account exists with this email, you will receive a password reset link.',
    };
  } catch (error) {
    console.error('Password reset request error:', error);
    return { success: false, error: 'Failed to process request' };
  }
}

/**
 * Reset password with token
 */
export async function resetPassword(token: string, data: ResetPasswordFormData) {
  try {
    const { password } = resetPasswordSchema.parse(data);

    const result = await resetPasswordWithToken(token, password);

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to reset password' };
    }

    return {
      success: true,
      message: 'Password reset successful. You can now sign in with your new password.',
    };
  } catch (error) {
    console.error('Password reset error:', error);
    return { success: false, error: 'Failed to reset password' };
  }
}

/**
 * Change password for authenticated user
 */
export async function changePassword(data: ChangePasswordFormData) {
  try {
    const session = await getServerAuth();

    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const validatedData = changePasswordSchema.parse(data);

    const result = await updatePassword(
      session.user.id,
      validatedData.currentPassword,
      validatedData.newPassword
    );

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to change password' };
    }

    // Force re-authentication
    await signOut({ redirect: false });

    return {
      success: true,
      message: 'Password changed successfully. Please sign in with your new password.',
    };
  } catch (error) {
    console.error('Change password error:', error);
    return { success: false, error: 'Failed to change password' };
  }
}

/**
 * Verify email address
 */
export async function verifyEmail(token: string) {
  try {
    const result = await verifyEmailToken(token);

    if (!result.success) {
      return { success: false, error: result.error || 'Invalid or expired token' };
    }

    return {
      success: true,
      message: 'Email verified successfully. You can now sign in.',
    };
  } catch (error) {
    console.error('Email verification error:', error);
    return { success: false, error: 'Failed to verify email' };
  }
}

/**
 * Resend verification email
 */
export async function resendVerificationEmail(data: ForgotPasswordFormData) {
  try {
    const { email } = forgotPasswordSchema.parse(data);
    const { ipAddress } = await getClientInfo();
    const baseUrl = getBaseUrl();

    // Same budget as the unverified-login send path (#22): one
    // 'verification-email' scope keyed by IP+email, enforced in Postgres
    // across instances - the public form cannot bypass the login-path cap.
    const sendGate = await rateLimiter.consume(
      rateLimitKey('verification-email', email, ipAddress || null),
      RATE_LIMITS.EMAIL_SEND
    );
    if (!sendGate.success) {
      return {
        success: false,
        error: 'Too many verification email requests. Please try again later.',
      };
    }

    const result = await regenerateVerificationToken(email);

    if (result) {
      const verificationUrl = `${baseUrl}/verify-email?token=${result.token}`;

      // Get user name for template
      const user = await prisma.user.findUnique({
        where: { email: result.email },
        select: { name: true },
      });

      await emailService.sendTemplate(EmailTemplate.VERIFICATION, result.email, {
        name: user?.name || 'User',
        email: result.email,
        verificationUrl,
        expiresIn: '24 hours',
      });
    }

    return {
      success: true,
      message:
        'If an unverified account exists with this email, you will receive a verification link.',
    };
  } catch (error) {
    console.error('Resend verification error:', error);
    return { success: false, error: 'Failed to resend verification email' };
  }
}
