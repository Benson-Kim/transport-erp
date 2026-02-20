/**
 * Reset Password Page
 * Allows users to set a new password using a token from their email link
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getServerAuth } from '@/lib/auth';
import { Logo } from '@/components/ui/Logo';
import { AuthFormFooter, ResetPasswordForm } from '@/components/features/auth';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Reset Password | Enterprise Dashboard',
  description: 'Set a new password for your account',
};

interface ResetPasswordPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({
  searchParams,
}: Readonly<ResetPasswordPageProps>) {
  // Redirect if already authenticated
  const session = await getServerAuth();
  if (session) {
    redirect('/dashboard');
  }

  // Validate that a token is present
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-neutral-50 to-neutral-100 px-4 py-12 dark:from-neutral-950 dark:to-neutral-900">
        <div className="w-full max-w-md space-y-8">
          <div className="flex flex-col items-center">
            <Logo className="h-12 w-auto" />
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Invalid Link
            </h1>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              This password reset link is invalid or has expired.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
            <div className="flex flex-col space-y-4 text-center text-sm">
              <Link
                href="/forgot-password"
                className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
              >
                Request a new reset link
              </Link>
              <Link
                href="/login"
                className="text-neutral-600 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
              >
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-neutral-50 to-neutral-100 px-4 py-12 dark:from-neutral-950 dark:to-neutral-900">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="flex flex-col items-center">
          <Logo className="h-12 w-auto" />
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Reset your password
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Please choose a new password. Make sure it's secure and unique.
          </p>
        </div>

        {/* Reset Password Card */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
          <ResetPasswordForm token={token} />

          {/* Links */}

          <AuthFormFooter hideSupportLink />
          {/* 
          <div className="mt-6 flex flex-col space-y-2 text-center text-sm">
            <Link
              href="/login"
              className="text-primary-600 hover:text-primary-500 dark:text-primary-400"
            >
              Back to sign in
            </Link>
          </div> */}
        </div>
      </div>
    </div>
  );
}
