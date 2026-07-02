/**
 * #16 - object-level ownership (IDOR) on services.
 *
 * requireServiceAccess must reject unauthenticated, revoked and
 * under-privileged callers, and scope OPERATOR to services they created or
 * are assigned to. ADMIN/MANAGER bypass ownership per the matrix.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { UserRole } from '@/app/generated/prisma';
import { requireServiceAccess } from '@/lib/rbac';

const mockGetServerAuth = jest.fn<() => Promise<unknown>>();
jest.mock('@/lib/auth', () => ({
  getServerAuth: () => mockGetServerAuth(),
}));

const mockServiceFindUnique = jest.fn<() => Promise<unknown>>();
jest.mock('@/lib/prisma/prisma', () => ({
  __esModule: true,
  default: {
    service: {
      findUnique: (..._args: unknown[]) => mockServiceFindUnique(),
    },
  },
}));

function session(role: UserRole, id: string) {
  return { user: { id, role, isActive: true } };
}

describe('requireServiceAccess', () => {
  beforeEach(() => {
    mockGetServerAuth.mockReset();
    mockServiceFindUnique.mockReset();
  });

  it('rejects unauthenticated callers', async () => {
    mockGetServerAuth.mockResolvedValue(null);
    await expect(requireServiceAccess('view', 'svc-1')).rejects.toThrow('Unauthorized');
  });

  it('rejects revoked sessions (isActive false from the jwt re-check, #15)', async () => {
    mockGetServerAuth.mockResolvedValue({
      user: { id: 'u1', role: UserRole.ADMIN, isActive: false },
    });
    await expect(requireServiceAccess('view', 'svc-1')).rejects.toThrow('Unauthorized');
  });

  it('rejects under-privileged roles (VIEWER cannot edit)', async () => {
    mockGetServerAuth.mockResolvedValue(session(UserRole.VIEWER, 'u1'));
    await expect(requireServiceAccess('edit', 'svc-1')).rejects.toThrow(
      'Insufficient permissions: services:edit required'
    );
  });

  it('lets an OPERATOR access a service they created', async () => {
    mockGetServerAuth.mockResolvedValue(session(UserRole.OPERATOR, 'owner'));
    mockServiceFindUnique.mockResolvedValue({ createdById: 'owner', assignedToId: null });
    await expect(requireServiceAccess('edit', 'svc-1')).resolves.toBeUndefined();
  });

  it('lets an OPERATOR access a service assigned to them', async () => {
    mockGetServerAuth.mockResolvedValue(session(UserRole.OPERATOR, 'assignee'));
    mockServiceFindUnique.mockResolvedValue({ createdById: 'someone', assignedToId: 'assignee' });
    await expect(requireServiceAccess('view', 'svc-1')).resolves.toBeUndefined();
  });

  it("blocks OPERATOR A from accessing OPERATOR B's service (IDOR)", async () => {
    mockGetServerAuth.mockResolvedValue(session(UserRole.OPERATOR, 'userA'));
    mockServiceFindUnique.mockResolvedValue({ createdById: 'userB', assignedToId: 'userB' });
    await expect(requireServiceAccess('edit', 'svc-1')).rejects.toThrow('Forbidden');
  });

  it('lets ADMIN bypass ownership', async () => {
    mockGetServerAuth.mockResolvedValue(session(UserRole.ADMIN, 'admin'));
    await expect(requireServiceAccess('edit', 'svc-1')).resolves.toBeUndefined();
    expect(mockServiceFindUnique).not.toHaveBeenCalled();
  });

  it('lets MANAGER bypass ownership', async () => {
    mockGetServerAuth.mockResolvedValue(session(UserRole.MANAGER, 'mgr'));
    await expect(requireServiceAccess('view', 'svc-1')).resolves.toBeUndefined();
    expect(mockServiceFindUnique).not.toHaveBeenCalled();
  });

  it('throws typed errors so pages can catch by instanceof (review finding 5)', async () => {
    mockGetServerAuth.mockResolvedValue(null);
    await expect(requireServiceAccess('view', 'svc-1')).rejects.toMatchObject({
      name: 'UnauthorizedError',
    });

    mockGetServerAuth.mockResolvedValue(session(UserRole.OPERATOR, 'userA'));
    mockServiceFindUnique.mockResolvedValue({ createdById: 'userB', assignedToId: null });
    await expect(requireServiceAccess('edit', 'svc-1')).rejects.toMatchObject({
      name: 'ForbiddenError',
    });
  });
});
