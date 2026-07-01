import { UserRole } from '@/app/generated/prisma';

import {
  ACTIONS,
  PERMISSION_MATRIX,
  RESOURCES,
  canAccessRoute,
  getRolePermissions,
  hasPermission,
  type Action,
  type Resource,
} from './permissions';

const ALL_ROLES: UserRole[] = [
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.OPERATOR,
  UserRole.VIEWER,
];

describe('hasPermission', () => {
  it('rejects an undefined role', () => {
    expect(hasPermission(undefined, RESOURCES.CLIENTS, ACTIONS.VIEW)).toBe(false);
  });

  it('grants SUPER_ADMIN every resource/action in the matrix', () => {
    for (const [resource, actions] of Object.entries(PERMISSION_MATRIX)) {
      for (const action of Object.keys(actions)) {
        expect(
          hasPermission(UserRole.SUPER_ADMIN, resource as Resource, action as Action)
        ).toBe(true);
      }
    }
  });

  it('matches the matrix exactly for every role x resource x action', () => {
    for (const [resource, actions] of Object.entries(PERMISSION_MATRIX)) {
      for (const [action, allowedRoles] of Object.entries(actions)) {
        for (const role of ALL_ROLES) {
          const expected =
            role === UserRole.SUPER_ADMIN || (allowedRoles as UserRole[]).includes(role);
          expect(hasPermission(role, resource as Resource, action as Action)).toBe(expected);
        }
      }
    }
  });

  it('denies actions not present in the matrix', () => {
    // VIEWER has no create on clients
    expect(hasPermission(UserRole.VIEWER, RESOURCES.CLIENTS, ACTIONS.CREATE)).toBe(false);
    // OPERATOR cannot edit completed services
    expect(hasPermission(UserRole.OPERATOR, RESOURCES.SERVICES, ACTIONS.EDIT_COMPLETED)).toBe(
      false
    );
  });
});

describe('getRolePermissions', () => {
  it('returns only permissions the role is allowed in the matrix', () => {
    const permissions = getRolePermissions(UserRole.OPERATOR);
    expect(permissions).toContain('services:create');
    expect(permissions).not.toContain('services:edit_completed');
    expect(permissions).not.toContain('users:view');
  });
});

describe('canAccessRoute', () => {
  it('rejects an undefined role', () => {
    expect(canAccessRoute(undefined, '/settings/company')).toBe(false);
  });

  it('lets SUPER_ADMIN access everything', () => {
    expect(canAccessRoute(UserRole.SUPER_ADMIN, '/settings/users')).toBe(true);
  });

  it('MANAGER can access /settings/company (no dead redirect regression)', () => {
    // Regression for #17: MANAGER previously passed COMPANIES:VIEW but was
    // rejected by canAccessRoute and redirected to a dead /settings/profile.
    expect(hasPermission(UserRole.MANAGER, RESOURCES.COMPANIES, ACTIONS.VIEW)).toBe(true);
    expect(canAccessRoute(UserRole.MANAGER, '/settings/company')).toBe(true);
  });

  it('MANAGER cannot access admin-only settings routes', () => {
    expect(canAccessRoute(UserRole.MANAGER, '/settings/users')).toBe(false);
    expect(canAccessRoute(UserRole.MANAGER, '/settings/system')).toBe(false);
  });

  it('matches the most specific settings route first', () => {
    // /settings/users is admin-only even though /settings allows MANAGER.
    expect(canAccessRoute(UserRole.MANAGER, '/settings')).toBe(true);
    expect(canAccessRoute(UserRole.MANAGER, '/settings/users')).toBe(false);
  });
});
