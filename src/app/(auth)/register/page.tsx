/**
 * Register Page (#35)
 * Invitation-gated self-service registration. When ENABLE_USER_REGISTRATION
 * is off this route redirects to /login; the server action is independently
 * gated, so the page check is presentation, not the enforcement boundary.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { RegisterForm } from '@/components/features/auth';
import { Logo } from '@/components/ui/Logo';
import { getServerAuth } from '@/lib/auth';
import { isRegistrationEnabled } from '@/lib/auth/signup-allowlist';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Account | Enterprise Dashboard',
  description: 'Create your account',
};

export default async function RegisterPage() {
  // Flag off -> the route does not exist as an affordance (#35).
  if (!isRegistrationEnabled()) {
    redirect('/login');
  }

  // Redirect if already authenticated
  const session = await getServerAuth();
  if (session) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-neutral-50 to-neutral-100 px-4 py-12 dark:from-neutral-950 dark:to-neutral-900">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center">
          <Logo className="h-12 w-auto" />
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
            Create your account
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Registration is by invitation only
          </p>
        </div>

        {/* Register Card */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
          <RegisterForm />

          {/* Links */}
          <div className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
