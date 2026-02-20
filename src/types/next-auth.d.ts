import type { UserRole } from '@/app/generated/prisma';

import type { DefaultJWT } from '@auth/core/jwt';
import type { DefaultSession, DefaultUser } from 'next-auth';

// Extend next-auth session & user
declare module 'next-auth' {
  interface Session extends DefaultSession {
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
    // & DefaultSession['user'];
  }

  interface User extends DefaultUser {
    // id: string;
    // email: string;
    // name: string;
    role: UserRole;
    emailVerified: Date | null;
    twoFactorEnabled: boolean;
    department?: string | null;
    avatar?: string | null;
    isActive: boolean;
  }
}

// Extend next-auth JWT
declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id?: string;
    role?: UserRole;
    emailVerified?: Date | null;
    twoFactorEnabled?: boolean;
    department?: string | null;
    avatar?: string | null;
  }
}

// Extend the adapter user type (Prisma adapter compatibility)
declare module '@auth/core/adapters' {
  interface AdapterUser {
    role?: UserRole;
    twoFactorEnabled?: boolean;
    department?: string | null;
    avatar?: string | null;
  }
}
