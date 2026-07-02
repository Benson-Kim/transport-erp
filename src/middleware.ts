/**
 * Next.js Middleware (edge runtime)
 * Protects routes based on authentication.
 *
 * IMPORTANT: this file must stay edge-safe. It builds its own NextAuth
 * instance from the edge-safe auth.config.ts (no Prisma client, bcryptjs,
 * or email imports). Role/permission gating is enforced server-side in
 * layouts, pages, and server actions (requireRole / withPermission).
 */

import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';

import { authConfig } from '@/lib/auth/auth.config';

const { auth } = NextAuth(authConfig);

/**
 * Public routes that don't require authentication
 */
const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/resend-verification',
  '/check-email',
  '/auth-error',
];

/**
 * API routes that have their own authentication
 */
const API_ROUTES = ['/api/auth'];

export default auth((request) => {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow API routes to handle their own auth
  if (API_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  const session = request.auth;

  // Redirect to login if not authenticated
  if (!session?.user) {
    const url = new URL('/login', request.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  // Add user info to headers for server components
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', session.user.id);
  requestHeaders.set('x-user-role', session.user.role);
  requestHeaders.set('x-user-email', session.user.email ?? '');
  requestHeaders.set('x-pathname', pathname);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api/auth (NextAuth routes)
     */
    '/((?!_next/static|_next/image|favicon.ico|public|api/auth).*)',
  ],
};
