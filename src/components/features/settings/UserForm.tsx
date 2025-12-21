// /components/features/settings/UserForm.tsx
'use client';

import { useState, useEffect } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  RefreshCw,
  Copy,
  Check,
  User,
  Mail,
  Phone,
  Building2,
  Shield,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useForm } from 'react-hook-form';

import { createUser, updateUser } from '@/actions/user-actions';
import { UserRole } from '@/app/generated/prisma';
import { Button, Card, Input, Select, FormField, Switch } from '@/components/ui';
import { toast } from '@/lib/toast';
import type {
  CreateUser,
  UpdateUser} from '@/lib/validations/settings-schema';
import {
  createUserSchema,
  updateUserSchema,
} from '@/lib/validations/settings-schema';

interface UserFormProps {
  user?: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
    department?: string | null;
    phone?: string | null;
  } | null;
  onSuccess: () => void;
  onCancel: () => void;
  canManageRoles?: boolean;
  currentUserRole?: UserRole;
}

/**
 * User Form Component
 */
export function UserForm({
  user,
  onSuccess,
  onCancel,
  canManageRoles = true,
  currentUserRole,
}: UserFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const isEditing = !!user;

  type FormData = typeof isEditing extends true ? UpdateUser : CreateUser;

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
    setValue,
    watch,
    reset,
  } = useForm<CreateUser | UpdateUser>({
    resolver: zodResolver(isEditing ? updateUserSchema : createUserSchema) as any,
    defaultValues: (isEditing
      ? {
          name: user?.name ?? '',
          email: user?.email ?? '',
          role: user?.role ?? UserRole.OPERATOR,
          status: (user?.isActive ? 'active' : 'inactive'),
          department: user?.department ?? undefined,
          phone: user?.phone ?? undefined,
          password: '',
          confirmPassword: '',
        }
      : {
          name: '',
          email: '',
          role: UserRole.OPERATOR,
          status: 'active' as const,
          department: undefined,
          phone: undefined,
          password: '',
          confirmPassword: '',
          sendWelcomeEmail: true,
        }) as FormData,
  });

  useEffect(() => {
    if (user) {
      reset({
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.isActive ? 'active' : 'inactive',
        department: user.department ?? '',
        phone: user.phone ?? '',
        password: '',
        confirmPassword: '',
      });
    } else {
      reset({
        name: '',
        email: '',
        role: UserRole.OPERATOR,
        status: 'active',
        department: '',
        phone: '',
        password: '',
        confirmPassword: '',
        sendWelcomeEmail: true,
      });
    }
  }, [user, reset]);

  /**
   * Generate secure password
   */
  const generatePassword = () => {
    const upperCase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowerCase = 'abcdefghjkmnpqrstuvwxyz';
    const numbers = '23456789';
    const symbols = '!@#$%^&*';

    // Ensure at least one of each type
    let password = '';
    password += upperCase[Math.floor(Math.random() * upperCase.length)];
    password += lowerCase[Math.floor(Math.random() * lowerCase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    // Fill remaining length
    const allChars = upperCase + lowerCase + numbers + symbols;
    for (let i = 4; i < 12; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle password
    password = password
      .split('')
      .sort(() => Math.random() - 0.5)
      .join('');

    setGeneratedPassword(password);
    setValue('password', password, { shouldDirty: true });
    setValue('confirmPassword', password, { shouldDirty: true });
    setShowPassword(true);
    setShowConfirmPassword(true);
  };

  /**
   * Copy password to clipboard
   */
  const copyPassword = async () => {
    const password = watch('password') || generatedPassword;
    if (!password) return;

    try {
      await navigator.clipboard.writeText(password);
      setPasswordCopied(true);
      toast.success('Copied', 'Password copied to clipboard');
      setTimeout(() => setPasswordCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy password');
    }
  };

  /**
   * Get available role options based on current user's role
   */
  const getRoleOptions = () => {
    const allRoles = [
      { value: UserRole.SUPER_ADMIN, label: 'Super Admin' },
      { value: UserRole.ADMIN, label: 'Administrator' },
      { value: UserRole.MANAGER, label: 'Manager' },
      { value: UserRole.ACCOUNTANT, label: 'Accountant' },
      { value: UserRole.OPERATOR, label: 'Operator' },
      { value: UserRole.VIEWER, label: 'Viewer' },
    ];

    // If current user is not super admin, they cannot create/edit super admin users
    if (currentUserRole !== UserRole.SUPER_ADMIN) {
      return allRoles.filter((role) => role.value !== UserRole.SUPER_ADMIN);
    }

    return allRoles;
  };

  /**
   * Form submission
   */
  const onSubmit = async (data: CreateUser | UpdateUser) => {
    setIsSubmitting(true);

    try {
      // Clean up data for submission
      const submitData = {
        ...data,
        department: data.department || null,
        phone: data.phone || null,
        // Only include password fields if they have values
        ...(isEditing && (!data.password || data.password.trim() === '')
          ? { password: undefined, confirmPassword: undefined }
          : {}),
      };

      const result = isEditing
        ? await updateUser(user.id, submitData as any)
        : await createUser(submitData as any);

      if (result.success) {
        toast.success(
          isEditing ? 'User updated' : 'User created',
          isEditing
            ? 'User information has been updated successfully'
            : generatedPassword
              ? `User created successfully. Password: ${generatedPassword}`
              : 'User has been created successfully'
        );

        // Auto-copy password for new users
        if (!isEditing && generatedPassword) {
          try {
            await navigator.clipboard.writeText(generatedPassword);
            toast.info('Password copied', 'The generated password has been copied to clipboard');
          } catch (error) {
            // Silent fail for clipboard
          }
        }

        onSuccess();
      }
    } catch (error) {
      toast.error('Error', error instanceof Error ? error.message : 'Failed to save user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusValue = watch('status');
  const currentPassword = watch('password');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Information */}
      <div className="space-y-4">
        <FormField label="Full Name" required error={errors.name?.message ?? ''}>
          <Input
            {...register('name')}
            placeholder="John Doe"
            prefix={<User className="h-4 w-4" />}
            autoFocus
          />
        </FormField>

        <FormField label="Email Address" required error={errors.email?.message ?? ''}>
          <Input
            {...register('email')}
            type="email"
            placeholder="john.doe@example.com"
            prefix={<Mail className="h-4 w-4" />}
            disabled={isEditing}
          />
        </FormField>

        <FormField
          label="Role"
          required
          error={errors.role?.message ?? ''}
          helperText="User's access level in the system"
        >
          <Select
            {...register('role')}
            options={getRoleOptions()}
            renderCustom={false}
            disabled={!canManageRoles}
            prefix={<Shield className="h-4 w-4" />}
          />
        </FormField>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Department" error={errors.department?.message ?? ''}>
            <Input
              {...register('department')}
              placeholder="e.g., Operations"
              prefix={<Building2 className="h-4 w-4" />}
            />
          </FormField>

          <FormField label="Phone Number" error={errors.phone?.message ?? ''}>
            <Input
              {...register('phone')}
              type="tel"
              placeholder="+34 900 123 456"
              prefix={<Phone className="h-4 w-4" />}
            />
          </FormField>
        </div>
      </div>

      {/* Password fields - only show when creating new user */}
      {!isEditing && (
        <Card>
          <Card.Header title="Set Password" subtitle="Create a secure password for the new user" />
          <Card.Body>
            <div className="space-y-4">
              <FormField label="Password" required error={errors.password?.message ?? ''}>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      {...register('password')}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Min 8 characters"
                      prefix={<Lock className="h-4 w-4" />}
                      suffix={
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-neutral-400 hover:text-neutral-600"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={generatePassword}
                    icon={<RefreshCw className="h-4 w-4" />}
                  >
                    Generate
                  </Button>
                  {currentPassword && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={copyPassword}
                      icon={
                        passwordCopied ? (
                          <Check className="h-4 w-4 text-success" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )
                      }
                    />
                  )}
                </div>
              </FormField>

              <FormField
                label="Confirm Password"
                required
                error={errors.confirmPassword?.message ?? ''}
              >
                <Input
                  {...register('confirmPassword')}
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Re-enter password"
                  prefix={<Lock className="h-4 w-4" />}
                  suffix={
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="text-neutral-400 hover:text-neutral-600"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  }
                />
              </FormField>

              {generatedPassword && (
                <div className="rounded-lg bg-info-50 border border-info-200 p-3">
                  <p className="text-sm text-info-800">
                    Generated password:{' '}
                    <code className="font-mono bg-white px-2 py-1 rounded">
                      {generatedPassword}
                    </code>
                  </p>
                  <p className="text-xs text-info-600 mt-1">
                    Make sure to save this password securely or share it with the user
                  </p>
                </div>
              )}
            </div>
          </Card.Body>
        </Card>
      )}

      {/* User Status */}
      <FormField label="User Status" helperText="Inactive users cannot log into the system">
        <Switch
          id="status"
          checked={statusValue === 'active'}
          onCheckedChange={(checked) =>
            setValue('status', checked ? 'active' : 'inactive', { shouldDirty: true })
          }
          disabled={isSubmitting}
        />
      </FormField>

      {/* Send Welcome Email Option (only for new users) */}
      {!isEditing && (
        <FormField label="Notifications">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              {...register('sendWelcomeEmail')}
              className="rounded border-neutral-300 text-primary focus:ring-primary"
            />
            <span className="text-sm text-neutral-700">
              Send welcome email with login instructions
            </span>
          </label>
        </FormField>
      )}

      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting} disabled={!isDirty && isEditing}>
          {isEditing ? 'Update User' : 'Create User'}
        </Button>
      </div>
    </form>
  );
}
