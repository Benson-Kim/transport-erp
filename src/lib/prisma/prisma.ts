/**
 * Prisma Client Singleton
 * Ensures a single database connection throughout the application lifecycle
 */

import { PrismaClient } from '@/app/generated/prisma';
import { withAccelerate } from '@prisma/extension-accelerate';

const globalForPrisma = global as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

/**
 * Create Prisma client with extensions
 */
function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    errorFormat: process.env.NODE_ENV === 'development' ? 'pretty' : 'minimal',
  }).$extends(withAccelerate());
}


/**
 * Get Prisma client instance
 * Returns null during build phase to prevent connection errors
 */
function getPrismaClient() {
  // Skip during Next.js build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return null as unknown as ReturnType<typeof createPrismaClient>;
  }

  return globalForPrisma.prisma ?? createPrismaClient();
}

const prisma = getPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

/**
 * Prisma transaction options
 */
export const transactionOptions = {
  maxWait: 5000,
  timeout: 10000,
  isolationLevel: 'Serializable' as const,
};

/**
 * Common error handler for Prisma operations
 */
export function handlePrismaError(error: unknown): never {
  const prismaError = error as { code?: string; meta?: { target?: string; field_name?: string } };

  if (prismaError.code === 'P2002') {
    throw new Error(`Unique constraint violation: ${prismaError.meta?.target}`);
  }
  if (prismaError.code === 'P2003') {
    throw new Error(`Foreign key constraint violation: ${prismaError.meta?.field_name}`);
  }
  if (prismaError.code === 'P2025') {
    throw new Error('Record not found');
  }
  throw error;
}