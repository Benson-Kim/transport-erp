/**
 * Correos CityPaq Provider
 *
 * Integrates with the Correos CityPaq API to find nearby locker locations.
 *
 * Requires env vars:
 * - CORREOS_CITYPAQ_API_KEY
 * - CORREOS_API_BASE (defaults to https://api.correos.es)
 */

import type { IPudoProvider, PudoLocation } from './types';

export class CorreosCityPaqProvider implements IPudoProvider {
  readonly providerName = 'CORREOS_CITYPAQ';

  async fetch(lat: number, lng: number, radiusKm: number): Promise<PudoLocation[]> {
    const apiKey = process.env.CORREOS_CITYPAQ_API_KEY;
    const baseUrl = process.env.CORREOS_API_BASE ?? 'https://api.correos.es';

    if (!apiKey) {
      console.warn('[CorreosCityPaq] API key not configured — skipping provider.');
      return [];
    }

    try {
      const url = new URL(`${baseUrl}/citypaq/v1/points`);
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lng', String(lng));
      url.searchParams.set('radius', String(radiusKm));
      url.searchParams.set('status', 'active');

      const response = await fetch(url.toString(), {
        headers: {
          'X-API-Key': apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (!response.ok) {
        console.error(`[CorreosCityPaq] API error: HTTP ${response.status}`);
        return [];
      }

      const json = await response.json();
      const points = Array.isArray(json?.data) ? json.data : [];

      return points.map((p: any) => ({
        id: `citypaq-${p.id ?? p.code}`,
        provider: 'CORREOS_CITYPAQ' as const,
        name: p.name ?? p.description ?? 'CityPaq',
        address: p.address ?? `${p.street}, ${p.city}`,
        lat: Number(p.latitude ?? p.lat),
        lng: Number(p.longitude ?? p.lng),
        distanceKm: Number(p.distance ?? 0),
        availableCapacity: Number(p.availableSlots ?? p.capacity ?? 0),
      }));
    } catch (err: any) {
      console.error('[CorreosCityPaq] Provider fetch failed:', err?.message);
      return [];
    }
  }
}
