/**
 * #17 - single RBAC source of truth.
 *
 * permissions.ts is the only permission engine: these tests pin the full
 * role x resource x action matrix, the SUPER_ADMIN override, and the
 * matrix-derived route table (no route/matrix drift, no dead redirects).
 */
import { describe, expect, it } from '@jest/globals';

import { UserRole } from '@/app/generated/prisma';
import {
  ACTIONS,
  PERMISSION_MATRIX,
  RESOURCES,
  ROUTE_PERMISSIONS,
  canAccessRoute,
  hasPermission,
} from '@/lib/permissions';

const ALL_ROLES = Object.values(UserRole);

describe('hasPermission', () => {
  it('agrees with PERMISSION_MATRIX for every role x resource x action', () => {
    for (const resource of Object.values(RESOURCES)) {
      for (const action of Object.values(ACTIONS)) {
        const allowed = PERMISSION_MATRIX[resource][action];
        for (const role of ALL_ROLES) {
          const expected = role === UserRole.SUPER_ADMIN || Boolean(allowed?.includes(role));
          expect(hasPermission(role, resource, action)).toBe(expected);
        }
      }
    }
  });

  it('grants SUPER_ADMIN everything, even undeclared actions', () => {
    expect(hasPermission(UserRole.SUPER_ADMIN, RESOURCES.AUDIT_LOGS, ACTIONS.MANAGE)).toBe(true);
  });

  it('does not reproduce the deleted auth-helpers divergences', () => {
    // The dead engine granted MANAGER 'services:*'; the matrix reserves
    // completed-record mutations for admins.
    expect(hasPermission(UserRole.MANAGER, RESOURCES.SERVICES, ACTIONS.EDIT_COMPLETED)).toBe(
      false
    );
    expect(hasPermission(UserRole.MANAGER, RESOURCES.SERVICES, ACTIONS.DELETE_COMPLETED)).toBe(
      false
    );
    // ACCOUNTANT reaches the post-login landing page (matrix reconciled with
    // the old route table).
    expect(hasPermission(UserRole.ACCOUNTANT, RESOURCES.DASHBOARD, ACTIONS.VIEW)).toBe(true);
  });

  it('denies when the role is missing', () => {
    expect(hasPermission(undefined, RESOURCES.SERVICES, ACTIONS.VIEW)).toBe(false);
  });
});

describe('canAccessRoute', () => {
  it('lets MANAGER open /settings/company (dead-redirect regression, #17)', () => {
    // Previously companies:view passed but ROUTE_PERMISSIONS bounced MANAGER
    // to the nonexistent /settings/profile.
    expect(canAccessRoute(UserRole.MANAGER, '/settings/company')).toBe(true);
  });

  it('keeps admin-only settings routes closed to MANAGER', () => {
    expect(canAccessRoute(UserRole.MANAGER, '/settings/users')).toBe(false);
    expect(canAccessRoute(UserRole.MANAGER, '/settings/system')).toBe(false);
    expect(canAccessRoute(UserRole.ADMIN, '/settings/system')).toBe(true);
  });

  it('matches the longest route prefix, not object insertion order', () => {
    // '/settings' admits MANAGER; '/settings/users' must still win for
    // nested paths.
    expect(canAccessRoute(UserRole.MANAGER, '/settings/users/123')).toBe(false);
    expect(canAccessRoute(UserRole.ADMIN, '/settings/users/123')).toBe(true);
  });

  it('stops at path boundaries', () => {
    expect(canAccessRoute(UserRole.ADMIN, '/settingsX')).toBe(false);
  });

  it('denies unknown routes and missing roles', () => {
    expect(canAccessRoute(UserRole.ADMIN, '/does-not-exist')).toBe(false);
    expect(canAccessRoute(undefined, '/dashboard')).toBe(false);
  });

  it('covers every settings nav destination (no dead nav links, #17)', () => {
    // The settings sidebar (settings/layout.tsx) derives visibility via
    // canAccessRoute; every href it renders must exist in the route table.
    for (const href of ['/settings/company', '/settings/users', '/settings/system']) {
      expect(ROUTE_PERMISSIONS[href]).toBeDefined();
      expect(ROUTE_PERMISSIONS[href]?.length).toBeGreaterThan(0);
    }
  });

  it('gates the documents/loading-orders routes from the matrix (#32)', () => {
    expect(ROUTE_PERMISSIONS['/documents/loading-orders']).toEqual(
      PERMISSION_MATRIX[RESOURCES.LOADING_ORDERS][ACTIONS.VIEW]
    );
    expect(ROUTE_PERMISSIONS['/documents/loading-orders/new']).toEqual(
      PERMISSION_MATRIX[RESOURCES.LOADING_ORDERS][ACTIONS.CREATE]
    );
    // VIEWER may read the list and details but never reach the create page.
    expect(canAccessRoute(UserRole.VIEWER, '/documents/loading-orders')).toBe(true);
    expect(canAccessRoute(UserRole.VIEWER, '/documents/loading-orders/abc123')).toBe(true);
    expect(canAccessRoute(UserRole.VIEWER, '/documents/loading-orders/new')).toBe(false);
    expect(canAccessRoute(UserRole.OPERATOR, '/documents/loading-orders/new')).toBe(true);
    // ACCOUNTANT holds neither documents:view nor loading_orders:view.
    expect(canAccessRoute(UserRole.ACCOUNTANT, '/documents')).toBe(false);
    expect(canAccessRoute(UserRole.ACCOUNTANT, '/documents/loading-orders')).toBe(false);
  });

  it('derives ROUTE_PERMISSIONS from the matrix (drift is impossible)', () => {
    expect(ROUTE_PERMISSIONS['/dashboard']).toEqual(
      PERMISSION_MATRIX[RESOURCES.DASHBOARD][ACTIONS.VIEW]
    );
    expect(ROUTE_PERMISSIONS['/settings/company']).toEqual(
      PERMISSION_MATRIX[RESOURCES.COMPANIES][ACTIONS.VIEW]
    );
    expect(ROUTE_PERMISSIONS['/settings/system']).toEqual(
      PERMISSION_MATRIX[RESOURCES.SETTINGS][ACTIONS.MANAGE]
    );
  });
});
