/**
 * NextAuth error landing (#23).
 *
 * authConfig.pages.error and proxy.ts PUBLIC_ROUTES have pointed at
 * /auth-error since Phase 0, but the route never existed: every OAuth
 * failure - including signup allow-list denials (error=AccessDenied) -
 * ended on a 404. A denial must say so honestly and offer a way back.
 */

import Link from 'next/link';

interface ErrorMessage {
  title: string;
  description: string;
}

const DEFAULT_MESSAGE: ErrorMessage = {
  title: 'Something went wrong',
  description: 'The sign-in attempt failed. Please try again.',
};

/** NextAuth error codes this page can receive via ?error=. */
const MESSAGES: Record<string, ErrorMessage> = {
  AccessDenied: {
    title: 'Access denied',
    description:
      'This account is not authorised to sign in. Access is by invitation - contact your administrator to be added.',
  },
  Configuration: {
    title: 'Sign-in unavailable',
    description:
      'Sign-in is misconfigured on the server. Please contact your administrator.',
  },
  Verification: {
    title: 'Link expired',
    description: 'That sign-in link is no longer valid. Request a new one and try again.',
  },
};

export const metadata = { title: 'Sign-in error' };

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = (error ? MESSAGES[error] : undefined) ?? DEFAULT_MESSAGE;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold">{message.title}</h1>
        <p className="mt-2 text-sm">{message.description}</p>
        <Link href="/login" className="button mt-6 inline-flex justify-center">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
