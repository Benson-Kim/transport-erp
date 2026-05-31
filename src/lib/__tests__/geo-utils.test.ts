import { describe, it, expect } from 'vitest';
import {
  pointInPolygon,
  haversineMeters,
  haversineKm,
} from '../routing/geo-utils';
import type { GeoJsonPolygon } from '../routing/geo-utils';

// A simple square polygon around central Madrid (Puerta del Sol area)
const MADRID_SQUARE: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [[
    [-3.705, 40.415],
    [-3.700, 40.415],
    [-3.700, 40.420],
    [-3.705, 40.420],
    [-3.705, 40.415], // closed ring
  ]],
};

describe('pointInPolygon', () => {
  it('returns true for a point inside the polygon', () => {
    // Center of the Madrid square
    expect(pointInPolygon([-3.7025, 40.4175], MADRID_SQUARE)).toBe(true);
  });

  it('returns false for a point outside the polygon', () => {
    // Barcelona — clearly outside
    expect(pointInPolygon([2.1734, 41.3851], MADRID_SQUARE)).toBe(false);
  });

  it('returns false for a point slightly outside', () => {
    // Just north of the square
    expect(pointInPolygon([-3.7025, 40.421], MADRID_SQUARE)).toBe(false);
  });

  it('returns false for a degenerate polygon (< 3 points)', () => {
    const degenerate: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [[[-3.7, 40.4], [-3.7, 40.5]]],
    };
    expect(pointInPolygon([-3.7, 40.45], degenerate)).toBe(false);
  });

  it('returns false for empty coordinates', () => {
    const empty: GeoJsonPolygon = { type: 'Polygon', coordinates: [[]] };
    expect(pointInPolygon([0, 0], empty)).toBe(false);
  });
});

describe('haversineMeters', () => {
  it('returns 0 for same point', () => {
    expect(haversineMeters(40.4168, -3.7038, 40.4168, -3.7038)).toBe(0);
  });

  it('calculates Madrid ↔ Barcelona ≈ 505 km', () => {
    const distance = haversineMeters(40.4168, -3.7038, 41.3851, 2.1734);
    // Should be approximately 505 km (±5 km tolerance)
    expect(distance).toBeGreaterThan(500_000);
    expect(distance).toBeLessThan(510_000);
  });

  it('calculates short distance accurately', () => {
    // ~1 degree of latitude ≈ 111 km
    const distance = haversineMeters(40.0, 0, 41.0, 0);
    expect(distance).toBeGreaterThan(110_000);
    expect(distance).toBeLessThan(112_000);
  });

  it('is symmetric', () => {
    const ab = haversineMeters(40.4168, -3.7038, 41.3851, 2.1734);
    const ba = haversineMeters(41.3851, 2.1734, 40.4168, -3.7038);
    expect(ab).toBeCloseTo(ba, 5);
  });
});

describe('haversineKm', () => {
  it('returns meters / 1000', () => {
    const meters = haversineMeters(40.4168, -3.7038, 41.3851, 2.1734);
    const km = haversineKm(40.4168, -3.7038, 41.3851, 2.1734);
    expect(km).toBeCloseTo(meters / 1000, 5);
  });
});
