/**
 * Internal-path guard for returnTo-style navigation params (#64).
 *
 * A returnTo value read from the URL is user-controlled input; navigating to
 * it unvalidated is an open redirect ('https://evil.example',
 * '//evil.example', backslash or control-character trickery). This is the
 * ONE guard for such params: it accepts only same-origin app paths and
 * returns null otherwise, so callers fall back to their default navigation.
 */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value) return null;
  // Must be an absolute app path; anything else is relative or carries a scheme.
  if (!value.startsWith('/')) return null;
  // '//host' is protocol-relative -> foreign origin.
  if (value.startsWith('//')) return null;
  // Some user agents normalise '\\' to '/' ('/\\evil.example' -> '//evil.example').
  if (value.includes('\\')) return null;
  // Control characters (ASCII C0 + DEL) have no place in an app path.
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return null;
  }
  return value;
}
