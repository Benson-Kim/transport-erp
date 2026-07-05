/**
 * #48/#50: EXPLAIN validation of the real query patterns on a >=10k seed.
 *
 * Self-renewing evidence (the !29 pattern): plans print to the job trace,
 * so a green test-db job IS the current proof - it cannot rot like a
 * pasted plan in an MR comment.
 *
 * Seed shape: 10,000 services across 20 clients, 12 months (year 1999 so
 * report-window suites never see them), 4 statuses, 50 driver names plus
 * one unique needle for the trgm search probe. Deleted in afterAll.
 */

import { ServiceStatus } from '@/app/generated/prisma';

import { createSupplierFixture, createUserFixture, prisma, uid } from './helpers';

jest.setTimeout(120_000);

const RUN = uid();
const SEED_PREFIX = `PLAN-${RUN}-`;
const NEEDLE = `Zephyrine-${RUN}`;
const TOTAL = 10_000;
const CLIENTS = 20;
const STATUSES = [
  ServiceStatus.COMPLETED,
  ServiceStatus.IN_PROGRESS,
  ServiceStatus.CONFIRMED,
  ServiceStatus.INVOICED,
] as const;

let clientIds: string[] = [];

async function explain(sql: string): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(`EXPLAIN ${sql}`);
  const plan = rows.map((row) => row['QUERY PLAN']).join('\n');
  // Self-renewing evidence: the plan is part of the job trace.
  console.log(`\n--- EXPLAIN ${sql}\n${plan}\n`);
  return plan;
}

beforeAll(async () => {
  const [user, supplier] = await Promise.all([createUserFixture(), createSupplierFixture()]);

  const clients = [];
  for (let i = 0; i < CLIENTS; i++) {
    clients.push(
      // eslint-disable-next-line no-await-in-loop -- serial seeding keeps unique codes simple
      await prisma.client.create({
        data: {
          clientCode: `CLI-${RUN}-${i}`,
          name: `Plan Client ${RUN} ${i}`,
          billingAddress: { line1: '1 Test St', city: 'Madrid', postalCode: '28001', country: 'ES' },
          billingEmail: `plan-${RUN}-${i}@example.test`,
        },
      })
    );
  }
  clientIds = clients.map((client) => client.id);

  const rows = [];
  for (let i = 0; i < TOTAL; i++) {
    rows.push({
      serviceNumber: `${SEED_PREFIX}${i}`,
      // Year 1999: outside every report-window fixture.
      date: new Date(Date.UTC(1999, i % 12, 1 + (i % 27), 12, 0, 0)),
      clientId: clientIds[i % CLIENTS] as string,
      supplierId: supplier.id,
      createdById: user.id,
      description: 'Plan validation seed',
      origin: 'Madrid',
      destination: 'Barcelona',
      driverName: i === 4242 ? NEEDLE : `Driver ${i % 50}`,
      vehiclePlate: `PL-${i % 500}`,
      status: STATUSES[i % STATUSES.length] as ServiceStatus,
      costAmount: '100.00',
      saleAmount: '150.00',
      margin: '50.00',
      marginPercentage: '33.33',
      costVatAmount: '21.00',
      saleVatAmount: '31.50',
    });
  }

  for (let offset = 0; offset < TOTAL; offset += 2_000) {
    // eslint-disable-next-line no-await-in-loop -- batched createMany
    await prisma.service.createMany({ data: rows.slice(offset, offset + 2_000) });
  }

  // Fresh statistics so the planner sees the real row counts.
  await prisma.$executeRawUnsafe('ANALYZE "services"');
  await prisma.$executeRawUnsafe('ANALYZE "clients"');
});

afterAll(async () => {
  await prisma.service.deleteMany({ where: { serviceNumber: { startsWith: SEED_PREFIX } } });
  await prisma.client.deleteMany({ where: { clientCode: { startsWith: `CLI-${RUN}-` } } });
  await prisma.$disconnect();
});

describe('query plans on a 10k seed (#48)', () => {
  it('status+date window uses the #13 composite index (no Seq Scan on services)', async () => {
    const plan = await explain(
      `SELECT "id" FROM "services" WHERE "deletedAt" IS NULL AND "status" = 'COMPLETED'::"ServiceStatus" AND "date" >= '1999-03-01' AND "date" < '1999-04-01'`
    );
    expect(plan).not.toMatch(/Seq Scan on services/);
  });

  it('clientId+date window uses the #13 composite index (no Seq Scan on services)', async () => {
    const plan = await explain(
      `SELECT "id" FROM "services" WHERE "deletedAt" IS NULL AND "clientId" = '${clientIds[0]}' AND "date" >= '1999-03-01' AND "date" < '1999-05-01'`
    );
    expect(plan).not.toMatch(/Seq Scan on services/);
  });

  it('driverName contains-search is trgm-index-backed (#46, no Seq Scan on services)', async () => {
    const plan = await explain(
      `SELECT "id" FROM "services" WHERE "driverName" ILIKE '%${NEEDLE}%'`
    );
    expect(plan).not.toMatch(/Seq Scan on services/);
    expect(plan).toMatch(/services_driverName_trgm_idx/);
  });
});

describe('client country filter (#50)', () => {
  it('billingCountry equality can be served by clients_billingCountry_idx', async () => {
    // The fixture clients table is tiny, so the planner rightly prefers a
    // seq scan organically - asserting planner CHOICE here would be flaky
    // theatre. enable_seqscan=off (LOCAL, this tx only) proves the #14
    // generated column's index is present and USABLE for the filter
    // getClients wires to it.
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      const rows = await tx.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
        `EXPLAIN SELECT "id" FROM "clients" WHERE "billingCountry" = 'ES' AND "deletedAt" IS NULL`
      );
      return rows.map((row) => row['QUERY PLAN']).join('\n');
    });
    console.log(`\n--- EXPLAIN (enable_seqscan=off) billingCountry filter\n${plan}\n`);
    expect(plan).toMatch(/clients_billingCountry_idx/);
  });
});
