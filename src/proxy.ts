/**
 * Next.js Proxy (middleware) — Next 16 convention.
 * Runs on the Node.js runtime, so importing the full auth stack is fine.
 * Protects routes based on authentication and permissions.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { auth } from '@/lib/auth';
import { canAccessRoute } from '@/lib/permissions';
import { contentSecurityPolicyWithNonce } from '@/lib/security-headers';

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
const API_ROUTES = [
  '/api/auth',
  // #41: liveness/readiness probes carry no session and must never be
  // redirected to /login. The route is deliberately shape-only.
  '/api/health',
  // #38: the job runner authenticates with CRON_SECRET (fails closed);
  // a session redirect to /login would break the external cron.
  '/api/jobs',
];

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Request correlation (#21, consumed by createAuditLog; #42 threads the
  // same id through structured logging). Trust a well-formed inbound id
  // (load balancer); otherwise mint one. The format guard caps
  // attacker-controlled header content before it reaches audit rows.
  const inboundRequestId = request.headers.get('x-request-id');
  const requestId =
    inboundRequestId && /^[A-Za-z0-9_-]{8,64}$/.test(inboundRequestId)
      ? inboundRequestId
      : crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  // #63: per-request CSP nonce, minted alongside the request id. Setting
  // the nonce policy on the REQUEST 'content-security-policy' header is
  // how Next.js discovers the nonce and tags its own inline
  // bootstrap/hydration scripts; x-nonce is for custom <Script nonce>.
  // The RESPONSE ships the policy Report-Only until CSP_ENFORCE_NONCE=true
  // (validate ZERO violations across login/dashboard/services/clients
  // first). securityHeadersForEnv stays the single directive authority.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const nonceCsp = contentSecurityPolicyWithNonce(nonce);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', nonceCsp);
  const cspResponseHeader =
    process.env['CSP_ENFORCE_NONCE'] === 'true'
      ? 'Content-Security-Policy'
      : 'Content-Security-Policy-Report-Only';

  const nextWithRequestId = () => {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set(cspResponseHeader, nonceCsp);
    return response;
  };

  // Allow public routes. The request id still flows: audit writes on the
  // public auth paths need correlation too (#21).
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return nextWithRequestId();
  }

  // Allow API routes to handle their own auth
  if (API_ROUTES.some((route) => pathname.startsWith(route))) {
    return nextWithRequestId();
  }

  // Get session
  const session = await auth();

  // Redirect to login if not authenticated
  if (!session?.user) {
    const url = new URL('/login', request.url);
    url.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(url);
  }

  // Check route permissions for dashboard routes
  const GATED_PREFIXES = [
     '/dashboard',
     '/settings',
     '/invoices',
     '/reports',
     '/documents',
     '/suppliers',
     '/clients',
     '/services',
     '/audit-logs',
  ];
  
  if (GATED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const hasAccess = canAccessRoute(session.user.role, pathname);

    if (!hasAccess) {
      // Log unauthorized access attempt
      console.warn(`Unauthorized access attempt by ${session.user.email} to ${pathname}`);

      // Redirect to dashboard with error
      const url = new URL('/dashboard', request.url);
      url.searchParams.set('error', 'unauthorized');
      return NextResponse.redirect(url);
    }
  }

  // Add user info to headers for server components (x-request-id is
  // already set on requestHeaders above)
  requestHeaders.set('x-user-id', session.user.id);
  requestHeaders.set('x-user-role', session.user.role);
  requestHeaders.set('x-user-email', session.user.email ?? '');
  requestHeaders.set('x-pathname', pathname);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  // #63: nonce CSP on every document response (report-only or enforced).
  response.headers.set(cspResponseHeader, nonceCsp);
  return response;
}

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
