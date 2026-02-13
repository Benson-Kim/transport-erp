/**
 * Complete authentication setup with credentials and OAuth providers
 */

import { compare } from 'bcryptjs';

import prisma from '@/lib/prisma/prisma';
import { UserRole } from '@/app/generated/prisma';
import { PrismaAdapter } from '@auth/prisma-adapter';

import NextAuth, { type NextAuthConfig } from 'next-auth';
import type { Adapter } from 'next-auth/adapters';

import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

import { rateLimiter } from '@/lib/rate-limiter';
import { generateVerificationToken } from './auth-helpers';
import { loginSchema } from '@/lib/validations/auth-schema';
import { emailService } from '../email';
import { EmailTemplate } from '@/types/mail';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * NextAuth configuration
 */
export const authConfig = {
  // Adapter for database persistence
  adapter: PrismaAdapter(prisma) as Adapter,
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

  // Authentication providers
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        rememberMe: { label: 'Remember Me', type: 'checkbox' },
      },
      async authorize(credentials, req) {
        if (!credentials) {
          throw new Error('Missing credentials');
        }

        try {
          // Validate input
          const validatedFields = loginSchema.parse({
            email: credentials.email,
            password: credentials.password,
            rememberMe: credentials.rememberMe,
          });

          // Get IP/User-Agent from the Request
          const ip =
            req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
            req.headers.get('x-real-ip') ??
            null;
          const userAgent = req.headers.get('user-agent') ?? null;

          // Rate limit
          const rateLimitResult = await rateLimiter.check(validatedFields.email, 5, 15 * 60 * 1000);

          if (!rateLimitResult.success) {
            const minutes = Math.ceil(rateLimitResult.retryAfter / 60000);
            throw new Error(`Too many login attempts. Please try again in ${minutes} minutes.`);
          }

          // Find user by email
          const user = await prisma.user.findUnique({
            where: { email: validatedFields.email },
            select: {
              id: true,
              email: true,
              name: true,
              password: true,
              role: true,
              emailVerified: true,
              twoFactorEnabled: true,
              isActive: true,
              department: true,
              avatar: true,
            },
          });

          if (!user?.password) {
            await rateLimiter.increment(validatedFields.email);
            throw new Error('Invalid email or password');
          }

          if (!user.isActive) {
            throw new Error('Account is disabled. Please contact support.');
          }

          const passwordValid = await compare(validatedFields.password, user.password);
          if (!passwordValid) {
            await rateLimiter.increment(validatedFields.email);
            throw new Error('Invalid email or password');
          }

          if (!user.emailVerified) {
            const token = await generateVerificationToken(user.email);

            await emailService.sendTemplate(EmailTemplate.VERIFICATION, user.email, {
              name: user.name || 'User',
              email: user.email,
              verificationUrl: `${baseUrl}/verify-email?token=${token}`,
              expiresIn: '24 hours',
            });

            throw new Error('Email not verified. We have sent you a new verification link.');
          }

          await rateLimiter.reset(validatedFields.email);

          await prisma.user.update({
            where: { id: user.id },
            data: {
              lastLoginAt: new Date(),
              lastLoginIp: ip,
            },
          });

          await prisma.auditLog.create({
            data: {
              userId: user.id,
              action: 'LOGIN',
              tableName: 'users',
              recordId: user.id,
              ipAddress: ip,
              userAgent,
              metadata: {
                provider: 'credentials',
                rememberMe: Boolean(validatedFields.rememberMe),
              },
            },
          });

          // Return the public user object for NextAuth
          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            emailVerified: user.emailVerified,
            twoFactorEnabled: user.twoFactorEnabled ?? false,
            isActive: user.isActive,
            department: user.department,
            avatar: user.avatar,
          };
        } catch (error) {
          console.error('Authentication error:', error);
          return null;
        }
      },
    }),

    // Google OAuth provider
    Google({
      clientId: process.env['GOOGLE_CLIENT_ID']!,
      clientSecret: process.env['GOOGLE_CLIENT_SECRET']!,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          emailVerified: profile.email_verified ? new Date() : null,
          avatar: profile.picture,
          role: UserRole.VIEWER, // Default role for OAuth users
          twoFactorEnabled: false,
          isActive: true,
          department: null,
        };
      },
    }),
  ],

  // Callbacks
  callbacks: {
    // Sign in callback
    async signIn({ user, account }) {
      if (account?.provider === 'credentials') {
        // confirm emailVerified
        return !!user?.emailVerified;
      }

      // OAuth sign-ins are allowed, but we check if the email is verified in the profile callback
      if (!user?.email) return false;

      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
        select: { id: true, isActive: true },
      });

      // Block disabled accounts
      if (existingUser && !existingUser.isActive) {
        return false;
      }

      if (existingUser) {
        await prisma.auditLog.create({
          data: {
            userId: existingUser.id,
            action: 'LOGIN',
            tableName: 'users',
            recordId: existingUser.id,
            metadata: { provider: account?.provider },
          },
        });
      }

      return true;
    },

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
        session.user.role = (token['role'] as UserRole) ?? UserRole.VIEWER;
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

  // Events
  events: {
    async signOut(message) {
      let userId: string | undefined;

      if ('session' in message && message.session) {
        userId = (message.session as { userId?: string }).userId;
      } else if ('token' in message && message.token) {
        userId = (message.token['id'] as string) ?? message.token.sub;
      }

      if (userId) {
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'LOGOUT',
            tableName: 'users',
            recordId: userId,
          },
        });
      }
    },

    async createUser({ user }) {
      if (user?.email) {
        await emailService.sendTemplate(EmailTemplate.WELCOME, user.email, {
          name: user.name || 'User',
          email: user.email,
          loginUrl: `${baseUrl}/login`,
          features: [
            'Manage transport services and routes',
            'Track invoices and payments',
            'Generate loading orders',
            'View reports and analytics',
          ],
        });
      }
    },
  },

  // Security options
  useSecureCookies: process.env.NODE_ENV === 'production',
  debug: process.env.NODE_ENV === 'development',
} satisfies NextAuthConfig;

/**
 * Create and export NextAuth instance
 */
export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth(authConfig);

/**
 * Auth wrapper for server components
 */
export async function getServerAuth() {
  const session = await auth();
  return session;
}

/**
 * Require authentication wrapper
 */
export async function requireAuth() {
  const session = await getServerAuth();

  if (!session?.user) {
    throw new Error('Unauthorized');
  }

  return session;
}

/**
 * Require specific role wrapper
 */
export async function requireRole(allowedRoles: UserRole[]) {
  const session = await requireAuth();

  if (!allowedRoles.includes(session.user.role)) {
    throw new Error('Forbidden');
  }

  return session;
}
