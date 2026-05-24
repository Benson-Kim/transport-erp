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
