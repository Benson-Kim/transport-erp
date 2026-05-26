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
    const apiKey = process.env['CORREOS_CITYPAQ_API_KEY'];
    const baseUrl = process.env['CORREOS_API_BASE'] ?? 'https://api.correos.es';

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

      return points.map((p: Record<string, unknown>) => ({
        id: `citypaq-${p['id'] ?? p['code']}`,
        provider: 'CORREOS_CITYPAQ' as const,
        name: p['name'] ?? p['description'] ?? 'CityPaq',
        address: p['address'] ?? `${p['street']}, ${p['city']}`,
        lat: Number(p['latitude'] ?? p['lat']),
        lng: Number(p['longitude'] ?? p['lng']),
        distanceKm: Number(p['distance'] ?? 0),
        availableCapacity: Number(p['availableSlots'] ?? p['capacity'] ?? 0),
      }));
    } catch (err: unknown) {
      console.error('[CorreosCityPaq] Provider fetch failed:', err instanceof Error ? err.message : String(err));
      return [];
    }
  }

  async reserve(locationId: string, size: string): Promise<string> {
    const apiKey = process.env['CORREOS_CITYPAQ_API_KEY'];
    const baseUrl = process.env['CORREOS_API_BASE'] ?? 'https://api.correos.es';

    if (!apiKey) {
      console.warn('[CorreosCityPaq] API key missing — generating local PIN.');
      return `PIN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    }

    try {
      const codeId = locationId.replace('citypaq-', '');
      const response = await fetch(`${baseUrl}/citypaq/v1/reservations`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pointId: codeId,
          lockerSize: size,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      return json?.pin ?? json?.reservationCode ?? `PIN-${codeId}`;
    } catch (err: unknown) {
      console.error('[CorreosCityPaq] Reservation failed:', err instanceof Error ? err.message : String(err));
      return `PIN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    }
  }

  async cancel(locationId: string, pin: string): Promise<void> {
    const apiKey = process.env['CORREOS_CITYPAQ_API_KEY'];
    const baseUrl = process.env['CORREOS_API_BASE'] ?? 'https://api.correos.es';
    if (!apiKey) return;

    try {
      await fetch(`${baseUrl}/citypaq/v1/reservations/${encodeURIComponent(pin)}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': apiKey },
        signal: AbortSignal.timeout(5000),
      });
    } catch (err: unknown) {
      console.warn(
        `[CorreosCityPaq] Failed to cancel reservation ${pin} at ${locationId}:`,
        err instanceof Error ? err.message : String(err)
      );
    }
  }
}
