/**
 * Edge-safe NextAuth configuration.
 *
 * Shared between the middleware (edge runtime) and the full Node.js auth
 * setup in auth.ts. This file MUST NOT import the Prisma client instance,
 * bcryptjs, email services, or any other Node-only module — type-only
 * imports are fine because they are erased at compile time.
 */

import type { NextAuthConfig } from 'next-auth';

import type { UserRole } from '@/app/generated/prisma';

export const authConfig = {
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

  // Providers require Node-only dependencies (Prisma, bcryptjs, email).
  // They are added in auth.ts; the middleware only needs JWT decoding.
  providers: [],

  callbacks: {
    // JWT callback
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token['id'] = user.id;
        token['role'] = user.role;
        token['emailVerified'] = user.emailVerified;
        token['twoFactorEnabled'] = user.twoFactorEnabled;
        token['department'] = user.department;
        token['avatar'] = user.avatar;
      }

      if (trigger === 'update' && session) {
        // Avoid reassigning token, update in place
        const allowed = ['name', 'avatar', 'department'];

        for (const key of allowed) {
          if (key in (session as Record<string, unknown>)) {
            (token as Record<string, unknown>)[key] = (session as Record<string, unknown>)[key];
          }
        }
      }

      return token;
    },

    // Session callback
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token['id'] as string) ?? (token['sub'] as string) ?? session.user.id;
        session.user.role = (token['role'] as UserRole) ?? ('VIEWER' as UserRole);
        session.user.emailVerified = (token['emailVerified'] as Date | null) ?? null;
        session.user.twoFactorEnabled = Boolean(token['twoFactorEnabled']);
        session.user.department = (token['department'] as string | null) ?? null;
        session.user.avatar = (token['avatar'] as string | null) ?? null;
      }

      return session;
    },

    // Redirect callback
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;

      try {
        if (new URL(url).origin === baseUrl) return url;
      } catch {
        // invalid URL — fall through to baseUrl
      }

      return baseUrl;
    },
  },

  // Security options
  useSecureCookies: process.env.NODE_ENV === 'production',
} satisfies NextAuthConfig;
