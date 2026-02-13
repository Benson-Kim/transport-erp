/**
 * Authentication Helper Functions
 * Utilities for auth operations, token generation, and password management
 */

export const runtime = 'nodejs';

import { hash, compare } from 'bcryptjs';
import { addHours } from 'date-fns';
import { UserRole } from '@/app/generated/prisma';
import prisma from '../prisma/prisma';

/**
 * Password hashing configuration
 */
const SALT_ROUNDS = 12;

/**
 * Token expiry durations
 */
const TOKEN_EXPIRY = {
  VERIFICATION: 24, // 24 hours
  PASSWORD_RESET: 1, // 1 hour
  TWO_FACTOR: 0.25, // 15 minutes
};

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
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate and store email verification token
 */
export async function generateVerificationToken(email: string): Promise<string> {
  const token = generateToken();
  const expires = addHours(new Date(), TOKEN_EXPIRY.VERIFICATION);

  // Delete any existing tokens for this email
  await prisma.verificationToken.deleteMany({
    where: { identifier: email },
  });

  // Create new token
  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires,
    },
  });

  return token;
}

/**
 * Verify email verification token
 */
export async function verifyEmailToken(
  token: string
): Promise<{ success: boolean; email?: string; error?: string }> {
  try {
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      return { success: false, error: 'Invalid token' };
    }

    if (verificationToken.expires < new Date()) {
      // Delete expired token
      await prisma.verificationToken.delete({
        where: { token },
      });
      return { success: false, error: 'Token expired' };
    }

    const email = verificationToken.identifier;

    // Update user's email verification status
    await prisma.user.update({
      where: { email },
      data: {
        emailVerified: new Date(),
      },
    });

    // Delete used token
    await prisma.verificationToken.delete({
      where: { token },
    });

    // Create audit log
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (user) {
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
    }

    return { success: true, email };
  } catch (error) {
    console.error('Error verifying email token:', error);
    return { success: false, error: 'Failed to verify token' };
  }
}

/**
 * Generate and store password reset token
 */
export async function generatePasswordResetToken(email: string): Promise<string | null> {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Don't reveal if user exists
      return null;
    }

    const token = generateToken();
    const expires = addHours(new Date(), TOKEN_EXPIRY.PASSWORD_RESET);

    // Delete any existing tokens for this email
    await prisma.verificationToken.deleteMany({
      where: {
        identifier: `password-reset:${email}`,
      },
    });

    // Create new token
    await prisma.verificationToken.create({
      data: {
        identifier: `password-reset:${email}`,
        token,
        expires,
      },
    });

    return token;
  } catch (error) {
    console.error('Error generating password reset token:', error);
    return null;
  }
}

/**
 * Reset password with token
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const resetToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!resetToken?.identifier.startsWith('password-reset:')) {
      return { success: false, error: 'Invalid token' };
    }

    if (resetToken.expires < new Date()) {
      // Delete expired token
      await prisma.verificationToken.delete({
        where: { token },
      });
      return { success: false, error: 'Token expired' };
    }

    const email = resetToken.identifier.replace('password-reset:', '');
    const hashedPassword = await hashPassword(newPassword);

    // Update user password
    const user = await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      },
    });

    // Delete used token
    await prisma.verificationToken.delete({
      where: { token },
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

    // Invalidate all sessions for this user
    await prisma.session.deleteMany({
      where: { userId: user.id },
    });

    if (user.id) {
      await prisma.session.deleteMany({
        where: { userId: user.id },
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Error resetting password:', error);
    return { success: false, error: 'Failed to reset password' };
  }
}

/**
 * Check if user has permission for an action
 */
export function hasPermission(userRole: UserRole, action: string, resource: string): boolean {
  const permissions: Record<UserRole, string[]> = {
    SUPER_ADMIN: ['*'], // All permissions
    ADMIN: [
      'users:*',
      'companies:*',
      'clients:*',
      'suppliers:*',
      'services:*',
      'invoices:*',
      'reports:*',
      'settings:*',
    ],
    MANAGER: [
      'users:read',
      'companies:read',
      'clients:*',
      'suppliers:*',
      'services:*',
      'invoices:*',
      'reports:*',
    ],
    ACCOUNTANT: ['clients:read', 'suppliers:read', 'services:read', 'invoices:*', 'reports:read'],
    OPERATOR: ['clients:read', 'suppliers:read', 'services:*', 'invoices:read'],
    VIEWER: ['clients:read', 'suppliers:read', 'services:read', 'invoices:read', 'reports:read'],
  };

  const userPermissions = permissions[userRole] || [];
  const permission = `${resource}:${action}`;

  return (
    userPermissions.includes('*') ||
    userPermissions.includes(`${resource}:*`) ||
    userPermissions.includes(permission)
  );
}

/**
 * Generate a secure session token
 */
export function generateSessionToken(): string {
  return generateToken(48);
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

  // Length check
  if (password.length >= 8) score++;
  else feedback.push('Password must be at least 8 characters');

  if (password.length >= 12) score++;

  // Uppercase check
  if (/[A-Z]/.test(password)) score++;
  else feedback.push('Include at least one uppercase letter');

  // Lowercase check
  if (/[a-z]/.test(password)) score++;
  else feedback.push('Include at least one lowercase letter');

  // Number check
  if (/\d/.test(password)) score++;
  else feedback.push('Include at least one number');

  // Special character check
  if (/[^A-Za-z0-9]/.test(password)) score++;
  else feedback.push('Include at least one special character');

  return { score: Math.min(score, 5), feedback };
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
  const hashedPassword = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      name: data.name,
      role: data.role || UserRole.VIEWER,
    },
  });

  // Generate verification token
  const verificationToken = await generateVerificationToken(user.email);

  // Create audit log
  await prisma.auditLog.create({
    data: {
      action: 'CREATE',
      tableName: 'users',
      recordId: user.id,
      newValues: {
        email: user.email,
        name: user.name,
        role: user.role,
      },
    },
  });

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

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
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
export function isSessionExpired(session: any): boolean {
  if (!session?.expires) return true;
  return new Date(session.expires) < new Date();
}
