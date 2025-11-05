// File: app/api/auth/[...nextauth]/route.ts

import { compare } from 'bcryptjs';

import prisma from '@/lib/prisma/prisma'; // Adjusted path
import { PrismaAdapter } from '@auth/prisma-adapter';

import NextAuth, { NextAuthOptions, User, Account } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

import { sendVerificationEmail } from '@/lib/email'; // Adjusted path
import { rateLimiter } from '@/lib/rate-limiter';
import { generateVerificationToken } from '@/lib/auth-helpers'; // Adjusted path
import { loginSchema } from '@/lib/validations/auth-schema';

/**
 * NextAuth configuration
 *
 * This is the central configuration for all authentication logic.
 * It is used by the NextAuth handler in this file.
 */
export const authOptions: NextAuthOptions = {
  // Adapter for database persistence
  adapter: PrismaAdapter(prisma),

  // Session configuration
  session: {
    strategy: 'jwt' as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
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
      // The 'credentials' object is used to build the default login form.
      // We have a custom form, so this is more for metadata.
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        rememberMe: { label: 'Remember Me', type: 'checkbox' },
        // NOTE: ip and userAgent are not passed via the default form.
        // You would need to add them to the `signIn` call on the client-side.
      },
      // The authorize function is where all your custom login logic lives
      async authorize(credentials) {
        // NOTE: v4 passes credentials as a Record, not a typed object.
        // We use our Zod schema to validate and type them.
        try {
          if (!credentials) {
            throw new Error('Missing credentials.');
          }

          const validatedFields = loginSchema.parse(credentials);

          // Check rate limiting
          const rateLimitResult = await rateLimiter.check(
            validatedFields.email,
            5,
            15 * 60 * 1000
          );

          if (!rateLimitResult.success) {
            // Throwing an error here with a specific message will show it on the login page
            throw new Error(
              `Too many login attempts. Please try again in ${Math.ceil(
                rateLimitResult.retryAfter / 60000
              )} minutes.`
            );
          }

          // Find user by email
          const user = await prisma.user.findUnique({
            where: { email: validatedFields.email },
          });

          if (!user || !user.password) {
            await rateLimiter.increment(validatedFields.email);
            throw new Error('Invalid credentials');
          }

          if (!user.isActive) {
            throw new Error('This account has been disabled.');
          }

          // Verify password
          const passwordValid = await compare(validatedFields.password, user.password);

          if (!passwordValid) {
            await rateLimiter.increment(validatedFields.email);
            throw new Error('Invalid credentials');
          }

          // Check email verification (if using credentials)
          if (!user.emailVerified) {
            const token = await generateVerificationToken(user.email);
            await sendVerificationEmail(user.email, token);
            // This error message will be shown to the user on the login page.
            throw new Error('Email not verified. A new verification link has been sent.');
          }

          // Reset rate limiter on successful login
          await rateLimiter.reset(validatedFields.email);

          // Update last login
          await prisma.user.update({
            where: { id: user.id },
            data: {
              lastLoginAt: new Date(),
              lastLoginIp: credentials.ip ?? null,
            },
          });

          // Create audit log
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              action: 'LOGIN',
              tableName: 'users',
              recordId: user.id,
              ipAddress: credentials.ip ?? null,
              userAgent: credentials.userAgent ?? null,
              metadata: {
                provider: 'credentials',
                rememberMe: Boolean(validatedFields.rememberMe),
              },
            },
          });

          // The object returned here is what is passed to the `jwt` callback
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
          // Returning null triggers the authentication failure flow.
          // The error message from a thrown error is passed to the client.
          // You can log the full error for debugging.
          console.error('Authorize Error:', error);
          if (error instanceof Error) {
            // Re-throw the error to show a message on the client
            throw error;
          }
          // Fallback for non-Error throws
          throw new Error('An unexpected error occurred during authentication.');
        }
      },
    }),

    // Google OAuth provider
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          prompt: 'consent',
          access_type: 'offline',
          response_type: 'code',
        },
      },
      // The profile callback standardizes the provider's user data
      // before it's saved to your database.
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          image: profile.picture, // Use 'image' for PrismaAdapter compatibility
          // Custom fields below must exist on your Prisma User model
          emailVerified: profile.email_verified ? new Date() : null,
          role: 'VIEWER', // Default role for new OAuth users
          twoFactorEnabled: false,
        };
      },
    }),
  ],

  // Callbacks are functions that are executed at specific points in the auth flow.
  callbacks: {
    // signIn is called before a user is signed in.
    async signIn({ user, account }) {
      // Allow OAuth sign-in without any extra checks, unless the account is disabled
      if (account?.provider !== 'credentials') {
        if (!user.email) return false; // OAuth requires an email

        const existingUser = await prisma.user.findUnique({
          where: { email: user.email },
        });

        // Block sign in if the user is marked as inactive
        if (existingUser && !existingUser.isActive) {
          return '/auth-error?error=AccountDisabled'; // Redirect to error page
        }

        // Create audit log for OAuth login
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
        return true; // Allow sign in
      }

      // For credentials, the `authorize` function has already done all the checks.
      // We can just return true here.
      return true;
    },

    // The JWT callback is called when a JWT is created or updated.
    // The `user` object is only available on the first call after sign-in.
    async jwt({ token, user }) {
      // On initial sign in, populate the token with custom data
      if (user) {
        token.id = user.id;
        token.role = (user as any).role; // Cast to access custom property
        token.department = (user as any).department;
        token.twoFactorEnabled = (user as any).twoFactorEnabled;
      }
      return token;
    },

    // The session callback is called when a session is checked.
    // It receives the JWT token and lets you expose data to the client.
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as any; // Add role to session
        session.user.department = token.department as any;
        session.user.twoFactorEnabled = token.twoFactorEnabled as boolean;
      }
      return session;
    },
  },

  // Events are async functions that do not return a value.
  // Useful for logging, analytics, or side effects.
  events: {
    async signOut({ token }) {
      // NOTE: In v4, the `signOut` event receives the JWT `token`, not the session.
      // The user ID is in `token.sub`.
      if (token?.sub) {
        await prisma.auditLog.create({
          data: {
            userId: token.sub,
            action: 'LOGOUT',
            tableName: 'users',
            recordId: token.sub,
          },
        });
      }
    },
    // Other events remain the same...
    async linkAccount({ user }) {
      // Example: Update user's `lastLoginAt` on first OAuth link
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
    }
  },

  // Security options
  useSecureCookies: process.env.NODE_ENV === 'production',

  // Debug mode
  debug: process.env.NODE_ENV === 'development',
};

// The NextAuth.js handler function for this route
const handler = NextAuth(authOptions);

// Export the handler for both GET and POST requests
export { handler as GET, handler as POST };
