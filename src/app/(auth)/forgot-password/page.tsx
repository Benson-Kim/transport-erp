/**
 * Forgot Password Page
 * Allows users to request a password reset link via email
 */

import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getServerAuth } from '@/lib/auth';
import { Logo } from '@/components/ui/Logo';
import { ForgotPasswordForm } from '@/components/features/auth';

export const metadata: Metadata = {
  title: 'Forgot Password | Enterprise Dashboard',
  description: 'Request a password reset link',
};

export default async function ForgotPasswordPage() {
  // Redirect if already authenticated
  const session = await getServerAuth();
  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-neutral-50 to-neutral-100 px-4 py-12 dark:from-neutral-950 dark:to-neutral-900">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="flex flex-col items-center">
          <Logo className="h-12 w-auto" />
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Forgot your password?
          </h1>
          <p className="mt-2 text-center text-sm text-neutral-600 dark:text-neutral-400">
            Enter your email address and we&apos;ll send you a link to reset
            your password.
          </p>
        </div>

        {/* Forgot Password Card */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
          <ForgotPasswordForm />

          {/* Links */}
          <div className="mt-6 flex flex-col space-y-2 text-center text-sm">
            <Link
              href="/login"
              className="text-primary-600 hover:text-primary-500 dark:text-primary-400"
            >
              Back to sign in
            </Link>
            <div className="text-neutral-600 dark:text-neutral-400">
              Don&apos;t have an account?{' '}
              <Link
                href="/register"
                className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
              >
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}