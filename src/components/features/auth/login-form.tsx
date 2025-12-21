/**
 * Login Form Component
 * Form for user authentication with email and password
 */

'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { signInWithCredentials } from '@/actions/auth-actions';
import { Button, Checkbox, FormField, Input } from '@/components/ui';
import { toast } from '@/lib/toast';
import type { LoginFormData} from '@/lib/validations/auth-schema';
import { loginSchema } from '@/lib/validations/auth-schema';

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      // rememberMe can be undefined here initially
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);

    try {
      const result = await signInWithCredentials(data);

      if (!result.success) {
        setError('root', { message: result.error || 'Authentication failed' });
        return;
      }

      toast.success('Signed in successfully');
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      console.error('Login error:', error);
      setError('root', { message: 'An unexpected error occurred. Please try again.' });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit) as any} className="space-y-5" noValidate>
      {/* Email Field */}
      <FormField label="Email address" required error={errors.email?.message ?? ''}>
        <Input
          {...register('email')}
          type="email"
          autoComplete="email"
          error={errors.email?.message ?? ''}
        />
      </FormField>

      {/* Password Field */}
      <FormField label="Password" required error={errors.password?.message ?? ''}>
        <div className="relative">
          <Input
            {...register('password')}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Enter your password"
            error={errors.password?.message ?? ''}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-0 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700"
            icon={showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          />
        </div>
      </FormField>

      {/* Remember Me */}
      <div className="flex items-center justify-between">
        <Checkbox {...register('rememberMe')} label="Remember me for 30 days" />
      </div>

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
        loadingText="Signing in..."
      >
        Sign in
      </Button>
    </form>
  );
}
