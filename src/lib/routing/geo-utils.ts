/**
 * Point-in-Polygon (Ray Casting Algorithm)
 *
 * Pure utility function — no dependencies, fully testable in isolation.
 * Supports GeoJSON Polygon geometry (first ring only, no holes for ZBE zones).
 */

export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // [ring[point[lng, lat]]]
}

/**
 * Checks if a point [lng, lat] is inside a GeoJSON Polygon using
 * the ray-casting algorithm.
 *
 * @param point [lng, lat] tuple
 * @param polygon GeoJSON Polygon geometry
 * @returns true if point is inside the polygon
 */
export function pointInPolygon(
  point: [number, number],
  polygon: GeoJsonPolygon,
): boolean {
  const [x, y] = point; // lng, lat
  const ring = polygon.coordinates[0]; // outer ring

  if (!ring || ring.length < 3) return false;

  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

// ---------------------------------------------------------------------------
// Haversine Distance (canonical implementation — single source of truth)
// ---------------------------------------------------------------------------

const EARTH_RADIUS_M = 6_371_000; // Earth's mean radius in meters

/**
 * Calculates the great-circle distance between two coordinates in **meters**
 * using the Haversine formula.
 *
 * This is the single canonical implementation. Both `geofence.ts` and
 * `route-optimizer.ts` should import from here instead of maintaining
 * their own copies.
 */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Convenience wrapper returning distance in **kilometers**.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  return haversineMeters(lat1, lng1, lat2, lng2) / 1000;
}
