/**
 * Forgot Password Form Component
 * Form for requesting a password reset email
 */

'use client';

import { useState } from 'react';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Mail } from 'lucide-react';

import { requestPasswordReset } from '@/actions/auth-actions';
import {
    ForgotPasswordFormData,
    forgotPasswordSchema,
} from '@/lib/validations/auth-schema';
import { Button, FormField, Input } from '@/components/ui';
import { AuthFormFooter } from './auth-forms-footer';

export function ForgotPasswordForm() {
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
        setError,
    } = useForm<ForgotPasswordFormData>({
        resolver: zodResolver(forgotPasswordSchema),
        defaultValues: {
            email: '',
        },
    });

    const onSubmit = async (data: ForgotPasswordFormData) => {
        setIsLoading(true);

        try {
            const result = await requestPasswordReset(data);

            if (!result.success) {
                setError('root', {
                    message: result.error || 'Failed to process request',
                });
                return;
            }

            setIsSubmitted(true);
        } catch (error) {
            console.error('Forgot password error:', error);
            setError('root', {
                message: 'An unexpected error occurred. Please try again.',
            });
        } finally {
            setIsLoading(false);
        }
    };

    // Success state — email sent
    if (isSubmitted) {
        return (
            <div className="space-y-6">
                <div className="space-y-4 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                        <Mail className="h-6 w-6 text-green-600 dark:text-green-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                        Check your email
                    </h2>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        If an account exists with that email address, you will receive a
                        password reset link shortly.
                    </p>
                </div>

                <AuthFormFooter />

            </div>
        );
    }

    return (
        <div className="space-y-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
                {/* Email Field */}
                <FormField
                    label="Email"
                    required
                    error={errors.email?.message ?? ''}
                >
                    <Input
                        {...register('email')}
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        error={errors.email?.message ?? ''}
                    />
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
                    loadingText="Sending reset link..."
                >
                    Send Reset Link
                </Button>

                <AuthFormFooter />

            </form>

        </div>
    );
}

