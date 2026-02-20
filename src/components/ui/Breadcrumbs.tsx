'use client';

/**
 * Breadcrumbs Component
 * Navigation trail showing current location in app hierarchy
 */

import { Fragment } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ChevronRight, Home } from 'lucide-react';

import { getBreadcrumbs } from '@/components/layout/breadcrumbs-utils';
import { cn } from '@/lib/utils/cn';

interface BreadcrumbsProps {
  className?: string;
  showHome?: boolean;
}

export function Breadcrumbs({ className, showHome = true }: Readonly<BreadcrumbsProps>) {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname);

  if (pathname === '/' || pathname === '/dashboard') {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className={cn('flex items-center space-x-2 text-sm', className)}>
      {showHome && (
        <>
          <Link
            href="/dashboard"
            className="flex items-center text-neutral-500 hover:text-neutral-700 transition-colors"
            aria-label="Home"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
          </Link>
          <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden="true" />
        </>
      )}

      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;

        return (
          <Fragment key={crumb.href}>
            {index > 0 && <ChevronRight className="h-4 w-4 text-neutral-400" aria-hidden="true" />}

            {isLast ? (
              <span className="font-medium text-neutral-900" aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="text-neutral-500 hover:text-neutral-700 transition-colors"
              >
                {crumb.label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
