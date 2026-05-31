/**
 * InPost Provider
 *
 * Integrates with the InPost ES API to find nearby locker locations.
 *
 * Requires env vars:
 * - INPOST_API_KEY
 * - INPOST_API_BASE (defaults to https://api.inpost.es/v1)
 */

import type { PudoLocation, PudoProviderName } from './types';
import { BasePudoProvider } from './base-provider';

export class InPostProvider extends BasePudoProvider {
  readonly providerName: PudoProviderName = 'INPOST';
  readonly locationIdPrefix = 'inpost';

  protected readonly apiKeyEnvVar = 'INPOST_API_KEY';
  protected readonly defaultBaseUrl = 'https://api.inpost.es/v1';
  protected readonly baseUrlEnvVar = 'INPOST_API_BASE';

  protected getAuthHeaders(apiKey: string): Record<string, string> {
    return { Authorization: `Bearer ${apiKey}` };
  }

  protected buildFetchUrl(baseUrl: string, lat: number, lng: number, radiusKm: number): string {
    const url = new URL(`${baseUrl}/points`);
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('max_distance', String(radiusKm * 1000)); // InPost uses metres
    url.searchParams.set('status', 'Operating');
    url.searchParams.set('type', 'parcel_locker');
    return url.toString();
  }

  protected parseFetchResponse(json: unknown, fallbackLat: number, fallbackLng: number): PudoLocation[] {
    const data = json as Record<string, unknown>;
    const items = Array.isArray(data?.items) ? data.items : [];

    return items.map((p: Record<string, any>) => ({
      id: `inpost-${p.name ?? p.id}`,
      provider: 'INPOST' as const,
      name: p.address_details?.description ?? p.name ?? 'InPost Locker',
      address: [p.address?.line1, p.address?.line2, p.address?.city]
        .filter(Boolean)
        .join(', '),
      lat: Number(p.location?.latitude ?? fallbackLat),
      lng: Number(p.location?.longitude ?? fallbackLng),
      distanceKm: Number(p.distance ?? 0) / 1000, // convert from metres
      availableCapacity: Number(p.available_lockers ?? 0),
    }));
  }

  protected buildReserveBody(locationId: string, size: string) {
    const pointName = locationId.replace('inpost-', '');
    return {
      url: `${this.getBaseUrl()}/reservations`,
      body: { locker_name: pointName, size },
    };
  }

  protected parseReserveResponse(json: unknown, locationId: string): string {
    const data = json as Record<string, any>;
    return data?.open_code ?? data?.pin ?? `PIN-${locationId.replace('inpost-', '')}`;
  }

  protected buildCancelUrl(baseUrl: string, pin: string): string {
    return `${baseUrl}/reservations/${encodeURIComponent(pin)}`;
  }
}
