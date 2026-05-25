/**
 * Delivery Geofencing Logic
 * Used to enforce anti-fraud controls (e.g. preventing ghost deliveries).
 *
 * Phase 4.3: The geofence threshold is now configurable via SystemSetting
 * (key: "delivery.geofenceRadiusMeters") so admins can tune it for urban
 * areas with poor GPS accuracy without requiring a code deploy.
 */

import prisma from '@/lib/prisma/prisma';
import { haversineMeters } from '@/lib/routing/geo-utils';

/** Default radius used when the SystemSetting is not yet seeded. */
const DEFAULT_GEOFENCE_RADIUS_METERS = 25;

/**
 * Alias for backwards compatibility — delegates to the canonical
 * haversineMeters implementation in geo-utils.ts.
 */
export const getDistanceInMeters = haversineMeters;

/**
 * Reads the geofence radius from SystemSetting at runtime.
 * Falls back to DEFAULT_GEOFENCE_RADIUS_METERS if not configured.
 *
 * Tip: Seed with key "delivery.geofenceRadiusMeters", value 25.
 */
export async function getGeofenceThreshold(): Promise<number> {
  try {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'delivery.geofenceRadiusMeters' },
    });
    const value = setting?.value;
    if (typeof value === 'number' && value > 0) return value;
  } catch {
    // If DB is unreachable during a GPS check, fall back to default
    console.warn('[Geofence] Could not read SystemSetting, using default radius.');
  }
  return DEFAULT_GEOFENCE_RADIUS_METERS;
}

/**
 * Validates if the driver's GPS coordinates are within the acceptable
 * proximity of the delivery address.
 *
 * @param driverLat   Driver's current latitude
 * @param driverLng   Driver's current longitude
 * @param deliveryLat Delivery address latitude
 * @param deliveryLng Delivery address longitude
 * @param thresholdMeters Acceptable radius in meters (default: 25m)
 */
export function validateDeliveryProximity(
  driverLat: number,
  driverLng: number,
  deliveryLat: number,
  deliveryLng: number,
  thresholdMeters: number = DEFAULT_GEOFENCE_RADIUS_METERS
): boolean {
  const distance = getDistanceInMeters(driverLat, driverLng, deliveryLat, deliveryLng);
  return distance <= thresholdMeters;
}
