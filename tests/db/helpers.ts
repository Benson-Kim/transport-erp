/**
 * Shared harness for the database integration suite.
 *
 * These tests assert DB-level guarantees (CHECK constraints, enum values,
 * race-free numbering) against a REAL Postgres, so they instantiate a raw
 * PrismaClient bound to DATABASE_URL. They are run via `npm run test:db`.
 */

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@/app/generated/prisma';

export const prisma = new PrismaClient();

/** Unique suffix so parallel/re-run tests never collide on unique fields. */
export function uid(): string {
  return randomUUID().slice(0, 8);
}

export async function createUserFixture() {
  const suffix = uid();
  return prisma.user.create({
    data: {
      email: `test-${suffix}@example.test`,
      name: `Test User ${suffix}`,
    },
  });
}

export async function createClientFixture() {
  const suffix = uid();
  return prisma.client.create({
    data: {
      clientCode: `CLI-TEST-${suffix}`,
      name: `Test Client ${suffix}`,
      billingAddress: {
        line1: '1 Test St',
        city: 'Madrid',
        postalCode: '28001',
        country: 'ES',
      },
      billingEmail: `billing-${suffix}@example.test`,
    },
  });
}

export async function createSupplierFixture() {
  const suffix = uid();
  return prisma.supplier.create({
    data: {
      supplierCode: `SUP-TEST-${suffix}`,
      name: `Test Supplier ${suffix}`,
      addressLine1: '1 Supplier St',
      city: 'Madrid',
      postalCode: '28001',
      country: 'ES',
      email: `supplier-${suffix}@example.test`,
    },
  });
}

/**
 * Base data for a valid Service row given fixtures. Callers override individual
 * money fields to probe CHECK constraints.
 */
export function baseServiceData(params: {
  serviceNumber: string;
  clientId: string;
  supplierId: string;
  createdById: string;
}) {
  return {
    serviceNumber: params.serviceNumber,
    date: new Date(),
    clientId: params.clientId,
    supplierId: params.supplierId,
    createdById: params.createdById,
    description: 'Integration test service',
    origin: 'Madrid',
    destination: 'Barcelona',
    costAmount: '100.00',
    saleAmount: '150.00',
    margin: '50.00',
    marginPercentage: '33.33',
    costVatAmount: '21.00',
    saleVatAmount: '31.50',
  };
}
