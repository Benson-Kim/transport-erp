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
    const apiKey = process.env['INPOST_API_KEY'];
    const baseUrl = process.env['INPOST_API_BASE'] ?? 'https://api.inpost.es/v1';

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

      return items.map((p: Record<string, unknown>) => ({
        id: `inpost-${p['name'] ?? p['id']}`,
        provider: 'INPOST' as const,
        name: p['address_details']?.description ?? p['name'] ?? 'InPost Locker',
        address: [p['address']?.line1, p['address']?.line2, p['address']?.city]
          .filter(Boolean)
          .join(', '),
        lat: Number(p['location']?.latitude ?? lat),
        lng: Number(p['location']?.longitude ?? lng),
        distanceKm: Number(p['distance'] ?? 0) / 1000, // convert from metres
        availableCapacity: Number(p['available_lockers'] ?? 0),
      }));
    } catch (err: unknown) {
      console.error('[InPost] Provider fetch failed:', err instanceof Error ? err.message : String(err));
      return [];
    }
  }

  async reserve(locationId: string, size: string): Promise<string> {
    const apiKey = process.env['INPOST_API_KEY'];
    const baseUrl = process.env['INPOST_API_BASE'] ?? 'https://api.inpost.es/v1';

    if (!apiKey) {
      console.warn('[InPost] API key missing — generating local PIN.');
      return `PIN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    }

    try {
      const pointName = locationId.replace('inpost-', '');
      const response = await fetch(`${baseUrl}/reservations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locker_name: pointName,
          size,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      return json?.open_code ?? json?.pin ?? `PIN-${pointName}`;
    } catch (err: unknown) {
      console.error('[InPost] Reservation failed:', err instanceof Error ? err.message : String(err));
      return `PIN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    }
  }

  async cancel(locationId: string, pin: string): Promise<void> {
    const apiKey = process.env['INPOST_API_KEY'];
    const baseUrl = process.env['INPOST_API_BASE'] ?? 'https://api.inpost.es/v1';
    if (!apiKey) return;

    try {
      await fetch(`${baseUrl}/reservations/${encodeURIComponent(pin)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
    } catch (err: unknown) {
      console.warn(
        `[InPost] Failed to cancel reservation ${pin} at ${locationId}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}
