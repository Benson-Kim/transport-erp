import { UserRole } from '@/app/generated/prisma';

import { requireServiceAccess } from './rbac';

// Mock the auth + prisma dependencies of rbac.ts
const mockGetServerAuth = jest.fn();
jest.mock('@/lib/auth', () => ({
  getServerAuth: () => mockGetServerAuth(),
}));

const mockServiceFindUnique = jest.fn();
jest.mock('@/lib/prisma/prisma', () => ({
  __esModule: true,
  default: {
    service: {
      findUnique: (...args: unknown[]) => mockServiceFindUnique(...args),
    },
  },
}));

function session(role: UserRole, id: string) {
  return { user: { id, role } };
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

  it('blocks OPERATOR A from accessing OPERATOR B\'s service (IDOR)', async () => {
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
});
