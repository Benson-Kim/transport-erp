/**
 * Pick-Up and Drop-Off (PUDO) Service
 *
 * Aggregates results from multiple locker network providers
 * (Correos CityPaq, InPost, future: SEUR, Amazon Locker).
 *
 * Architecture:
 *  - Uses Promise.allSettled so one provider failure doesn't block others.
 *  - Adding a new provider requires only a new class in providers/ (OCP).
 *  - Results are merged and sorted by distance.
 */

import {
  CorreosCityPaqProvider,
  InPostProvider,
  type IPudoProvider,
  type PudoLocation,
} from './providers';

// Registry of active providers — add new providers here
const PROVIDERS: IPudoProvider[] = [
  new CorreosCityPaqProvider(),
  new InPostProvider(),
];

export { type PudoLocation };

export class PudoService {
  /**
   * Finds the nearest available lockers to a given coordinate.
   * Queries all configured providers concurrently and merges results by distance.
   */
  static async findNearest(
    lat: number,
    lng: number,
    radiusKm: number = 5,
  ): Promise<PudoLocation[]> {
    const results = await Promise.allSettled(
      PROVIDERS.map((p) => p.fetch(lat, lng, radiusKm)),
    );

    // Collect successful results only — partial failure is acceptable
    const locations: PudoLocation[] = results
      .filter(
        (r): r is PromiseFulfilledResult<PudoLocation[]> =>
          r.status === 'fulfilled',
      )
      .flatMap((r) => r.value)
      .filter((loc) => loc.availableCapacity > 0) // only locations with space
      .sort((a, b) => a.distanceKm - b.distanceKm);

    // Log any rejected providers for ops visibility
    results.forEach((r, idx) => {
      if (r.status === 'rejected') {
        console.error(
          `[PudoService] ${PROVIDERS[idx]?.providerName ?? 'unknown'} provider rejected:`,
          r.reason,
        );
      }
    });

    return locations;
  }

  /**
   * Reserves a locker for a shipment that is being rerouted.
   * In production, this calls the provider's reservation API.
   */
  static async reserveLocker(
    locationId: string,
    shipmentSize: 'S' | 'M' | 'L',
  ): Promise<string> {
    // Determine which provider owns this location by the prefix
    const providerPrefix = locationId.split('-')[0];

    if (providerPrefix === 'citypaq') {
      return this.reserveCorreos(locationId, shipmentSize);
    }
    if (providerPrefix === 'inpost') {
      return this.reserveInPost(locationId, shipmentSize);
    }

    // Fallback: generate a local PIN for manual handling
    console.warn(
      `[PudoService] Unknown provider prefix "${providerPrefix}" — generating local PIN.`,
    );
    return `PIN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  private static async reserveCorreos(
    locationId: string,
    shipmentSize: string,
  ): Promise<string> {
    const apiKey = process.env.CORREOS_CITYPAQ_API_KEY;
    const baseUrl = process.env.CORREOS_API_BASE ?? 'https://api.correos.es';

    if (!apiKey) {
      console.warn('[PudoService] Correos API key missing — generating local PIN.');
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
          lockerSize: shipmentSize,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      return json?.pin ?? json?.reservationCode ?? `PIN-${codeId}`;
    } catch (err: any) {
      console.error('[PudoService] Correos reservation failed:', err?.message);
      return `PIN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    }
  }

  private static async reserveInPost(
    locationId: string,
    shipmentSize: string,
  ): Promise<string> {
    const apiKey = process.env.INPOST_API_KEY;
    const baseUrl = process.env.INPOST_API_BASE ?? 'https://api.inpost.es/v1';

    if (!apiKey) {
      console.warn('[PudoService] InPost API key missing — generating local PIN.');
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
          size: shipmentSize,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json();
      return json?.open_code ?? json?.pin ?? `PIN-${pointName}`;
    } catch (err: any) {
      console.error('[PudoService] InPost reservation failed:', err?.message);
      return `PIN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    }
  }
}
