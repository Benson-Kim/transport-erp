/**
 * #45: the shared pagination helper is the server-side cap for every list
 * endpoint (getServices, getClients, ...). A hostile or buggy caller
 * passing pageSize 1_000_000 must get take <= 100.
 */

jest.mock('@/lib/prisma/prisma', () => ({ __esModule: true, default: {} }));

import { getPaginationParams } from '@/lib/prisma/db-helpers';

describe('getPaginationParams (#45)', () => {
  it('caps take at 100 even for absurd pageSize values', () => {
    const { take, skip } = getPaginationParams({ page: 1, limit: 1_000_000 });
    expect(take).toBe(100);
    expect(skip).toBe(0);
  });

  it('defaults to 20 and floors invalid values at 1', () => {
    expect(getPaginationParams({}).take).toBe(20);
    expect(getPaginationParams({ limit: 0 }).take).toBe(1);
    expect(getPaginationParams({ limit: -5 }).take).toBe(1);
  });

  it('floors page at 1 (no negative offsets)', () => {
    const { skip } = getPaginationParams({ page: -3, limit: 50 });
    expect(skip).toBe(0);
  });

  it('computes skip from the CAPPED page size', () => {
    const { skip, take } = getPaginationParams({ page: 3, limit: 1_000 });
    expect(take).toBe(100);
    expect(skip).toBe(200);
  });
});
