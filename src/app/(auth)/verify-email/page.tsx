/**
 * Verify Email Page (#18)
 *
 * GET: peeks at the token (non-consuming) to show the correct UI state.
 * POST-confirm: the user clicks "Verify my email" which calls a server action
 * that consumes the token. This prevents email security scanners / link-preview
 * bots from burning the single-use token on a GET request.
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';

import { CheckCircle, XCircle } from 'lucide-react';

import { getServerAuth, verifyEmailToken, peekVerificationToken } from '@/lib/auth';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui';
import { AuthFormFooter } from '@/components/features/auth';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Verify Email | Transport ERP',
  description: 'Verify your email address to activate your account',
};

interface VerifyEmailPageProps {
  searchParams: Promise<{ token?: string; confirmed?: string }>;
}

/**
 * Server action: consume the token and mark the email as verified.
 * Only called when the user explicitly clicks the confirm button.
 */
async function confirmEmailVerification(formData: FormData) {
  'use server';
  const rawToken = formData.get('token');
  if (typeof rawToken !== 'string' || !rawToken) {
    redirect('/verify-email?confirmed=invalid');
  }
  const result = await verifyEmailToken(rawToken);
  if (result.success) {
    redirect('/verify-email?confirmed=ok');
  } else if (result.error === 'Token expired') {
    redirect('/verify-email?confirmed=expired');
  } else {
    redirect('/verify-email?confirmed=invalid');
  }
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const session = await getServerAuth();
  if (session) {
    redirect('/dashboard');
  }

  const { token, confirmed } = await searchParams;

  // --- POST-confirm result states ---
  if (confirmed === 'ok') {
    return (
      <VerifyEmailLayout>
        <SuccessState />
      </VerifyEmailLayout>
    );
  }

  if (confirmed === 'expired') {
    return (
      <VerifyEmailLayout>
        <ErrorState
          title="Link expired"
          description="This verification link has expired. Please request a new one."
          showResend
        />
      </VerifyEmailLayout>
    );
  }

  if (confirmed === 'invalid') {
    return (
      <VerifyEmailLayout>
        <ErrorState
          title="Invalid link"
          description="This verification link is invalid. Please request a new one."
          showResend
        />
      </VerifyEmailLayout>
    );
  }

  // --- GET: no token ---
  if (!token) {
    return (
      <VerifyEmailLayout>
        <ErrorState
          title="Missing verification link"
          description="This email verification link is invalid. Please request a new one."
        />
      </VerifyEmailLayout>
    );
  }

  // --- GET: peek at the token (non-consuming) ---
  const peek = await peekVerificationToken(token);

  if (!peek.valid) {
    return (
      <VerifyEmailLayout>
        <ErrorState
          title={peek.expired ? 'Link expired' : 'Invalid link'}
          description={
            peek.expired
              ? 'This verification link has expired. Please request a new one.'
              : 'This verification link is invalid. Please request a new one.'
          }
          showResend={peek.expired}
        />
      </VerifyEmailLayout>
    );
  }

  // Token exists and is unexpired: show the confirm button.
  // The token is NOT consumed here; only the form POST consumes it.
  return (
    <VerifyEmailLayout>
      <ConfirmState token={token} action={confirmEmailVerification} />
    </VerifyEmailLayout>
  );
}

function VerifyEmailLayout({ children }: { children: React.ReactNode }) {
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

function ConfirmState({
  token,
  action,
}: {
  token: string;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
          <CheckCircle className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Confirm your email
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Click the button below to verify your email address and activate your account.
        </p>
      </div>
      <form action={action}>
        <input type="hidden" name="token" value={token} />
        <Button type="submit" className="w-full">
          Verify my email
        </Button>
      </form>
    </div>
  );
}

function SuccessState() {
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
          Your email has been verified successfully. You can now sign in.
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
}: {
  title: string;
  description: string;
  showResend?: boolean;
}) {
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
      </div>
    </div>
  );
}
