/**
 * Auth Form Footer
 * Reusable footer for auth pages with optional back link and support link
 */

'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui';

interface AuthFormFooterProps {
  backHref?: string;
  backLabel?: string;
  hideBackLink?: boolean;
  supportHref?: string;
  hideSupportLink?: boolean;
}

export function AuthFormFooter({
  backHref = '/login',
  backLabel = 'Back to sign in',
  hideBackLink = false,
  supportHref = '/support',
  hideSupportLink = false,
}: Readonly<AuthFormFooterProps>) {
  // Nothing to render
  if (hideBackLink && hideSupportLink) return null;

  return (
    <div className="flex items-center justify-between">
      {/* Back Link */}
      {hideBackLink ? (
        <div />
      ) : (
        <Button asChild variant="ghost" icon={<ArrowLeft className="mr-2 h-4 w-4" />}>
          <Link href={backHref}>{backLabel}</Link>
        </Button>
      )}

      {/* Support Link */}
      {!hideSupportLink && (
        <p className="text-right text-sm text-neutral-500 dark:text-neutral-400">
          Need help?{' '}
          <Link
            href={supportHref}
            className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400"
          >
            Contact support
          </Link>
        </p>
      )}
    </div>
  );
}
