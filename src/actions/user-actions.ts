/**
 * User Management Server Actions
 * CRUD operations for user management
 */

'use server';

import { revalidatePath } from 'next/cache';
import { UserRole } from '@prisma/client';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { withPermission } from '@/lib/rbac';
import { hashPassword } from '@/lib/auth-helpers';
import { createAuditLog } from '@/lib/db-helpers';

/**
 * User creation schema
 */
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8),
  role: z.nativeEnum(UserRole),
  department: z.string().optional(),
  phone: z.string().optional(),
  sendWelcomeEmail: z.boolean().default(true),
});

/**
 * User update schema
 */
const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.nativeEnum(UserRole).optional(),
  department: z.string().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
});

/**
 * Get all users with statistics
 */
export const getUsers = withPermission('users', 'view', async () => {
  const session = await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
  
  const [users, total, active, admins, recentlyActive] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        department: true,
        isActive: true,
        emailVerified: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, isActive: true } }),
    prisma.user.count({
      where: {
        deletedAt: null,
        role: { in: [UserRole.SUPER_ADMIN, UserRole.ADMIN] },
      },
    }),
    prisma.user.count({
      where: {
        deletedAt: null,
        lastLoginAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);
  
  return {
    data: users,
    total,
    active,
    admins,
    recentlyActive,
  };
});

/**
 * Get single user by ID
 */
export const getUser = withPermission('users', 'view', async (userId: string) => {
  await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
  
  const user = await prisma.user.findUnique({
    where: { id: userId, deletedAt: null },
    include: {
      _count: {
        select: {
          services: true,
          invoices: true,
          auditLogs: true,
        },
      },
    },
  });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  return user;
});

/**
 * Create new user
 */
export const createUser = withPermission(
  'users',
  'create',
  async (data: z.infer<typeof createUserSchema>) => {
    const session = await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
    
    const validatedData = createUserSchema.parse(data);
    
    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });
    
    if (existingUser) {
      throw new Error('A user with this email already exists');
    }
    
    // Hash password
    const hashedPassword = await hashPassword(validatedData.password);
    
    // Create user
    const user = await prisma.user.create({
      data: {
        email: validatedData.email,
        name: validatedData.name,
        password: hashedPassword,
        role: validatedData.role,
        department: validatedData.department,
        phone: validatedData.phone,
        emailVerified: new Date(), // Auto-verify for admin-created users
      },
    });
    
    // Create audit log
    await createAuditLog({
      userId: session.user.id,
      action: 'CREATE',
      tableName: 'users',
      recordId: user.id,
      newValues: {
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
    
    // Send welcome email if requested
    if (validatedData.sendWelcomeEmail) {
      // await sendWelcomeEmail(user.email, user.name, validatedData.password);
    }
    
    revalidatePath('/settings/users');
    
    return { success: true, user };
  }
);

/**
 * Update user
 */
export const updateUser = withPermission(
  'users',
  'edit',
  async (userId: string, data: z.infer<typeof updateUserSchema>) => {
    const session = await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
    
    const validatedData = updateUserSchema.parse(data);
    
    // Get current user data for audit
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!currentUser) {
      throw new Error('User not found');
    }
    
    // Prevent demoting super admin unless you are super admin
    if (
      currentUser.role === UserRole.SUPER_ADMIN &&
      session.user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new Error('Only super administrators can modify super admin accounts');
    }
    
    // Prevent self role change
    if (userId === session.user.id && validatedData.role) {
      throw new Error('You cannot change your own role');
    }
    
    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: validatedData,
    });
    
    // Create audit log
    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      tableName: 'users',
      recordId: userId,
      oldValues: currentUser,
      newValues: updatedUser,
    });
    
    // Invalidate user sessions if role changed or deactivated
    if (
      validatedData.role !== undefined ||
      validatedData.isActive === false
    ) {
      await prisma.session.deleteMany({
        where: { userId },
      });
    }
    
    revalidatePath('/settings/users');
    
    return { success: true, user: updatedUser };
  }
);

/**
 * Delete user (soft delete)
 */
export const deleteUser = withPermission(
  'users',
  'delete',
  async (userId: string) => {
    const session = await requireRole([UserRole.SUPER_ADMIN]);
    
    // Prevent self-deletion
    if (userId === session.user.id) {
      throw new Error('You cannot delete your own account');
    }
    
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Prevent deleting super admin
    if (user.role === UserRole.SUPER_ADMIN) {
      throw new Error('Cannot delete super administrator accounts');
    }
    
    // Soft delete user
    await prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
    
    // Invalidate all user sessions
    await prisma.session.deleteMany({
      where: { userId },
    });
    
    // Create audit log
    await createAuditLog({
      userId: session.user.id,
      action: 'DELETE',
      tableName: 'users',
      recordId: userId,
      oldValues: { deletedAt: null },
      newValues: { deletedAt: new Date() },
    });
    
    revalidatePath('/settings/users');
    
    return { success: true };
  }
);

/**
 * Reset user password
 */
export const resetUserPassword = withPermission(
  'users',
  'edit',
  async (userId: string, newPassword: string) => {
    const session = await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
    
    // Validate password
    if (newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters');
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
    
    // Invalidate all user sessions
    await prisma.session.deleteMany({
      where: { userId },
    });
    
    // Create audit log
    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      tableName: 'users',
      recordId: userId,
      metadata: { action: 'password_reset_by_admin' },
    });
    
    return { success: true };
  }
);

/**
 * Toggle user status
 */
export const toggleUserStatus = withPermission(
  'users',
  'edit',
  async (userId: string) => {
    const session = await requireRole([UserRole.SUPER_ADMIN, UserRole.ADMIN]);
    
    // Get current status
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true },
    });
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Toggle status
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isActive: !user.isActive },
    });
    
    // Invalidate sessions if deactivated
    if (!updatedUser.isActive) {
      await prisma.session.deleteMany({
        where: { userId },
      });
    }
    
    // Create audit log
    await createAuditLog({
      userId: session.user.id,
      action: 'UPDATE',
      tableName: 'users',
      recordId: userId,
      oldValues: { isActive: user.isActive },
      newValues: { isActive: updatedUser.isActive },
    });
    
    revalidatePath('/settings/users');
    
    return { success: true, isActive: updatedUser.isActive };
  }
);