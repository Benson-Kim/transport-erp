/**
 * NextAuth.js v5 Configuration
 * Complete authentication setup with credentials and OAuth providers
 */

import NextAuth from 'next-auth';
import type { NextAuthConfig, Session, User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import MicrosoftEntraId from 'next-auth/providers/microsoft-entra-id';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { compare } from 'bcryptjs';
import { loginSchema } from '@/lib/validations/auth-schema';
import { UserRole } from '@prisma/client';
import { rateLimiter } from '@/lib/rate-limiter';
import { sendVerificationEmail, sendPasswordResetEmail } from '@/lib/email';
import { generateVerificationToken, generatePasswordResetToken } from '@/lib/auth-helpers';

/**
 * Module augmentation for NextAuth types
 */
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      emailVerified: Date | null;
      twoFactorEnabled: boolean;
      department?: string | null;
      avatar?: string | null;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    emailVerified: Date | null;
    twoFactorEnabled: boolean;
    department?: string | null;
    avatar?: string | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
    emailVerified: Date | null;
    twoFactorEnabled: boolean;
    department?: string | null;
  }
}

/**
 * NextAuth configuration
 */
export const authConfig: NextAuthConfig = {
  // Adapter for database persistence
  adapter: PrismaAdapter(prisma),
  
  // Session configuration
  session: {
    strategy: 'jwt',
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
      async authorize(credentials) {
        try {
          // Validate input
          const validatedFields = loginSchema.parse(credentials);
          
          // Check rate limiting
          const rateLimitResult = await rateLimiter.check(
            validatedFields.email,
            5, // max attempts
            15 * 60 * 1000 // 15 minutes window
          );
          
          if (!rateLimitResult.success) {
            throw new Error(
              `Too many login attempts. Please try again in ${Math.ceil(
                rateLimitResult.retryAfter / 60000
              )} minutes.`
            );
          }
          
          // Find user by email
          const user = await prisma.user.findUnique({
            where: {
              email: validatedFields.email,
              deletedAt: null,
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
          const passwordValid = await compare(
            validatedFields.password,
            user.password
          );
          
          if (!passwordValid) {
            await rateLimiter.increment(validatedFields.email);
            throw new Error('Invalid email or password');
          }
          
          // Check email verification
          if (!user.emailVerified) {
            // Send verification email
            const token = await generateVerificationToken(user.email);
            await sendVerificationEmail(user.email, token);
            throw new Error(
              'Email not verified. We have sent you a new verification link.'
            );
          }
          
          // Reset rate limiter on successful login
          await rateLimiter.reset(validatedFields.email);
          
          // Update last login
          await prisma.user.update({
            where: { id: user.id },
            data: {
              lastLoginAt: new Date(),
              lastLoginIp: credentials.ip || null,
            },
          });
          
          // Create audit log
          await prisma.auditLog.create({
            data: {
              userId: user.id,
              action: 'LOGIN',
              tableName: 'users',
              recordId: user.id,
              ipAddress: credentials.ip || null,
              userAgent: credentials.userAgent || null,
              metadata: {
                provider: 'credentials',
                rememberMe: validatedFields.rememberMe,
              },
            },
          });
          
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
          console.error('Authentication error:', error);
          return null;
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
      profile(profile) {
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
    
    // Microsoft OAuth provider
    MicrosoftEntraId({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID,
      authorization: {
        params: {
          scope: 'openid profile email offline_access',
        },
      },
      profile(profile) {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email,
          emailVerified: profile.email ? new Date() : null,
          avatar: null,
          role: UserRole.VIEWER, // Default role for OAuth users
          twoFactorEnabled: false,
          department: profile.department || null,
        };
      },
    }),
  ],
  
  // Callbacks
  callbacks: {
    // Sign in callback
    async signIn({ user, account, profile }) {
      // Allow OAuth sign in without email verification
      if (account?.provider !== 'credentials') {
        // Check if OAuth account exists and is active
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email! },
        });
        
        if (existingUser && !existingUser.isActive) {
          return false; // Reject sign in for disabled accounts
        }
        
        // Create audit log for OAuth login
        if (existingUser) {
          await prisma.auditLog.create({
            data: {
              userId: existingUser.id,
              action: 'LOGIN',
              tableName: 'users',
              recordId: existingUser.id,
              metadata: {
                provider: account.provider,
              },
            },
          });
        }
        
        return true;
      }
      
      // For credentials provider, check email verification
      const existingUser = await prisma.user.findUnique({
        where: { email: user.email! },
      });
      
      if (!existingUser?.emailVerified) {
        return false;
      }
      
      return true;
    },
    
    // JWT callback
    async jwt({ token, user, trigger, session }) {
      if (user) {
        // Initial sign in
        token.id = user.id;
        token.role = user.role;
        token.emailVerified = user.emailVerified;
        token.twoFactorEnabled = user.twoFactorEnabled;
        token.department = user.department;
      }
      
      if (trigger === 'update' && session) {
        // Update token from session
        token = { ...token, ...session };
      }
      
      return token;
    },
    
    // Session callback
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.emailVerified = token.emailVerified;
        session.user.twoFactorEnabled = token.twoFactorEnabled;
        session.user.department = token.department;
      }
      
      return session;
    },
    
    // Redirect callback
    async redirect({ url, baseUrl }) {
      // Allows relative callback URLs
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      
      // Allows callback URLs on the same origin
      if (new URL(url).origin === baseUrl) return url;
      
      return baseUrl;
    },
  },
  
  // Events
  events: {
    async signIn({ user, account }) {
      console.log(`User ${user.email} signed in via ${account?.provider}`);
    },
    async signOut({ session }) {
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
    async createUser({ user }) {
      console.log(`New user created: ${user.email}`);
      
      // Send welcome email
      if (user.email) {
        // await sendWelcomeEmail(user.email, user.name || 'User');
      }
    },
    async linkAccount({ user, account }) {
      console.log(`Account ${account.provider} linked for user ${user.email}`);
    },
  },
  
  // Security options
  trustHost: true,
  useSecureCookies: process.env.NODE_ENV === 'production',
  
  // Debug mode
  debug: process.env.NODE_ENV === 'development',
};

/**
 * Create and export NextAuth instance
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