/**
 * NextAuth.js v5 Configuration
 * Complete authentication setup with credentials and OAuth providers
 */

import { compare } from 'bcryptjs';

import prisma from '../prisma/prisma';
import { UserRole } from '@prisma/client';
import { PrismaAdapter } from '@auth/prisma-adapter';

import NextAuth, { AuthOptions, User, Account } from 'next-auth';
import { Adapter } from 'next-auth/adapters';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

import { sendVerificationEmail } from '../email';
import { rateLimiter } from '@/lib/rate-limiter';
import { generateVerificationToken } from './auth-helpers';
import { loginSchema } from '@/lib/validations/auth-schema';

/**
 * Credential input shape used by the credentials provider
 */
type CredentialsInput = {
  email?: string;
  password?: string;
  rememberMe?: string;
  ip?: string;
  userAgent?: string;
};

/**
 * NextAuth configuration
 */
export const authConfig: AuthOptions = {
  // Adapter for database persistence
  adapter: PrismaAdapter(prisma) as Adapter,

  // Session configuration
  session: {
    strategy: 'jwt' as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },

  // JWT configuration
  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  // Page routes
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
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        rememberMe: { label: 'Remember Me', type: 'checkbox' },
      },
      async authorize(credentials: CredentialsInput | undefined) {
        try {
          // Require credentials to be present
          if (!credentials) {
            // If NextAuth calls authorize without credentials, reject
            throw new Error('Missing credentials');
          }

          // Validate input (loginSchema should validate required fields)
          
          const validatedFields = loginSchema.parse({
            email: credentials.email,
            password: credentials.password,
            rememberMe: credentials.rememberMe,
          });

          // Check rate limiting
          const rateLimitResult = await rateLimiter.check(
            validatedFields.email,
            5, // max attempts
            15 * 60 * 1000 // 15 minutes window in ms
          );

          if (!rateLimitResult.success) {
            throw new Error(
              `Too many login attempts. Please try again in ${Math.ceil(
                rateLimitResult.retryAfter / 60000
              )} minutes.`
            );
          }

          // Find user by email (only non-deleted users)
          const user = await prisma.user.findUnique({
            where: {
              email: validatedFields.email,
            },
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

          // Check if account is active
          if (!user.isActive) {
            throw new Error('Account is disabled. Please contact support.');
          }

          // Verify password
          const passwordValid = await compare(validatedFields.password, user.password);

          if (!passwordValid) {
            await rateLimiter.increment(validatedFields.email);
            throw new Error('Invalid email or password');
          }

          // Check email verification
          if (!user.emailVerified) {
            // Send verification email (non-blocking would be fine, but we await to ensure mail attempted)
            const token = await generateVerificationToken(user.email);
            await sendVerificationEmail(user.email, token);
            throw new Error('Email not verified. We have sent you a new verification link.');
          }

          // Reset rate limiter on successful login
          await rateLimiter.reset(validatedFields.email);

          // Update last login (use optional chaining for credentials fields)
          await prisma.user.update({
            where: { id: user.id },
            data: {
              lastLoginAt: new Date(),
              lastLoginIp: credentials?.ip ?? null,
            },
          });

          // Create audit log — make sure to safely read optional fields
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              action: 'LOGIN',
              tableName: 'users',
              recordId: user.id,
              ipAddress: credentials?.ip ?? null,
              userAgent: credentials?.userAgent ?? null,
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
          };
        } catch (error) {
          // Log error for debugging, but return null to indicate authentication failure
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
          role: 'VIEWER', // Default role for OAuth users
          twoFactorEnabled: false,
          department: null,
        };
      },
    }),
  ],

  // Callbacks
  callbacks: {
    // Sign in callback
    async signIn({ user, account }: { user: User; account: Account | null }) {
      // If provider is not credentials, we handle OAuth flow
      if (account?.provider !== 'credentials') {
        if (!user.email) return false;

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
              metadata: {
                provider: account?.provider,
              },
            },
          });
        }

        // Allow OAuth sign-in (we already checked disabled state)
        return true;
      }

      // For credentials provider, ensure emailVerified
      if (!user.email) return false;

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
      if (user) {
        // Initial sign in -> augment token
        token.id = user.id;
        token.role = user.role;
        token.emailVerified = user.emailVerified ?? null;
        token.twoFactorEnabled = user.twoFactorEnabled ?? false;
        token.department = user.department ?? null;
        token.avatar = user.avatar ?? null;
      }

      if (trigger === 'update' && session) {
        token = { ...token, ...session };
      }

      return token;
    },

    // Session callback
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.emailVerified = token.emailVerified ?? null;
        session.user.twoFactorEnabled = token.twoFactorEnabled ?? false;
        session.user.department = token.department ?? null;
      }

      return session;
    },

    // Redirect callback
    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      // Allows relative callback URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`;

      // Allows callback URLs on the same origin
      try {
        if (new URL(url).origin === baseUrl) return url;
      } catch {
        // invalid URL — fallthrough to baseUrl
      }

      return baseUrl;
    },
  },

  // Events
  events: {
    async signIn({ user, account }: { user: User; account: Account | null }) {
      console.log(`User ${user.email} signed in via ${account?.provider ?? 'unknown'}`);
    },
    async signOut({ session }: {session: any}) {
      if (session?.user?.id) {
        // Create audit log for logout
        await prisma.auditLog.create({
          data: {
            userId: session.user.id,
            action: 'LOGOUT',
            tableName: 'users',
            recordId: session.user.id,
          },
        });
      }
    },
    async createUser({ user }: {user: User}) {
      console.log(`New user created: ${user.email}`);

      // Example: send welcome email (commented-out until implemented)
      if (user.email) {
        // await sendWelcomeEmail(user.email, user.name || 'User');
      }
    },
    async linkAccount({ user, account }: { user: User;  account: Account}) {
      console.log(`Account ${account.provider} linked for user ${user.email}`);
    },
  },

  // Security options
  useSecureCookies: process.env.NODE_ENV === 'production',

  // Debug mode
  debug: process.env.NODE_ENV === 'development',
};

/**
 * Create and export NextAuth instance
 *
 * Note: NextAuth returns an object depending on the version; this line matches your
 * original pattern. If your project expects a different export (e.g. default), adjust accordingly.
 */
export const { handlers, signIn, signOut, auth } = NextAuth(authConfig);

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
