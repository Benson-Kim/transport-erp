/**
 * Edge-safe NextAuth configuration.
 *
 * This config is imported by the middleware, which runs on the Edge runtime and
 * therefore MUST NOT pull in Node-only dependencies (bcryptjs, the Prisma
 * adapter, Resend, the rate-limiter). It contains no adapter and no providers
 * with an `authorize` callback that touches the database. Its only job is to
 * decode the JWT so the middleware can read the session for route protection.
 *
 * The full runtime config (adapter, Credentials/Google providers, events) lives
 * in ./auth.ts and is used by the API route handlers and server actions.
 */

import type { NextAuthConfig } from 'next-auth';

import { UserRole } from '@/app/generated/prisma';

export const authEdgeConfig = {
  session: {
    strategy: 'jwt' as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },

  pages: {
    signIn: '/login',
    signOut: '/logout',
    error: '/auth-error',
    verifyRequest: '/verify-email',
    newUser: '/welcome',
  },

  // No providers on the edge: the credentials `authorize` and OAuth profile
  // callbacks require Node-only libraries and DB access. Sign-in flows run
  // through the API route handlers, which use the full config in ./auth.ts.
  providers: [],

  callbacks: {
    // Mirror the JWT/session shaping from the full config so the middleware sees
    // the same session.user fields (id, role, ...) it relies on.
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token['id'] as string) ?? (token['sub'] as string) ?? session.user.id;
        session.user.role = (token['role'] as UserRole) ?? UserRole.VIEWER;
        session.user.emailVerified = (token['emailVerified'] as Date | null) ?? null;
        session.user.twoFactorEnabled = Boolean(token['twoFactorEnabled']);
        session.user.department = (token['department'] as string | null) ?? null;
        session.user.avatar = (token['avatar'] as string | null) ?? null;
      }

      return session;
    },
  },

  useSecureCookies: process.env.NODE_ENV === 'production',
} satisfies NextAuthConfig;
