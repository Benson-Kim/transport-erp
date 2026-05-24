/**
 * InPost Provider
 *
 * Integrates with the InPost ES API to find nearby locker locations.
 *
 * Requires env vars:
 * - INPOST_API_KEY
 * - INPOST_API_BASE (defaults to https://api.inpost.es/v1)
 */

import type { IPudoProvider, PudoLocation } from './types';

export class InPostProvider implements IPudoProvider {
  readonly providerName = 'INPOST';

  async fetch(lat: number, lng: number, radiusKm: number): Promise<PudoLocation[]> {
    const apiKey = process.env.INPOST_API_KEY;
    const baseUrl = process.env.INPOST_API_BASE ?? 'https://api.inpost.es/v1';

    if (!apiKey) {
      console.warn('[InPost] API key not configured — skipping provider.');
      return [];
    }

    try {
      const url = new URL(`${baseUrl}/points`);
      url.searchParams.set('latitude', String(lat));
      url.searchParams.set('longitude', String(lng));
      url.searchParams.set('max_distance', String(radiusKm * 1000)); // InPost uses metres
      url.searchParams.set('status', 'Operating');
      url.searchParams.set('type', 'parcel_locker');

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.error(`[InPost] API error: HTTP ${response.status}`);
        return [];
      }

      const json = await response.json();
      const items = Array.isArray(json?.items) ? json.items : [];

      return items.map((p: any) => ({
        id: `inpost-${p.name ?? p.id}`,
        provider: 'INPOST' as const,
        name: p.address_details?.description ?? p.name ?? 'InPost Locker',
        address: [p.address?.line1, p.address?.line2, p.address?.city]
          .filter(Boolean)
          .join(', '),
        lat: Number(p.location?.latitude ?? lat),
        lng: Number(p.location?.longitude ?? lng),
        distanceKm: Number(p.distance ?? 0) / 1000, // convert from metres
        availableCapacity: Number(p.available_lockers ?? 0),
      }));
    } catch (err: any) {
      console.error('[InPost] Provider fetch failed:', err?.message);
      return [];
    }
  }
}
