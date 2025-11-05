/**
 * Login Form Component
 * Form for user authentication with email and password
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { toast } from 'react-hot-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, Mail, Lock, AlertCircle } from 'lucide-react';

import { cn } from '@/lib/utils/cn';
import { signInWithCredentials } from '@/actions/auth-actions';
import { loginSchema, type LoginFormData } from '@/lib/validations/auth-schema';
import { Alert, Button, Checkbox, Input, Label } from '@/components/ui';

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setError(null);
      const result = await signInWithCredentials(data);
      
      if (!result.success) {
        setError(result.error || 'Authentication failed');
        return;
      }
      
      toast.success('Signed in successfully');
      router.push('/dashboard');
      router.refresh();
    } catch (error) {
      console.error('Login error:', error);
      setError('An unexpected error occurred. Please try again.');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Error Alert */}
      {error && (
        <Alert variant="error">
          <AlertCircle className="h-4 w-4" />
          {error}
        </Alert>
      )}

      {/* Email Field */}
      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <Input
            {...register('email')}
            id="email"
            type="email"
            placeholder="name@example.com"
            autoComplete="email"
            className={cn(
              'pl-10',
              errors.email && 'border-error-500 focus:ring-error-500'
            )}
          />
        </div>
        {errors.email && (
          <p className="text-sm text-error-600">{errors.email.message}</p>
        )}
      </div>

      {/* Password Field */}
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          <Input
            {...register('password')}
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Enter your password"
            autoComplete="current-password"
            className={cn(
              'pl-10 pr-10',
              errors.password && 'border-error-500 focus:ring-error-500'
            )}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        {errors.password && (
          <p className="text-sm text-error-600">{errors.password.message}</p>
        )}
      </div>

      {/* Remember Me Checkbox */}
      <div className="flex items-center space-x-2">
        <Checkbox
          {...register('rememberMe')}
          id="rememberMe"
        />
        <Label
          htmlFor="rememberMe"
          className="cursor-pointer text-sm font-normal"
        >
          Remember me for 30 days
        </Label>
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Signing in...
          </>
        ) : (
          'Sign in'
        )}
      </Button>
    </form>
  );
}