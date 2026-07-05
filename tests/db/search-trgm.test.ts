/**
 * #46: the pg_trgm extension and the five search GIN indexes must exist
 * after migrate deploy. Plan-shape proof on a >=10k seed lives in the #48
 * EXPLAIN validation suite (tests/db/query-plans.test.ts).
 */

import { prisma } from './helpers';

afterAll(async () => {
  await prisma.$disconnect();
});

describe('search trgm indexes (#46)', () => {
  it('has the pg_trgm extension installed', async () => {
    const rows = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'
    `;
    expect(rows).toHaveLength(1);
  });

  it.each([
    ['services', 'services_serviceNumber_trgm_idx'],
    ['services', 'services_driverName_trgm_idx'],
    ['services', 'services_vehiclePlate_trgm_idx'],
    ['clients', 'clients_name_trgm_idx'],
    ['suppliers', 'suppliers_name_trgm_idx'],
  ])('has GIN index %s.%s', async (table, indexName) => {
    const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = ${table} AND indexname = ${indexName}
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.indexdef).toContain('USING gin');
    expect(rows[0]?.indexdef).toContain('gin_trgm_ops');
  });
});
