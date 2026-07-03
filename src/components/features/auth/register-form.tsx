/**
 * Register Form Component (#35)
 * Invitation-gated self-service registration wired to registerUser.
 * The action enforces the ENABLE_USER_REGISTRATION flag, the #23 signup
 * allow-list and the #22 send throttle - this form only presents them.
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';

import { registerUser } from '@/actions/auth-actions';
import { RegisterFormData, registerSchema } from '@/lib/validations/auth-schema';
import { Button, FormField, Input } from '@/components/ui';
import { toast } from '@/lib/toast';

export function RegisterForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);

    try {
      const result = await registerUser(data);

      if (!result.success) {
        setError('root', {
          message: result.error || 'Failed to create account',
        });
        return;
      }

      // Neutral outcome (#35): the action answers identically for new and
      // already-registered emails - just hand off to the check-email page.
      toast.success(result.message ?? 'Registration received.');
      router.push(`/check-email?email=${encodeURIComponent(data.email)}`);
    } catch (error) {
      console.error('Registration error:', error);
      setError('root', {
        message: 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {/* Name Field */}
      <FormField label="Full Name" required error={errors.name?.message ?? ''}>
        <Input
          {...register('name')}
          type="text"
          autoComplete="name"
          placeholder="Your full name"
          error={errors.name?.message ?? ''}
        />
      </FormField>

      {/* Email Field */}
      <FormField label="Email" required error={errors.email?.message ?? ''}>
        <Input
          {...register('email')}
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          error={errors.email?.message ?? ''}
        />
      </FormField>

      {/* Password Field */}
      <FormField label="Password" required error={errors.password?.message ?? ''}>
        <div className="relative">
          <Input
            {...register('password')}
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Create a password"
            error={errors.password?.message ?? ''}
          />
          <Button
            type="button"
            variant="ghost"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
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
            placeholder="Confirm your password"
            error={errors.confirmPassword?.message ?? ''}
          />
          <Button
            type="button"
            variant="ghost"
            aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
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
        loadingText="Creating account..."
      >
        Create Account
      </Button>
    </form>
  );
}
