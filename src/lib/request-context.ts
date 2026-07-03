/**
 * Request correlation (#21; #42 threads the same id through structured
 * logging and Sentry).
 *
 * src/proxy.ts mints (or validates) an x-request-id for EVERY request -
 * including public auth routes - and forwards it on the request headers.
 * This helper surfaces it to server actions and audit writes.
 */

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * The current request's correlation id, or undefined outside a request
 * scope (unit tests, scripts, background work). The dynamic import keeps
 * this module - and everything importing it - loadable outside Next.js.
 */
export async function getRequestId(): Promise<string | undefined> {
  try {
    const { headers } = await import('next/headers');
    const headersList = await headers();
    return headersList.get(REQUEST_ID_HEADER) ?? undefined;
  } catch {
    return undefined;
  }
}
