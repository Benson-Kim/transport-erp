/**
 * Address Normalization Utility
 *
 * Pure function — strips accents, lowercases, and trims whitespace
 * to produce a consistent key for address-based lookups.
 */

/**
 * Normalizes a Spanish street address for consistent storage and lookup.
 *
 * Steps:
 * 1. Lowercase
 * 2. Remove accents / diacritics (NFD + combining mark strip)
 * 3. Collapse whitespace
 * 4. Trim
 */
export function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
    .replace(/\s+/g, ' ')
    .trim();
}
