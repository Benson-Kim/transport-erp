import { DefaultSession } from "next-auth";
import { AdapterUser } from "@auth/core/adapters";
import { UserRole } from "@prisma/client";

// Extend next-auth session & user
declare module "next-auth" {
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
    } & DefaultSession["user"];
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

// Extend next-auth JWT
declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    emailVerified: Date | null;
    twoFactorEnabled: boolean;
    department?: string | null;
    avatar?: string | null;
  }
}

// Extend the adapter user type (Prisma adapter compatibility)
declare module "@auth/core/adapters" {
  interface AdapterUser {
    role?: UserRole;
    twoFactorEnabled?: boolean;
    department?: string | null;
    avatar?: string | null;
  }
}
