import { describe, it, expect } from 'vitest';
import { haversineKm, pointInPolygon, type GeoJsonPolygon } from './routing/geo-utils';

describe('Geo Utilities', () => {
  describe('haversineKm', () => {
    it('should correctly calculate distance between Madrid and Barcelona', () => {
      // Madrid: 40.4168, -3.7038
      // Barcelona: 41.3851, 2.1734
      // Distance is approx 504 km
      const distance = haversineKm(40.4168, -3.7038, 41.3851, 2.1734);
      expect(distance).toBeGreaterThan(500);
      expect(distance).toBeLessThan(510);
    });

    it('should correctly calculate distance between same points as 0', () => {
      const distance = haversineKm(40.4168, -3.7038, 40.4168, -3.7038);
      expect(distance).toBe(0);
    });
  });

  describe('pointInPolygon', () => {
    const polygon: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [0, 10],
          [10, 10],
          [10, 0],
          [0, 0],
        ]
      ]
    };

    it('should return true for point inside polygon', () => {
      expect(pointInPolygon([5, 5], polygon)).toBe(true);
    });

    it('should return false for point outside polygon', () => {
      expect(pointInPolygon([15, 15], polygon)).toBe(false);
      expect(pointInPolygon([-5, 5], polygon)).toBe(false);
    });
  });
});
