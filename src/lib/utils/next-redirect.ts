/**
 * NEXT_REDIRECT detection (#23).
 *
 * redirect() - and the NextAuth signIn flow built on it - signals SUCCESS by
 * throwing a control-flow error. Catching it broadly and rendering an error
 * toast makes the UI lie about a successful sign-in. One shared detector so
 * every consumer (client handlers like oauth-buttons, and server actions -
 * see getAuthErrorMessage's redirect-equals-success rule on the credentials
 * path) treats redirect-as-success identically.
 */
export function isNextRedirectError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { digest?: unknown; message?: unknown };
  if (typeof candidate.digest === 'string' && candidate.digest.startsWith('NEXT_REDIRECT')) {
    return true;
  }
  return candidate.message === 'NEXT_REDIRECT';
}
