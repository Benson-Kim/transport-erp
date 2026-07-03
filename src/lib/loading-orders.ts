/**
 * Loading-order domain logic (#32).
 *
 * Pure input normalization lives here (unit-testable without a DB), and
 * createLoadingOrderRecords is the ONE transactional write path shared by
 * every create flow (single service or grouped selection) - no forked
 * implementations.
 *
 * PDF generation deliberately does NOT live here yet: it ships with #34.
 * Until then a LoadingOrder row carries pdfPath = null and the UI states
 * that honestly. No Document row is ever written without a real backing
 * file - the phantom rows this vertical replaces (fileSize: 0, fabricated
 * filePath) are the exact bug #32 exists to kill.
 */

import type { PrismaClient } from '@/app/generated/prisma';
import { generateDocumentNumber } from '@/lib/prisma/numbering';

/** Document-number prefix: LO-YYYY-NNNNN (see src/lib/prisma/numbering.ts). */
export const LOADING_ORDER_PREFIX = 'LO';

/**
 * Dedupe service ids preserving first-seen order. Order matters: it defines
 * the loading positions the carrier sees on the printed order.
 */
export function normalizeServiceIds(serviceIds: readonly string[]): string[] {
  return [...new Set(serviceIds)];
}

/** 1-based, dense positions (1..n) in first-seen order. */
export function buildServicePositions(
  serviceIds: readonly string[]
): Array<{ serviceId: string; position: number }> {
  return normalizeServiceIds(serviceIds).map((serviceId, index) => ({
    serviceId,
    position: index + 1,
  }));
}

/**
 * A loading order links directly to a client only when every grouped
 * service belongs to the same client; a mixed group has no single client.
 */
export function deriveClientId(clientIds: readonly string[]): string | null {
  return new Set(clientIds).size === 1 ? (clientIds[0] ?? null) : null;
}

export interface CreateLoadingOrderRecordsInput {
  /** May contain duplicates; normalized to first-seen order. */
  serviceIds: readonly string[];
  clientId: string | null;
  notes: string | null;
  generatedById: string;
}

/**
 * Minimal structural client (method shorthand for parameter bivariance, the
 * db-helpers.ts AuditLogWriter pattern): satisfied by the $extends-ed app
 * singleton, an interactive transaction client, and the raw PrismaClient
 * the DB test harness uses.
 */
export type LoadingOrderTxClient = Pick<PrismaClient, '$queryRaw'> & {
  loadingOrder: {
    create(args: {
      data: {
        orderNumber: string;
        generatedById: string;
        clientId: string | null;
        notes: string | null;
      };
    }): Promise<{ id: string; orderNumber: string }>;
  };
  serviceLoadingOrder: {
    createMany(args: {
      data: Array<{ loadingOrderId: string; serviceId: string; position: number }>;
    }): Promise<unknown>;
  };
};

/**
 * Create the LoadingOrder row and its ServiceLoadingOrder join rows.
 *
 * MUST be called with the client of the surrounding transaction: the number
 * allocation (#12), the order row and the join rows then commit - or roll
 * back - together, so a failure can never leave a partially-visible group.
 * A burned number on rollback is acceptable by design (gap-tolerant
 * numbering; see src/lib/prisma/numbering.ts).
 */
export async function createLoadingOrderRecords(
  tx: LoadingOrderTxClient,
  input: CreateLoadingOrderRecordsInput
): Promise<{ id: string; orderNumber: string }> {
  const positions = buildServicePositions(input.serviceIds);

  const orderNumber = await generateDocumentNumber(tx, LOADING_ORDER_PREFIX);

  const created = await tx.loadingOrder.create({
    data: {
      orderNumber,
      generatedById: input.generatedById,
      clientId: input.clientId,
      notes: input.notes,
    },
  });

  await tx.serviceLoadingOrder.createMany({
    data: positions.map(({ serviceId, position }) => ({
      loadingOrderId: created.id,
      serviceId,
      position,
    })),
  });

  return { id: created.id, orderNumber: created.orderNumber };
}
