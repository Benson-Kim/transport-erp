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
import { authConfig as baseAuthConfig } from './auth.config';
import { generateVerificationToken } from './auth-helpers';
import { loginSchema } from '@/lib/validations/auth-schema';
import { emailService } from '../email';
import { EmailTemplate } from '@/types/mail';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * Full NextAuth configuration (Node.js runtime).
 * Extends the edge-safe base config (auth.config.ts) with the adapter,
 * providers, and everything else that needs Prisma / bcryptjs / email.
 */
export const authConfig = {
  ...baseAuthConfig,

  // Adapter for database persistence
  adapter: PrismaAdapter(prisma) as Adapter,

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
          // Propagate the real failure reason so the sign-in server action
          // can map it to a user-facing message (NextAuth wraps thrown
          // errors in AuthError.cause). Returning null here would collapse
          // every failure into a generic CredentialsSignin.
          console.error('Credentials authorize error:', error);
          throw error instanceof Error ? error : new Error('Authentication failed');
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

  // Callbacks — jwt/session/redirect live in the edge-safe base config.
  callbacks: {
    ...baseAuthConfig.callbacks,

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

  // Security options (useSecureCookies comes from the base config)
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
