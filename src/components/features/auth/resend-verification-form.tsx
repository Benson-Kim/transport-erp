/**
 * Resend Verification Form Component
 * Form for requesting a new email verification link
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Mail } from 'lucide-react';

import { resendVerificationEmail } from '@/actions/auth-actions';
import {
    ForgotPasswordFormData,
    forgotPasswordSchema,
} from '@/lib/validations/auth-schema';
import { Button, FormField, Input } from '@/components/ui';

export function ResendVerificationForm() {
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
            const result = await resendVerificationEmail(data);

            if (!result.success) {
                setError('root', {
                    message: result.error || 'Failed to process request',
                });
                return;
            }

            setIsSubmitted(true);
        } catch (error) {
            console.error('Resend verification error:', error);
            setError('root', {
                message: 'An unexpected error occurred. Please try again.',
            });
        } finally {
            setIsLoading(false);
        }
    };

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
                        If an account exists with that email and hasn&apos;t been verified
                        yet, you will receive a new verification link shortly.
                    </p>
                </div>

                <Button asChild variant="ghost" className="w-full">
                    <Link href="/login">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Back to sign in
                    </Link>
                </Button>

                <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
                    Need help?{' '}
                    <Link
                        href="/support"
                        className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
                    >
                        Contact support
                    </Link>
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
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

                {errors.root && (
                    <div className="rounded-md bg-red-50 p-3">
                        <p className="text-sm text-red-800">{errors.root.message}</p>
                    </div>
                )}

                <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    loading={isLoading}
                    loadingText="Sending verification link..."
                >
                    Resend Verification Link
                </Button>
            </form>

            <Button asChild variant="ghost" className="w-full">
                <Link href="/login">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to sign in
                </Link>
            </Button>

            <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
                Need help?{' '}
                <Link
                    href="/support"
                    className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
                >
                    Contact support
                </Link>
            </p>
        </div>
    );
}