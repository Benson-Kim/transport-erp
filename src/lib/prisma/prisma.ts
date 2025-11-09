/**
 * Prisma Client Singleton
 * Ensures a single database connection throughout the application lifecycle
 */

import { PrismaClient } from "@/app/generated/prisma";
import { withAccelerate } from '@prisma/extension-accelerate'

const globalForPrisma = global as unknown as {
  prisma: PrismaClient
}

/**
 * Prisma client configuration
 */
const prismaClientSingleton = () => {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
    errorFormat: process.env.NODE_ENV === 'development' ? 'pretty' : 'minimal',
  }).$extends(withAccelerate());
};

/**
 * Global prisma instance
 * Prevents multiple instances during development hot-reload
 */
const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

/**
 * Prisma transaction options
 */
export const transactionOptions = {
  maxWait: 5000, // 5 seconds
  timeout: 10000, // 10 seconds
  isolationLevel: 'Serializable' as const,
};

/**
 * Common error handler for Prisma operations
 */
export function handlePrismaError(error: any): never {
  if (error.code === 'P2002') {
    throw new Error(`Unique constraint violation: ${error.meta?.target}`);
  }
  if (error.code === 'P2003') {
    throw new Error(`Foreign key constraint violation: ${error.meta?.field_name}`);
  }
  if (error.code === 'P2025') {
    throw new Error('Record not found');
  }
  throw error;
}