/**
 * Check Email Page
 * Shown after registration to prompt users to verify their email
 */

import { Metadata } from 'next';
import Link from 'next/link';

import { Mail } from 'lucide-react';

import { Logo } from '@/components/ui/Logo';
import { AuthFormFooter } from '@/components/features/auth';

export const metadata: Metadata = {
  title: 'Check Your Email | Enterprise Dashboard',
  description: 'Verify your email address to continue',
};

interface CheckEmailPageProps {
  searchParams: Promise<{ email?: string }>;
}

export default async function CheckEmailPage({
  searchParams,
}: CheckEmailPageProps) {
  const { email } = await searchParams;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-neutral-50 to-neutral-100 px-4 py-12 dark:from-neutral-950 dark:to-neutral-900">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center">
          <Logo className="h-12 w-auto" />
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
          <div className="space-y-6">
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
                <Mail className="h-6 w-6 text-primary-600 dark:text-primary-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
                Check your email
              </h1>
              <div className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                {email ? (
                  <p>
                    We&apos;ve sent a verification link to{' '}
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">
                      {email}
                    </span>
                  </p>
                ) : (
                  <p>We&apos;ve sent you a verification link.</p>
                )}
                <p>
                  Click the link in the email to verify your account. The link
                  will expire in 24 hours.
                </p>
              </div>
            </div>

            <div className="rounded-md bg-neutral-50 p-4 dark:bg-neutral-900">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Didn&apos;t receive the email? Check your spam folder, or{' '}
                <Link
                  href="/resend-verification"
                  className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
                >
                  request a new link
                </Link>
                .
              </p>
            </div>

            <AuthFormFooter />

            {/* <Button asChild variant="ghost" className="w-full">
              <Link href="/login">Back to sign in</Link>
            </Button>

            <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
              Need help?{' '}
              <Link
                href="/support"
                className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
              >
                Contact support
              </Link>
            </p> */}
          </div>
        </div>
      </div>
    </div>
  );
}