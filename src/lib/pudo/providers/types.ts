/**
 * PUDO Provider Interface (Open/Closed Principle)
 *
 * Each provider implements this interface.
 * Adding SEUR, Amazon Locker, etc. requires only a new file — no
 * modification to PudoService.
 */

export interface PudoLocation {
  id: string;
  provider: 'CORREOS_CITYPAQ' | 'INPOST' | 'SEUR';
  name: string;
  address: string;
  lat: number;
  lng: number;
  distanceKm: number;
  availableCapacity: number;
}

export interface IPudoProvider {
  readonly providerName: string;
  /**
   * Fetches nearby PUDO locations.
   * Must NOT throw — return an empty array on failure.
   */
  fetch(lat: number, lng: number, radiusKm: number): Promise<PudoLocation[]>;

  /**
   * Reserves a locker for a shipment.
   */
  reserve(locationId: string, size: string): Promise<string>;

  /**
   * Cancels a previously reserved locker slot.
   */
  cancel(locationId: string, pin: string): Promise<void>;
}
