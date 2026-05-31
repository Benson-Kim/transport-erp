/**
 * Shipment Transition Module
 *
 * Deep module that owns the atomic transition of a shipment from one
 * status to another.  A single `transition()` call:
 *
 *  1. Creates an immutable DeliveryEvent
 *  2. Updates the Shipment row
 *  3. Enqueues a notification via the outbox (when a recipient exists)
 *  4. Writes an audit log entry
 *
 * Callers (delivery-actions) handle only business-specific validation
 * (geofence, photo checks, PUDO) then delegate the rest here.
 */

import type { $Enums, Prisma } from '@/app/generated/prisma';
import { AuditAction, DeliveryStatus } from '@/app/generated/prisma';
import prisma from '../prisma/prisma';

// Public types

export type TransactionClient = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0];

export interface TransitionContext {
  userId: string;
  driverId?: string | undefined;
  gps?: { lat: number; lng: number; accuracyM?: number | undefined } | undefined;
  photoUrl?: string | undefined;
  signatureUrl?: string | undefined;
  recipientDni?: string | undefined;
  notes?: string | undefined;
  failedReason?: $Enums.FailedDeliveryReason | null | undefined;
  shipmentData?: Prisma.ShipmentUpdateInput | undefined;
  auditMeta?: Record<string, unknown> | undefined;
}

/** Template name → notification template mapping per target status */
const STATUS_TEMPLATE_MAP: Partial<Record<DeliveryStatus, string>> = {
  [DeliveryStatus.OUT_FOR_DELIVERY]: 'OUT_FOR_DELIVERY',
  [DeliveryStatus.DELIVERED]: 'DELIVERED',
  [DeliveryStatus.FAILED]: 'FAILED',
  [DeliveryStatus.AT_PUDO]: 'PUDO_AVAILABLE',
};

// Core transition function

/**
 * Atomically transitions a shipment to `targetStatus` inside the
 * provided Prisma transaction.
 *
 * @param tx       Active Prisma transaction client
 * @param shipment The current shipment record (must include recipientEmail, recipientPhone, trackingToken, recipientName)
 * @param targetStatus The status to transition to
 * @param ctx      Contextual data for the transition
 */
export async function transition(
  tx: TransactionClient,
  shipment: {
    id: string;
    status: string;
    recipientEmail: string | null;
    recipientPhone: string | null;
    trackingToken: string | null;
    recipientName: string;
    failedAttempts: number;
  },
  targetStatus: DeliveryStatus,
  ctx: TransitionContext,
): Promise<void> {
  await tx.deliveryEvent.create({
    data: {
      shipmentId: shipment.id,
      status: targetStatus,
      ...(ctx.driverId && { driverId: ctx.driverId }),
      ...(ctx.gps && { lat: ctx.gps.lat, lng: ctx.gps.lng, gpsAccuracyM: ctx.gps.accuracyM ?? null }),
      ...(ctx.photoUrl && { photoUrl: ctx.photoUrl }),
      ...(ctx.failedReason && { failedReason: ctx.failedReason }),
      ...(ctx.notes && { notes: ctx.notes }),
    },
  });

  await tx.shipment.update({
    where: { id: shipment.id },
    data: {
      status: targetStatus,
      ...(targetStatus === DeliveryStatus.DELIVERED && { deliveredAt: new Date() }),
      ...(ctx.photoUrl && targetStatus === DeliveryStatus.DELIVERED && { proofPhotoUrl: ctx.photoUrl }),
      ...(ctx.signatureUrl && { signatureUrl: ctx.signatureUrl }),
      ...(ctx.recipientDni && { recipientDniCollected: ctx.recipientDni }),
      ...ctx.shipmentData,
    },
  });

  // Outbox notification
  const template = STATUS_TEMPLATE_MAP[targetStatus];
  const recipient = shipment.recipientEmail ?? shipment.recipientPhone;

  if (template && recipient) {
    await tx.emailQueue.create({
      data: {
        template,
        to: recipient,
        data: {
          shipmentId: shipment.id,
          trackingToken: shipment.trackingToken,
          recipientName: shipment.recipientName,
          ...(ctx.photoUrl && { photoUrl: ctx.photoUrl }),
          ...(ctx.auditMeta ?? {}),
        },
        priority: 'high',
        status: 'pending',
      },
    });
  }

  // Audit log
  const auditAction =
    targetStatus === DeliveryStatus.DELIVERED ? AuditAction.COMPLETE : AuditAction.UPDATE;

  await tx.auditLog.create({
    data: {
      userId: ctx.userId,
      action: auditAction,
      tableName: 'shipments',
      recordId: shipment.id,
      oldValues: { status: shipment.status },
      newValues: { status: targetStatus },
      metadata: {
        ...(ctx.driverId && { driverId: ctx.driverId }),
        ...(ctx.gps && { gpsAccuracyM: ctx.gps.accuracyM }),
        ...(ctx.photoUrl && { photoUrl: ctx.photoUrl }),
        ...(ctx.failedReason && { reason: ctx.failedReason }),
        ...ctx.auditMeta,
      },
    },
  });
}
