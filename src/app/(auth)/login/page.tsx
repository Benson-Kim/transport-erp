/**
 * Login Page
 * User authentication page with credentials and OAuth options
 */

import { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerAuth } from '@/lib/auth';
import { Logo } from '@/components/ui/Logo';
import { LoginForm, OAuthButtons } from '@/components/features/auth';

export const metadata: Metadata = {
  title: 'Sign In | Enterprise Dashboard',
  description: 'Sign in to your account',
};

export default async function LoginPage() {
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
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Sign in to your account to continue
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
          {/* Login Form */}
          <LoginForm />

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-200 dark:border-neutral-800" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-2 text-neutral-500 dark:bg-neutral-950 dark:text-neutral-400">
                Or continue with
              </span>
            </div>
          </div>

          {/* OAuth Buttons */}
          <OAuthButtons />

          {/* Links */}
          <div className="mt-6 flex flex-col space-y-2 text-center text-sm">
            <Link
              href="/forgot-password"
              className="text-primary-600 hover:text-primary-500 dark:text-primary-400"
            >
              Forgot your password?
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

        {/* Footer */}
        <div className="text-center text-xs text-neutral-500 dark:text-neutral-400">
          By signing in, you agree to our{' '}
          <Link href="/terms" className="underline hover:text-neutral-700 dark:hover:text-neutral-300">
            Terms of Service
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="underline hover:text-neutral-700 dark:hover:text-neutral-300">
            Privacy Policy
          </Link>
        </div>
      </div>
    </div>
  );
}