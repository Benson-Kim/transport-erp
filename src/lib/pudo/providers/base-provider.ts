/**
 * Base PUDO Provider (Template Method Pattern)
 *
 * Extracts shared boilerplate from InPost/CorreosCityPaq:
 *  - Environment variable guard
 *  - Fetch with timeout + error handling
 *  - Reserve with honest ReservationResult
 *  - Cancel with CancellationResult
 *
 * Subclasses override only the API-specific details:
 *  - buildFetchUrl / parseFetchResponse
 *  - buildReserveRequest / parseReserveResponse
 *  - buildCancelUrl
 *  - getAuthHeaders
 */

import type {
  IPudoProvider,
  PudoLocation,
  PudoProviderName,
  ReservationResult,
  CancellationResult,
} from './types';

export abstract class BasePudoProvider implements IPudoProvider {
  abstract readonly providerName: PudoProviderName;
  abstract readonly locationIdPrefix: string;

  protected abstract readonly apiKeyEnvVar: string;
  protected abstract readonly defaultBaseUrl: string;
  protected abstract readonly baseUrlEnvVar: string;

  //  Helpers
  protected getApiKey(): string | undefined {
    return process.env[this.apiKeyEnvVar];
  }

  protected getBaseUrl(): string {
    return process.env[this.baseUrlEnvVar] ?? this.defaultBaseUrl;
  }

  protected abstract getAuthHeaders(apiKey: string): Record<string, string>;

  // Template Methods (subclasses override)

  protected abstract buildFetchUrl(
    baseUrl: string,
    lat: number,
    lng: number,
    radiusKm: number,
  ): string;

  protected abstract parseFetchResponse(
    json: unknown,
    fallbackLat: number,
    fallbackLng: number,
  ): PudoLocation[];

  protected abstract buildReserveBody(
    locationId: string,
    size: string,
  ): { url: string; body: Record<string, unknown> };

  protected abstract parseReserveResponse(json: unknown, locationId: string): string;

  protected abstract buildCancelUrl(baseUrl: string, pin: string): string;

  // Public API

  async fetch(lat: number, lng: number, radiusKm: number): Promise<PudoLocation[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      console.warn(`[${this.providerName}] API key not configured — skipping provider.`);
      return [];
    }

    try {
      const url = this.buildFetchUrl(this.getBaseUrl(), lat, lng, radiusKm);

      const response = await fetch(url, {
        headers: {
          ...this.getAuthHeaders(apiKey),
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        console.error(`[${this.providerName}] API error: HTTP ${response.status}`);
        return [];
      }

      const json = await response.json();
      return this.parseFetchResponse(json, lat, lng);
    } catch (err: unknown) {
      console.error(
        `[${this.providerName}] Provider fetch failed:`,
        err instanceof Error ? err.message : String(err),
      );
      return [];
    }
  }

  async reserve(locationId: string, size: string): Promise<ReservationResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      console.warn(`[${this.providerName}] API key missing — cannot confirm reservation.`);
      return { pin: '', confirmed: false };
    }

    try {
      const { url, body } = this.buildReserveBody(locationId, size);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.getAuthHeaders(apiKey),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        console.error(`[${this.providerName}] Reservation failed: HTTP ${response.status}`);
        return { pin: '', confirmed: false };
      }

      const json = await response.json();
      const pin = this.parseReserveResponse(json, locationId);
      return { pin, confirmed: true };
    } catch (err: unknown) {
      console.error(
        `[${this.providerName}] Reservation failed:`,
        err instanceof Error ? err.message : String(err),
      );
      return { pin: '', confirmed: false };
    }
  }

  async cancel(locationId: string, pin: string): Promise<CancellationResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { success: false, error: `${this.providerName} API key not configured` };
    }

    try {
      const url = this.buildCancelUrl(this.getBaseUrl(), pin);

      const response = await fetch(url, {
        method: 'DELETE',
        headers: this.getAuthHeaders(apiKey),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const error = `HTTP ${response.status}`;
        console.error(`[${this.providerName}] Cancel failed for ${pin} at ${locationId}: ${error}`);
        return { success: false, error };
      }

      return { success: true };
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(
        `[${this.providerName}] Failed to cancel reservation ${pin} at ${locationId}:`,
        error,
      );
      return { success: false, error };
    }
  }
}
