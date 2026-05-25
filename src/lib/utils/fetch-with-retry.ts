/**
 * Fetch With Retry Utility
 *
 * Wraps the native fetch() with configurable retry logic for
 * transient failures (5xx, network errors)
 */

export interface RetryOptions {
  maxRetries?: number;
  backoffMs?: number;
  backoffMultiplier?: number;
  retryableStatuses?: number[];
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 502, 503, 504],
};

/**
 * Fetches a URL with automatic retry on transient failures.
 *
 * @param url - The URL to fetch
 * @param init - Standard RequestInit options
 * @param retryOpts - Retry configuration
 * @returns The fetch Response
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```ts
 * const res = await fetchWithRetry('https://api.example.com/data', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify(payload),
 * }, { maxRetries: 2, backoffMs: 500 });
 * ```
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retryOpts?: RetryOptions,
): Promise<Response> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...retryOpts };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const response = await fetch(url, init);

      // Don't retry on success or non-retryable status codes
      if (!opts.retryableStatuses.includes(response.status)) {
        return response;
      }

      // Retryable status — fall through to retry logic
      lastError = new Error(
        `HTTP ${response.status} from ${url} (attempt ${attempt + 1}/${opts.maxRetries + 1})`
      );

      if (attempt >= opts.maxRetries) {
        return response;
      }
    } catch (error) {
      // Network errors (ECONNRESET, ETIMEDOUT, etc.)
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt >= opts.maxRetries) {
        throw lastError;
      }
    }

    // Exponential backoff with jitter
    const baseDelay = opts.backoffMs * Math.pow(opts.backoffMultiplier, attempt);
    const jitter = baseDelay * 0.2 * Math.random(); // ±20% jitter
    const delay = Math.min(baseDelay + jitter, 30_000); // Cap at 30s

    console.warn(
      `[fetchWithRetry] Attempt ${attempt + 1} failed for ${url}. ` +
      `Retrying in ${Math.round(delay)}ms... (${lastError?.message})`
    );

    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // Should not reach here, but TypeScript safety
  throw lastError ?? new Error(`fetchWithRetry exhausted for ${url}`);
}
