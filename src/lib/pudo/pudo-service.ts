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
  type ReservationResult,
  type CancellationResult,
} from './providers';

// Registry of active providers — add new providers here
const PROVIDERS: IPudoProvider[] = [
  new CorreosCityPaqProvider(),
  new InPostProvider(),
];

export { type PudoLocation, type ReservationResult, type CancellationResult };

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
   * Delegates to the appropriate provider based on the locationIdPrefix.
   */
  static async reserveLocker(
    locationId: string,
    shipmentSize: 'S' | 'M' | 'L',
  ): Promise<ReservationResult> {
    const provider = PROVIDERS.find((p) =>
      locationId.startsWith(`${p.locationIdPrefix}-`),
    );

    if (provider) {
      return provider.reserve(locationId, shipmentSize);
    }

    // No matching provider — cannot confirm reservation
    console.warn(
      `[PudoService] No provider matched locationId "${locationId}" — reservation unconfirmed.`,
    );
    return { pin: '', confirmed: false };
  }

  /**
   * Cancels a previously reserved locker slot.
   */
  static async cancelReservation(locationId: string, pin: string): Promise<CancellationResult> {
    const provider = PROVIDERS.find((p) =>
      locationId.startsWith(`${p.locationIdPrefix}-`),
    );

    if (provider) {
      return provider.cancel(locationId, pin);
    }

    console.warn(
      `[PudoService] No provider matched locationId "${locationId}" — cannot cancel reservation.`,
    );
    return { success: false, error: 'Unknown provider' };
  }
}
