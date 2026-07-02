/**
 * #10 - Reconciled enum values exist in the database.
 */

import { afterAll, beforeAll, expect, it } from '@jest/globals';

import { AuditAction, ServiceStatus } from '@/app/generated/prisma';

import {
  prisma,
  uid,
  createUserFixture,
  createClientFixture,
  createSupplierFixture,
  baseServiceData,
} from './helpers';

let userId: string;
let clientId: string;
let supplierId: string;

beforeAll(async () => {
  const [user, client, supplier] = await Promise.all([
    createUserFixture(),
    createClientFixture(),
    createSupplierFixture(),
  ]);
  userId = user.id;
  clientId = client.id;
  supplierId = supplier.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

it('accepts ServiceStatus.ARCHIVED and services.archivedAt (#10)', async () => {
  const created = await prisma.service.create({
    data: {
      ...baseServiceData({
        serviceNumber: `SRV-TEST-${uid()}`,
        clientId,
        supplierId,
        createdById: userId,
      }),
      status: ServiceStatus.ARCHIVED,
      archivedAt: new Date(),
    },
  });

  expect(created.status).toBe(ServiceStatus.ARCHIVED);
  expect(created.archivedAt).toBeInstanceOf(Date);
});

it('accepts the previously-missing AuditAction values (#10)', async () => {
  const actions: AuditAction[] = [
    AuditAction.COMPLETE,
    AuditAction.CANCEL,
    AuditAction.SEND_EMAIL,
    AuditAction.GENERATE_DOCUMENT,
    AuditAction.ARCHIVE,
    AuditAction.PERMISSION_CHECK,
  ];

  for (const action of actions) {
    // eslint-disable-next-line no-await-in-loop -- sequential inserts probe each enum value
    const log = await prisma.auditLog.create({
      data: {
        userId,
        action,
        tableName: 'services',
        recordId: uid(),
      },
    });
    expect(log.action).toBe(action);
  }
});
