/**
 * Verify Email Page
 * Processes the email verification token from the URL
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { CheckCircle, XCircle } from 'lucide-react';

import { getServerAuth, verifyEmailToken } from '@/lib/auth';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui';
import { AuthFormFooter } from '@/components/features/auth';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Verify Email | Enterprise Dashboard',
  description: 'Verify your email address to activate your account',
};

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function VerifyEmailPage({ searchParams }: Readonly<VerifyEmailPageProps>) {
  // Redirect if already authenticated
  const session = await getServerAuth();
  if (session) {
    redirect('/dashboard');
  }

  const { token } = await searchParams;

  if (!token) {
    return (
      <VerifyEmailLayout>
        <ErrorState
          title="Missing verification Link"
          description="This email verification link is invalid. Please request a new one."
        />
      </VerifyEmailLayout>
    );
  }

  // Verify the token server-side
  const result = await verifyEmailToken(token);

  if (!result.success) {
    return (
      <VerifyEmailLayout>
        <ErrorState
          title="Verification failed"
          description={
            result.error === 'Token expired'
              ? 'This verification link has expired. Please request a new one.'
              : 'This verification link is invalid. Please request a new one.'
          }
          showResend
        />
      </VerifyEmailLayout>
    );
  }

  // success
  return (
    <VerifyEmailLayout>
      <SuccessState {...(result.email ? { email: result.email } : {})} />
    </VerifyEmailLayout>
  );
}

function VerifyEmailLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-br from-neutral-50 to-neutral-100 px-4 py-12 dark:from-neutral-950 dark:to-neutral-900">
      <div className="w-full max-w-md space-y-8">
        <div className="flex flex-col items-center">
          <Logo className="h-12 w-auto" />
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-white p-8 shadow-xl dark:border-neutral-800 dark:bg-neutral-950">
          {children}
        </div>
      </div>
    </div>
  );
}

function SuccessState({ email }: Readonly<{ email?: string }>) {
  return (
    <div className="space-y-6">
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Email verified
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {email ? (
            <>
              <span className="font-medium text-neutral-900 dark:text-neutral-100">{email}</span>{' '}
              has been verified successfully.
            </>
          ) : (
            'Your email has been verified successfully.'
          )}
        </p>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          You can now sign in to your account.
        </p>
      </div>

      <Button asChild className="w-full">
        <Link href="/login">Sign in to your account</Link>
      </Button>
    </div>
  );
}

function ErrorState({
  title,
  description,
  showResend = false,
}: Readonly<{
  title: string;
  description: string;
  showResend?: boolean;
}>) {
  return (
    <div className="space-y-6">
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
          <XCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          {title}
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
      </div>

      <div className="flex flex-col space-y-3">
        {showResend && (
          <Button asChild variant="secondary" className="w-full">
            <Link href="/resend-verification">Resend verification email</Link>
          </Button>
        )}

        <AuthFormFooter />

        {/* <Button asChild variant="ghost" className="w-full">
          <Link href="/login">Back to sign in</Link>
        </Button>
        </div>
        
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
  );
}
