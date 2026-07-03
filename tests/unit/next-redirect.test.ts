/**
 * #23 - NEXT_REDIRECT detection: redirect-as-success must never be treated
 * as a failure by broad catches.
 */
import { expect, it } from '@jest/globals';

import { isNextRedirectError } from '@/lib/utils/next-redirect';

it('detects a digest-carrying redirect error', () => {
  const error = Object.assign(new Error('NEXT_REDIRECT'), {
    digest: 'NEXT_REDIRECT;push;/dashboard;307;',
  });
  expect(isNextRedirectError(error)).toBe(true);
});

it('detects the bare NEXT_REDIRECT message form', () => {
  expect(isNextRedirectError(new Error('NEXT_REDIRECT'))).toBe(true);
});

it('does not match ordinary errors or non-errors', () => {
  expect(isNextRedirectError(new Error('Invalid email or password'))).toBe(false);
  expect(isNextRedirectError({ digest: 42 })).toBe(false);
  expect(isNextRedirectError('NEXT_REDIRECT')).toBe(false);
  expect(isNextRedirectError(null)).toBe(false);
  expect(isNextRedirectError(undefined)).toBe(false);
});
