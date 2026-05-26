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
   * Delegates to the appropriate provider based on the locationId prefix.
   */
  static async reserveLocker(
    locationId: string,
    shipmentSize: 'S' | 'M' | 'L',
  ): Promise<string> {
    const providerPrefix = locationId.split('-')[0]?.toLowerCase();

    const provider = PROVIDERS.find((p) => 
      p.providerName.toLowerCase().replace('_', '') === providerPrefix ||
      p.providerName.toLowerCase() === providerPrefix
    );

    if (provider) {
      return provider.reserve(locationId, shipmentSize);
    }

    // Fallback: generate a local PIN for manual handling
    console.warn(
      `[PudoService] Unknown provider prefix "${providerPrefix}" — generating local PIN.`,
    );
    return `PIN-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  /**
   * Cancels a previously reserved locker slot.
   */
  static async cancelReservation(locationId: string, pin: string): Promise<void> {
    const providerPrefix = locationId.split('-')[0]?.toLowerCase();

    const provider = PROVIDERS.find((p) => 
      p.providerName.toLowerCase().replace('_', '') === providerPrefix ||
      p.providerName.toLowerCase() === providerPrefix
    );

    if (provider) {
      return provider.cancel(locationId, pin);
    }

    console.warn(
      `[PudoService] Unknown provider prefix "${providerPrefix}" — cannot cancel reservation.`,
    );
  }
}
