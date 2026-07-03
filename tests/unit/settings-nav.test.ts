/**
 * #36 - /settings index resolution and settings-nav integrity: every nav
 * destination exists in the matrix-derived route table, and every role that
 * can enter /settings lands on a sub-page it may open - no dead redirects,
 * for EVERY role, since the target depends on the role.
 */
import { describe, expect, it } from '@jest/globals';

import { UserRole } from '@/app/generated/prisma';
import {
  SETTINGS_NAV_ITEMS,
  firstAccessibleSettingsRoute,
} from '@/app/(dashboard)/settings/settings-nav';
import { ROUTE_PERMISSIONS, canAccessRoute } from '@/lib/permissions';

const ALL_ROLES = Object.values(UserRole);

describe('settings nav (#36)', () => {
  it('every nav destination exists in the route table (no dead nav links)', () => {
    for (const item of SETTINGS_NAV_ITEMS) {
      expect(ROUTE_PERMISSIONS[item.href]).toBeDefined();
      expect(ROUTE_PERMISSIONS[item.href]?.length).toBeGreaterThan(0);
    }
  });

  it('every role that can enter /settings resolves to a sub-page it can open', () => {
    for (const role of ALL_ROLES) {
      const target = firstAccessibleSettingsRoute(role);
      if (canAccessRoute(role, '/settings')) {
        expect(target).not.toBeNull();
        expect(canAccessRoute(role, target as string)).toBe(true);
      }
    }
  });

  it('resolves in sidebar order; roles with no accessible sub-page get null', () => {
    expect(firstAccessibleSettingsRoute(UserRole.SUPER_ADMIN)).toBe('/settings/company');
    expect(firstAccessibleSettingsRoute(UserRole.ADMIN)).toBe('/settings/company');
    expect(firstAccessibleSettingsRoute(UserRole.MANAGER)).toBe('/settings/company');
    // VIEWER cannot open any settings sub-page: the index falls back to
    // /dashboard (and the layout + proxy gate /settings itself).
    expect(firstAccessibleSettingsRoute(UserRole.VIEWER)).toBeNull();
  });
});
