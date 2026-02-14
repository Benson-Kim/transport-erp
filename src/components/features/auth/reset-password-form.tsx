/**
 * Reset Password Form Component
 * Form for setting a new password using a reset token
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';

import { resetPassword } from '@/actions/auth-actions';
import { ResetPasswordFormData, resetPasswordSchema } from '@/lib/validations/auth-schema';
import { Button, FormField, Input } from '@/components/ui';
import { toast } from '@/lib/toast';

interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: Readonly<ResetPasswordFormProps>) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    setIsLoading(true);

    try {
      const result = await resetPassword(token, data);

      if (!result.success) {
        setError('root', {
          message: result.error || 'Failed to reset password',
        });
        return;
      }

      toast.success('Password reset successful. You can now sign in with your new password.');
      router.push('/login');
    } catch (error) {
      console.error('Password reset error:', error);
      setError('root', {
        message: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {/* New Password Field */}
      <FormField label="New Password" required error={errors.password?.message ?? ''}>
        <div className="relative">
          <Input
            {...register('password')}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Enter your new password"
            error={errors.password?.message ?? ''}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-0 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700"
            icon={showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          />
        </div>
      </FormField>

      {/* Confirm Password Field */}
      <FormField label="Confirm Password" required error={errors.confirmPassword?.message ?? ''}>
        <div className="relative">
          <Input
            {...register('confirmPassword')}
            type={showConfirmPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Confirm your new password"
            error={errors.confirmPassword?.message ?? ''}
          />
          <Button
            type="button"
            variant="ghost"
            onClick={() => setShowConfirmPassword((prev) => !prev)}
            className="absolute right-0 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700"
            icon={
              showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />
            }
          />
        </div>
      </FormField>

      {/* Error Message */}
      {errors.root && (
        <div className="rounded-md bg-red-50 p-3">
          <p className="text-sm text-red-800">{errors.root.message}</p>
        </div>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full"
        disabled={isLoading}
        loading={isLoading}
        loadingText="Resetting password..."
      >
        Update Password
      </Button>
    </form>
  );
}
