/**
 * PUDO Provider Interface (Open/Closed Principle)
 *
 * Each provider implements this interface.
 * Adding SEUR, Amazon Locker, etc. requires only a new file — no
 * modification to PudoService.
 */

/** Union of supported PUDO provider identifiers. */
export type PudoProviderName = 'CORREOS_CITYPAQ' | 'INPOST' | 'SEUR';

export interface PudoLocation {
  id: string;
  provider: PudoProviderName;
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceKm: number;
  availableCapacity: number;
}

/**
 * Result of a locker reservation attempt.
 * `confirmed: false` means the PIN is synthetic / unverified — the caller
 * should NOT commit the PUDO assignment to the database.
 */
export interface ReservationResult {
  pin: string;
  confirmed: boolean;
}

/**
 * Result of a cancellation attempt.
 */
export interface CancellationResult {
  success: boolean;
  error?: string;
}

export interface IPudoProvider {
  /** Must match one of the PudoProviderName values. */
  readonly providerName: PudoProviderName;

  /**
   * The prefix used in locationId strings (e.g. 'inpost', 'citypaq').
   * Used by PudoService to route reserve/cancel calls to the correct provider.
   */
  readonly locationIdPrefix: string;

  /**
   * Fetches nearby PUDO locations.
   * Must NOT throw — return an empty array on failure.
   */
  fetch(lat: number, lng: number, radiusKm: number): Promise<PudoLocation[]>;

  /**
   * Reserves a locker for a shipment.
   * Returns a ReservationResult indicating whether the PIN is confirmed.
   */
  reserve(locationId: string, size: string): Promise<ReservationResult>;

  /**
   * Cancels a previously reserved locker slot.
   * Returns a CancellationResult indicating success/failure.
   */
  cancel(locationId: string, pin: string): Promise<CancellationResult>;
}
