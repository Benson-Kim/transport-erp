/**
 * Complete authentication setup with credentials and OAuth providers
 */

import { compare } from 'bcryptjs';
import prisma from '../prisma/prisma';
import { UserRole } from '@/app/generated/prisma';

import { PrismaAdapter } from '@auth/prisma-adapter';

import NextAuth, {
  type NextAuthConfig,
  type User as NextAuthUser,
  type Session as NextAuthSession,
} from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import type { JWT as DefaultJWT } from 'next-auth/jwt';

import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

import { sendVerificationEmail, sendWelcomeEmail } from '../email';
import { rateLimiter } from '@/lib/rate-limiter';
import { generateVerificationToken } from './auth-helpers';
import { loginSchema } from '@/lib/validations/auth-schema';

// Local helper types to narrow token and session shapes
type AppJWT = DefaultJWT & {
  id?: string;
  role?: UserRole;
  emailVerified?: Date | null;
  twoFactorEnabled?: boolean;
  department?: string | null;
  avatar?: string | null;
};

type AppUser = NextAuthUser & {
  role?: UserRole;
  emailVerified?: Date | null;
  twoFactorEnabled?: boolean;
  department?: string | null;
  avatar?: string | null;
};

type AppSession = NextAuthSession & {
  user: NextAuthSession['user'] & {
    id: string;
    role?: UserRole;
    emailVerified?: Date | null;
    twoFactorEnabled?: boolean;
    department?: string | null;
    avatar?: string | null;
  };
};

/**
 * NextAuth configuration
 */
export const authConfig = {
  // Adapter for database persistence
  adapter: PrismaAdapter(prisma) as Adapter,
  // adapter: PrismaAdapter(prisma),

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
    // Credentials provider for email/password
    Credentials({
      // id: 'credentials',
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        rememberMe: { label: 'Remember Me', type: 'checkbox' },
      },
      async authorize(credentials, req): Promise<NextAuthUser | null> {
        try {
          if (!credentials) {
            throw new Error('Missing credentials');
          }

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
            throw new Error(
              `Too many login attempts. Please try again in ${Math.ceil(
                rateLimitResult.retryAfter / 60000
              )} minutes.`
            );
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

          if (!user || !user.password) {
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
            await sendVerificationEmail(user.email, token);
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
            twoFactorEnabled: user.twoFactorEnabled,
            department: user.department,
            avatar: user.avatar,
          } as unknown as NextAuthUser;
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
      profile(profile: any) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          emailVerified: profile.email_verified ? new Date() : null,
          avatar: profile.picture,
          role: UserRole.VIEWER, // Default role for OAuth users
          twoFactorEnabled: false,
          department: null,
        };
      },
    }),
  ],

  // Callbacks
  callbacks: {
    // Sign in callback
    async signIn({ user, account }) {
      // If provider is not credentials, handle OAuth flow
      if (account?.provider !== 'credentials') {
        if (!user?.email) return false;

        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
        });

        // Reject sign in for disabled accounts
        if (existingUser && !existingUser.isActive) {
          return false;
        }

        // Create audit log for OAuth login if user exists
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
      }

      // For credentials provider, ensure emailVerified
      if (!user?.email) return false;

      const existingUser = await prisma.user.findUnique({
        where: { email: user.email },
      });

      if (!existingUser?.emailVerified) {
        return false;
      }

      return true;
    },

    // JWT callback
    async jwt({ token, user, trigger, session }) {
      const t = token as AppJWT;

      if (user) {
        const u = user as AppUser;
        t.id = (u.id as string) ?? t.id;
        t.role = u.role ?? t.role;
        t.emailVerified = u.emailVerified ?? null;
        t.twoFactorEnabled = u.twoFactorEnabled ?? false;
        t.department = u.department ?? null;
        t.avatar = u.avatar ?? null;
      }

      if (trigger === 'update' && session) {
        // Avoid reassigning token, update in place
        Object.assign(t, session as any);
      }

      return t;
    },

    // Session callback
    async session({ session, token }) {
      const t = token as AppJWT;
      const s = session as AppSession;

      if (s.user) {
        // Ensure a string id
        s.user.id =
          typeof t.id === 'string'
            ? t.id
            : typeof (token as DefaultJWT).sub === 'string'
              ? (token as DefaultJWT).sub!
              : s.user.id;

        // Set required/custom fields
        s.user.role = (t.role as UserRole | undefined) ?? s.user.role ?? UserRole.VIEWER;
        s.user.emailVerified = t.emailVerified ?? null;
        s.user.twoFactorEnabled = Boolean(t.twoFactorEnabled);
        s.user.department = t.department ?? null;
        s.user.avatar = t.avatar ?? null;
      }

      return s;
    },

    // Redirect callback
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`;

      // Allows callback URLs on the same origin
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
    async signIn({ user, account }) {
      console.log(
        `User ${user?.email ?? user?.id} signed in via ${account?.provider ?? 'unknown'}`
      );
    },
    async signOut(message) {
      // message is a union: { session } | { token }
      let userId: string | undefined;

      if ('session' in message) {
        const s = message.session;
        // AdapterSession doesn't have session.user, it has session.userId
        if (s && typeof (s as any).userId === 'string') {
          userId = (s as any).userId as string;
        }
      } else if ('token' in message && message.token) {
        const t = message.token as AppJWT;
        userId =
          (typeof t.id === 'string' && t.id) || (typeof t.sub === 'string' ? t.sub : undefined);
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
        await sendWelcomeEmail(user.email, user.name || 'User');
      }
    },
    async linkAccount({ user, account }) {
      console.log(`Account ${account.provider} linked for user ${user.email}`);
    },
  },

  // Security options
  useSecureCookies: process.env.NODE_ENV === 'production',

  // Debug mode
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
