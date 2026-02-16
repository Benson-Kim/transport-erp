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
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import prisma from '@/lib/prisma/prisma';

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
  const ipAddress = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || '';
  const userAgent = headersList.get('user-agent') || '';
  return { ipAddress, userAgent };
}

const AUTH_ERROR_MAP: Record<string, string> = {
  CredentialsSignin: 'Invalid email or password',
  'Read more at': 'Invalid email or password',
  'Account is disabled': 'Account is disabled. Please contact support.',
  'Email not verified': 'Email not verified. We have sent you a new verification link.',
};

const getAuthErrorMessage = (message: string): string | null => {
  if (message.includes('Too many login attempts')) {
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

    await signIn('credentials', {
      email,
      password,
      rememberMe: String(rememberMe ?? false),
      ipAddress,
      userAgent,
      redirect: false,
    });

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
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
 * Sign in with OAuth provider
 */
export async function signInWithProvider(provider: 'google' | 'microsoft-entra-id') {
  await signIn(provider, { redirectTo: '/dashboard' });
}

/**
 * Register new user
 */
export async function registerUser(data: RegisterFormData) {
  try {
    const validatedData = registerSchema.parse(data);

    // Create user account
    await createUser({
      email: validatedData.email,
      password: validatedData.password,
      name: validatedData.name,
    });

    return {
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
    };
  } catch (error: any) {
    if (error.code === 'P2002') {
      return { success: false, error: 'An account with this email already exists' };
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
    const baseUrl = getBaseUrl();
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
