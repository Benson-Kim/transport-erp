/**
 * ZBE (Zona de Bajas Emisiones) Compliance
 *
 * Validates delivery route stops against Low Emission Zones stored as
 * GeoJSON polygons in the database (ZbeZone model).
 *
 * Replaces the previous hardcoded bounding box with real geospatial
 * checks using the ray-casting algorithm.
 */

import prisma from '@/lib/prisma/prisma';
import { VehicleEmissionLabel } from '@/app/generated/prisma';
import { pointInPolygon, type GeoJsonPolygon } from './geo-utils';

export interface RouteStop {
  lat: number;
  lng: number;
  address: string;
}

export interface ZbeViolation {
  stop: RouteStop;
  zone: { id: string; name: string; allowedLabels: string[] };
}

// Cached zone loader — zones rarely change, so cache for 15 minutes

let zoneCache: { data: Awaited<ReturnType<typeof fetchZones>>; expiresAt: number } | null = null;
const ZONE_CACHE_TTL_MS = 15 * 60 * 1000;

async function fetchZones() {
  return prisma.zbeZone.findMany({
    where: {
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gt: new Date() } },
      ],
    },
  });
}

/**
 * Returns all currently-active ZBE zones, cached in memory with a 15-minute TTL.
 * Call `invalidateZbeCache()` after zone CRUD operations.
 */
export async function getActiveZbeZones() {
  const now = Date.now();
  if (zoneCache && zoneCache.expiresAt > now) {
    return zoneCache.data;
  }
  const data = await fetchZones();
  zoneCache = { data, expiresAt: now + ZONE_CACHE_TTL_MS };
  return data;
}

/** Clears the zone cache — call after create/update/delete on ZbeZone. */
export function invalidateZbeCache() {
  zoneCache = null;
}

/**
 * Validates a set of route stops against all active ZBE zones.
 *
 * @param stops Delivery stops with GPS coordinates
 * @param vehicleLabel The emission label of the assigned vehicle
 * @returns true if all stops are compliant
 * @throws Error in "hard" enforcement mode when a violation is detected
 */
export async function enforceZbeCompliance(
  stops: RouteStop[],
  vehicleLabel: VehicleEmissionLabel,
): Promise<boolean> {
  const enforcementMode = process.env.ZBE_ENFORCEMENT ?? 'hard';

  const zones = await getActiveZbeZones();

  if (zones.length === 0) {
    // No zones configured yet — pass silently
    return true;
  }

  const violations: ZbeViolation[] = [];

  for (const stop of stops) {
    for (const zone of zones) {
      const geo = zone.geoJson as unknown as GeoJsonPolygon;

      // Validate the stored GeoJSON structure before using it
      if (!geo?.type || geo.type !== 'Polygon' || !geo.coordinates?.length) {
        console.warn(`[ZBE] Zone "${zone.name}" has invalid GeoJSON — skipping.`);
        continue;
      }

      const isInsideZone = pointInPolygon([stop.lng, stop.lat], geo);

      if (isInsideZone) {
        const isCompliant = zone.allowedLabels.includes(vehicleLabel);

        if (!isCompliant) {
          violations.push({
            stop,
            zone: {
              id: zone.id,
              name: zone.name,
              allowedLabels: zone.allowedLabels,
            },
          });
        }
      }
    }
  }

  if (violations.length === 0) {
    return true;
  }

  if (enforcementMode === 'hard') {
    const first = violations[0]!;
    throw new Error(
      `ZBE VIOLATION: Route includes stop at "${first.stop.address}" inside ${first.zone.name}. ` +
      `Vehicle emission label "${vehicleLabel}" is prohibited. ` +
      `Allowed labels: [${first.zone.allowedLabels.join(', ')}]. ` +
      `Total violations: ${violations.length}.`,
    );
  }

  // Soft mode: log warnings but allow
  for (const v of violations) {
    console.warn(
      `[ZBE WARNING] Stop "${v.stop.address}" is in ${v.zone.name}. ` +
      `Vehicle label "${vehicleLabel}" is restricted. Allowed: [${v.zone.allowedLabels.join(', ')}].`,
    );
  }

  return true;
}

/**
 * Checks a single coordinate against ZBE zones.
 * Useful for GPS-level validation on individual deliveries.
 */
export async function checkZbeZone(
  lat: number,
  lng: number,
): Promise<{ name: string; allowedLabels: string[] } | null> {
  const zones = await prisma.zbeZone.findMany({
    where: {
      OR: [
        { effectiveTo: null },
        { effectiveTo: { gt: new Date() } },
      ],
    },
  });

  for (const zone of zones) {
    const geo = zone.geoJson as unknown as GeoJsonPolygon;
    if (geo?.type !== 'Polygon') continue;

    if (pointInPolygon([lng, lat], geo)) {
      return { name: zone.name, allowedLabels: zone.allowedLabels };
    }
  }

  return null;
}
