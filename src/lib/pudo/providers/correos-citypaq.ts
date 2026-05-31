/**
 * Correos CityPaq Provider
 *
 * Integrates with the Correos CityPaq API to find nearby locker locations.
 *
 * Requires env vars:
 * - CORREOS_CITYPAQ_API_KEY
 * - CORREOS_API_BASE (defaults to https://api.correos.es)
 */

import type { PudoLocation, PudoProviderName } from './types';
import { BasePudoProvider } from './base-provider';

export class CorreosCityPaqProvider extends BasePudoProvider {
  readonly providerName: PudoProviderName = 'CORREOS_CITYPAQ';
  readonly locationIdPrefix = 'citypaq';

  protected readonly apiKeyEnvVar = 'CORREOS_CITYPAQ_API_KEY';
  protected readonly defaultBaseUrl = 'https://api.correos.es';
  protected readonly baseUrlEnvVar = 'CORREOS_API_BASE';

  protected getAuthHeaders(apiKey: string): Record<string, string> {
    return { 'X-API-Key': apiKey };
  }

  protected buildFetchUrl(baseUrl: string, lat: number, lng: number, radiusKm: number): string {
    const url = new URL(`${baseUrl}/citypaq/v1/points`);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lng', String(lng));
    url.searchParams.set('radius', String(radiusKm));
    url.searchParams.set('status', 'active');
    return url.toString();
  }

  protected parseFetchResponse(json: unknown, _fallbackLat: number, _fallbackLng: number): PudoLocation[] {
    const data = json as Record<string, unknown>;
    const points = Array.isArray(data?.data) ? data.data : [];

    return points.map((p: Record<string, any>) => ({
      id: `citypaq-${p.id ?? p.code}`,
      provider: 'CORREOS_CITYPAQ' as const,
      name: p.name ?? p.description ?? 'CityPaq',
      address: p.address ?? `${p.street}, ${p.city}`,
      lat: Number(p.latitude ?? p.lat),
      lng: Number(p.longitude ?? p.lng),
      distanceKm: Number(p.distance ?? 0),
      availableCapacity: Number(p.availableSlots ?? p.capacity ?? 0),
    }));
  }

  protected buildReserveBody(locationId: string, size: string) {
    const codeId = locationId.replace('citypaq-', '');
    return {
      url: `${this.getBaseUrl()}/citypaq/v1/reservations`,
      body: { pointId: codeId, lockerSize: size },
    };
  }

  protected parseReserveResponse(json: unknown, locationId: string): string {
    const data = json as Record<string, any>;
    return data?.pin ?? data?.reservationCode ?? `PIN-${locationId.replace('citypaq-', '')}`;
  }

  protected buildCancelUrl(baseUrl: string, pin: string): string {
    return `${baseUrl}/citypaq/v1/reservations/${encodeURIComponent(pin)}`;
  }
}
