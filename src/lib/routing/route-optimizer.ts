/**
 * Route Optimization Service
 *
 * Produces an optimised stop sequence for a set of shipments,
 * then validates ZBE compliance for the assigned driver's vehicle.
 *
 * Uses OSRM (Open Source Routing Machine) for the trip optimization.
 * Falls back to a simple nearest-neighbour heuristic when OSRM is unavailable.
 */

import prisma from '@/lib/prisma/prisma';
import { generateUniqueIdentifier } from '@/lib/prisma/db-helpers';
import { enforceZbeCompliance, type RouteStop } from './zbe';

export interface OptimisedRoute {
  route: {
    id: string;
    routeNumber: string;
  };
  stops: RouteStop[];
  totalDistanceKm: number;
  estimatedDurationMin: number;
}

// OSRM Optimization Provider

async function osrmOptimize(stops: RouteStop[]): Promise<{
  orderedStops: RouteStop[];
  totalDistanceKm: number;
  estimatedDurationMin: number;
}> {
  const baseUrl = process.env.OSRM_BASE_URL ?? 'http://router.project-osrm.org';

  // Build the coordinate string: lng,lat;lng,lat;...
  const coords = stops.map((s) => `${s.lng},${s.lat}`).join(';');
  const url = `${baseUrl}/trip/v1/driving/${coords}?roundtrip=false&source=first&geometries=geojson&overview=simplified`;

  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`OSRM returned HTTP ${response.status}`);
  }

  const json = await response.json();

  if (json.code !== 'Ok' || !json.trips?.[0]) {
    throw new Error(`OSRM trip solver failed: ${json.code}`);
  }

  const trip = json.trips[0];
  const waypoints = json.waypoints ?? [];

  // Re-order stops according to OSRM's waypoint_index
  const orderedStops = waypoints
    .sort((a: any, b: any) => a.waypoint_index - b.waypoint_index)
    .map((wp: any) => {
      const originalIdx = wp.trips_index !== undefined ? wp.waypoint_index : 0;
      return stops[originalIdx] ?? stops[0]!;
    });

  return {
    orderedStops,
    totalDistanceKm: (trip.distance ?? 0) / 1000,
    estimatedDurationMin: (trip.duration ?? 0) / 60,
  };
}

// Nearest-neighbour fallback 

function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearestNeighbourSort(stops: RouteStop[]): {
  orderedStops: RouteStop[];
  totalDistanceKm: number;
} {
  if (stops.length <= 1) {
    return { orderedStops: [...stops], totalDistanceKm: 0 };
  }

  const remaining = [...stops];
  const ordered: RouteStop[] = [remaining.shift()!];
  let totalDist = 0;

  while (remaining.length > 0) {
    const last = ordered[ordered.length - 1]!;
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(last.lat, last.lng, remaining[i]!.lat, remaining[i]!.lng);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    totalDist += bestDist;
    ordered.push(remaining.splice(bestIdx, 1)[0]!);
  }

  return { orderedStops: ordered, totalDistanceKm: totalDist };
}

// Public API

export class RouteOptimizer {
  /**
   * Produces a stop sequence minimising total distance,
   * then enforces ZBE compliance against the assigned driver's vehicle.
   */
  static async optimise(
    driverId: string,
    shipmentIds: string[],
  ): Promise<OptimisedRoute> {
    if (shipmentIds.length === 0) {
      throw new Error('Cannot optimise an empty route.');
    }

    const [driver, shipments] = await Promise.all([
      prisma.driver.findUniqueOrThrow({
        where: { id: driverId },
        include: { user: true },
      }),
      prisma.shipment.findMany({
        where: { id: { in: shipmentIds } },
      }),
    ]);

    if (shipments.length === 0) {
      throw new Error('No shipments found for the provided IDs.');
    }

    // 1. Build stops
    const stops: RouteStop[] = shipments.map((s) => ({
      lat: s.deliveryLat,
      lng: s.deliveryLng,
      address: `${s.streetName} ${s.streetNumber}, ${s.codigoPostal} ${s.ciudad}`,
    }));

    // 2. Optimise — try OSRM, fall back to nearest-neighbour
    let orderedStops: RouteStop[];
    let totalDistanceKm: number;
    let estimatedDurationMin: number;

    try {
      const osrmResult = await osrmOptimize(stops);
      orderedStops = osrmResult.orderedStops;
      totalDistanceKm = osrmResult.totalDistanceKm;
      estimatedDurationMin = osrmResult.estimatedDurationMin;
    } catch (err: any) {
      console.warn(
        `[RouteOptimizer] OSRM unavailable (${err?.message}), using nearest-neighbour fallback.`,
      );
      const nnResult = nearestNeighbourSort(stops);
      orderedStops = nnResult.orderedStops;
      totalDistanceKm = nnResult.totalDistanceKm;
      // Rough estimate: 30 km/h average urban speed
      estimatedDurationMin = (totalDistanceKm / 30) * 60;
    }

    // 3. Hard ZBE compliance check
    await enforceZbeCompliance(orderedStops, driver.emissionLabel);

    // 4. Persist route
    const routeNumber = await generateUniqueIdentifier('RT', 'route', 'routeNumber');

    const route = await prisma.route.create({
      data: {
        routeNumber,
        driverId,
        date: new Date(),
        status: 'PLANNED',
        optimisedPath: orderedStops as any,
        zbeCompliant: true,
        shipments: { connect: shipmentIds.map((id) => ({ id })) },
      },
    });

    return {
      route: { id: route.id, routeNumber: route.routeNumber },
      stops: orderedStops,
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      estimatedDurationMin: Math.round(estimatedDurationMin),
    };
  }
}
