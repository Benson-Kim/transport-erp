/**
 * Authentication Server Actions
 * Server-side functions for auth operations
 */

'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { AuthError } from 'next-auth';

import { getServerAuth ,
  createUser,
  generatePasswordResetToken,
  resetPasswordWithToken,
  updatePassword,
  verifyEmailToken,
, signIn, signOut } from '@/lib/auth';
import { sendVerificationEmail } from '@/lib/email';
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
// import prisma from '@/lib/prisma/prisma';

/**
 * Get client IP and user agent
 */
export async function getClientInfo() {
  const headersList = await headers();
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || '';
  const userAgent = headersList.get('user-agent') || '';
  return { ip, userAgent };
}

/**
 * Sign in with credentials
 */
export async function signInWithCredentials(data: LoginFormData) {
  try {
    const { email, password, rememberMe } = loginSchema.parse(data);
    const { ip, userAgent } = await getClientInfo();

    const result = await signIn('credentials', {
      email,
      password,
      rememberMe,
      ip,
      userAgent,
      redirect: false,
    });

    if (!result) {
      return { success: false, error: 'Authentication failed' };
    }

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { success: false, error: 'Invalid email or password' };
        case 'AccessDenied':
          return { success: false, error: 'Access denied' };
        default:
          return { success: false, error: 'Authentication failed' };
      }
    }

    console.error('Sign in error:', error);
    return { success: false, error: 'An unexpected error occurred' };
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
    const { user, verificationToken } = await createUser({
      email: validatedData.email,
      password: validatedData.password,
      name: validatedData.name,
    });

    // Send verification email
    await sendVerificationEmail(user.email, verificationToken);

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
    const validatedData = forgotPasswordSchema.parse(data);

    // Generate reset token (doesn't reveal if email exists)
    const token = await generatePasswordResetToken(validatedData.email);

    if (token) {
      // Send password reset email
      // await sendPasswordResetEmail(validatedData.email, token);
    }

    // Always return success to prevent email enumeration
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
    const validatedData = resetPasswordSchema.parse(data);

    const result = await resetPasswordWithToken(token, validatedData.password);

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
// export async function resendVerificationEmail(email: string) {
//   try {
//     // Implementation for resending verification email
//     // This would generate a new token and send the email

//     return {
//       success: true,
//       message: 'Verification email sent. Please check your inbox.',
//     };
//   } catch (error) {
//     console.error('Resend verification error:', error);
//     return { success: false, error: 'Failed to send verification email' };
//   }
// }

// /**
//  * Resend verification email
//  */
// export async function resendVerificationEmail(email: string) {
//   try {
//     // 1️⃣ Find existing user
//     const user = await prisma.user.findUnique({ where: { email } });
//     if (!user) {
//       return { success: false, error: 'User not found' };
//     }

//     if (user.emailVerified) {
//       return { success: false, error: 'Email is already verified.' };
//     }

//     // 2️⃣ Generate a new verification token
//     const token = generateToken(32);

//     // 3️⃣ Save or update token in your verification token table
//     await prisma.verificationToken.upsert({
//       where: { userId: user.id },
//       update: {
//         token,
//         expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h expiry
//       },
//       create: {
//         userId: user.id,
//         token,
//         expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
//       },
//     });

//     // 4️⃣ Send the verification email
//     await sendVerificationEmail(user.email, token);

//     return {
//       success: true,
//       message: 'Verification email sent. Please check your inbox.',
//     };
//   } catch (error) {
//     console.error('Resend verification error:', error);
//     return { success: false, error: 'Failed to send verification email' };
//   }
// }
