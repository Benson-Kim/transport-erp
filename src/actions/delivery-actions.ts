'use server';

import prisma from '@/lib/prisma/prisma';
import { requireAuth } from '@/lib/auth';
import { getGeofenceThreshold, validateDeliveryProximity } from '@/lib/delivery/geofence';
import { assertValidTransition } from '@/lib/delivery/delivery-state-machine';
import { transition } from '@/lib/delivery/shipment-transition';
import type { ReservationResult } from '@/lib/pudo/providers/types';
import { PudoService } from '@/lib/pudo/pudo-service';
import { DeliveryStatus, FailedDeliveryReason } from '@/app/generated/prisma';
import { generateUniqueIdentifier } from '@/lib/prisma/db-helpers';
import type { Shipment, Driver } from '@/app/generated/prisma';


interface DriverActionContext {
  session: { user: { id: string } };
  driver: Driver;
  shipment: Shipment;
}

/**
 * Higher-order function for driver delivery actions.
 *
 * Handles the repeated boilerplate:
 *  1. `requireAuth()`
 *  2. `getAuthorizedDriver(session.user.id)`
 *  3. `getShipmentOrThrow(data.shipmentId)`
 *  4. `assertValidTransition(shipment.status, targetStatus)`
 *
 * The handler receives the resolved context and implements only the
 * action-specific logic.
 */
async function withDriverAction<TData extends { shipmentId: string }, TResult>(
  data: TData,
  targetStatus: DeliveryStatus,
  handler: (ctx: DriverActionContext, data: TData) => Promise<TResult>,
): Promise<TResult> {
  const session = await requireAuth();
  const driver = await getAuthorizedDriver(session.user.id);
  const shipment = await getShipmentOrThrow(data.shipmentId);

  assertValidTransition(shipment.status, targetStatus);

  return handler({ session, driver, shipment }, data);
}


async function getAuthorizedDriver(userId: string) {
  const driver = await prisma.driver.findUnique({ where: { userId } });
  if (!driver) throw new Error('Not authorized as a driver');
  return driver;
}

async function getShipmentOrThrow(id: string) {
  const shipment = await prisma.shipment.findUnique({ where: { id } });
  if (!shipment) throw new Error(`Shipment not found: ${id}`);
  return shipment;
}


/** DISPATCHER: Assign a shipment to a route. PENDING → ASSIGNED */
export async function assignShipmentToRoute(data: {
  shipmentId: string;
  routeId: string;
}) {
  const session = await requireAuth();
  const shipment = await getShipmentOrThrow(data.shipmentId);

  assertValidTransition(shipment.status, DeliveryStatus.ASSIGNED);

  await prisma.$transaction(async (tx) => {
    await transition(tx, shipment, DeliveryStatus.ASSIGNED, {
      userId: session.user.id,
      notes: `Assigned to route ${data.routeId}`,
      shipmentData: { route: { connect: { id: data.routeId } } },
    });
  });

  return { success: true };
}

// Simple driver transitions 

/** DRIVER: Confirm collection at depot. ASSIGNED → PICKED_UP */
export async function markPickedUp(data: { shipmentId: string }) {
  return withDriverAction(data, DeliveryStatus.PICKED_UP, async ({ session, driver, shipment }) => {
    await prisma.$transaction(async (tx) => {
      await transition(tx, shipment, DeliveryStatus.PICKED_UP, {
        userId: session.user.id,
        driverId: driver.id,
      });
    });
    return { success: true };
  });
}

/** DRIVER: Mark shipment in transit. PICKED_UP → IN_TRANSIT */
export async function markInTransit(data: { shipmentId: string }) {
  return withDriverAction(data, DeliveryStatus.IN_TRANSIT, async ({ session, driver, shipment }) => {
    await prisma.$transaction(async (tx) => {
      await transition(tx, shipment, DeliveryStatus.IN_TRANSIT, {
        userId: session.user.id,
        driverId: driver.id,
      });
    });
    return { success: true };
  });
}

// Complex driver transitions

/** DRIVER: Start delivery attempt. IN_TRANSIT → OUT_FOR_DELIVERY */
export async function markOutForDelivery(data: {
  shipmentId: string;
  driverLat: number;
  driverLng: number;
}) {
  return withDriverAction(data, DeliveryStatus.OUT_FOR_DELIVERY, async ({ session, driver, shipment }) => {
    await prisma.$transaction(async (tx) => {
      await transition(tx, shipment, DeliveryStatus.OUT_FOR_DELIVERY, {
        userId: session.user.id,
        driverId: driver.id,
        gps: { lat: data.driverLat, lng: data.driverLng },
      });
    });

    return { success: true };
  });
}

/** DRIVER: Confirm delivery. OUT_FOR_DELIVERY → DELIVERED */
export async function markDelivered(data: {
  shipmentId: string;
  driverLat: number;
  driverLng: number;
  gpsAccuracyM?: number;
  photoUrl: string;
  signatureUrl?: string;
  recipientDniCollected?: string;
  notes?: string;
}) {
  return withDriverAction(data, DeliveryStatus.DELIVERED, async ({ session, driver, shipment }) => {
    // Photo validation (required)
    if (!data.photoUrl || data.photoUrl.trim() === '') {
      throw new Error('Proof of delivery photo is required.');
    }

    // Idempotency guard — prevent duplicate delivery events
    const existingDelivery = await prisma.deliveryEvent.findFirst({
      where: { shipmentId: data.shipmentId, status: DeliveryStatus.DELIVERED },
    });
    if (existingDelivery) {
      return { success: true, idempotent: true };
    }

    // Geofence validation using configurable threshold
    const thresholdMeters = await getGeofenceThreshold();
    const isWithinGeofence = validateDeliveryProximity(
      data.driverLat,
      data.driverLng,
      shipment.deliveryLat,
      shipment.deliveryLng,
      thresholdMeters
    );

    if (!isWithinGeofence) {
      throw new Error(
        `Driver is not within the acceptable delivery radius (${thresholdMeters}m). ` +
        `Please confirm you are at the delivery address.`
      );
    }

    await prisma.$transaction(async (tx) => {
      await transition(tx, shipment, DeliveryStatus.DELIVERED, {
        userId: session.user.id,
        driverId: driver.id,
        gps: { lat: data.driverLat, lng: data.driverLng, accuracyM: data.gpsAccuracyM },
        photoUrl: data.photoUrl,
        signatureUrl: data.signatureUrl,
        recipientDni: data.recipientDniCollected,
        notes: data.notes,
      });
    });

    return { success: true };
  });
}

/** DRIVER: Mark delivery as failed. OUT_FOR_DELIVERY → FAILED / AT_PUDO */
export async function markFailed(data: {
  shipmentId: string;
  reason: FailedDeliveryReason;
  driverLat: number;
  driverLng: number;
  gpsAccuracyM?: number;
  photoUrl?: string;
  notes?: string;
}) {
  return withDriverAction(data, DeliveryStatus.FAILED, async ({ session, driver, shipment }) => {
    // AUSENTE requires a photo of the buzzer/door
    if (
      data.reason === FailedDeliveryReason.AUSENTE &&
      (!data.photoUrl || data.photoUrl.trim() === '')
    ) {
      throw new Error('A photo of the buzzer/door is required for AUSENTE status.');
    }

    // Idempotency guard — prevent duplicate failed events from network retries
    const existingFailed = await prisma.deliveryEvent.findFirst({
      where: {
        shipmentId: data.shipmentId,
        driverId: driver.id,
        status: DeliveryStatus.FAILED,
        occurredAt: { gte: new Date(Date.now() - 30_000) },
      },
    });
    if (existingFailed) {
      return { success: true, idempotent: true, nextStatus: shipment.status };
    }

    const newAttemptsCount = shipment.failedAttempts + 1;
    let nextStatus: DeliveryStatus = DeliveryStatus.FAILED;
    let pudoLocationId: string | undefined;
    let pudoNotificationData: Record<string, unknown> | null = null;

    // Assign PUDO after 2 failed attempts
    if (newAttemptsCount >= 2) {
      const pudoLocations = await PudoService.findNearest(
        shipment.deliveryLat,
        shipment.deliveryLng,
        5
      );

      if (pudoLocations.length === 0) {
        console.error(
          `[PUDO] No available PUDO locations found near shipment ${data.shipmentId}. Manual intervention required.`
        );
      } else {
        const best = pudoLocations[0]!;
        const reservation: ReservationResult = await PudoService.reserveLocker(best.id, 'M');

        if (reservation.confirmed) {
          assertValidTransition(DeliveryStatus.FAILED, DeliveryStatus.AT_PUDO);
          nextStatus = DeliveryStatus.AT_PUDO;
          pudoLocationId = best.id;
          pudoNotificationData = {
            pudoName: best.name,
            pudoAddress: best.address,
            pudoProvider: best.provider,
            pin: reservation.pin,
            distanceKm: best.distanceKm,
          };
        } else {
          console.warn(
            `[PUDO] Reservation unconfirmed for shipment ${data.shipmentId} at ${best.id}. ` +
            `Keeping status as FAILED for manual intervention.`
          );
        }
      }
    }

    // Wrap transaction with compensation for orphaned PUDO reservations
    try {
      await prisma.$transaction(async (tx) => {
        await transition(tx, shipment, nextStatus, {
          userId: session.user.id,
          driverId: driver.id,
          gps: {
            lat: data.driverLat,
            lng: data.driverLng,
            accuracyM: data.gpsAccuracyM
          },
          photoUrl: data.photoUrl,
          notes: data.notes,
          failedReason: data.reason,
          shipmentData: {
            failedAttempts: newAttemptsCount,
            ...(pudoLocationId && { pudoLocationId }),
          },
          auditMeta: {
            ...(pudoNotificationData ?? {}),
            pudoAssigned: nextStatus === DeliveryStatus.AT_PUDO,
            pudoLocationId,
            oldFailedAttempts: shipment.failedAttempts,
          },
        });
      });
    } catch (txError) {
      if (pudoLocationId && pudoNotificationData?.['pin']) {
        await PudoService.cancelReservation(pudoLocationId, pudoNotificationData['pin'] as string);
      }
      throw txError;
    }

    return { success: true, nextStatus };
  });
}

// Route number generator

export async function generateRouteNumber(): Promise<string> {
  return generateUniqueIdentifier('RT', 'route', 'routeNumber');
}
