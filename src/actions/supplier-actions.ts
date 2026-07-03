/* eslint-disable max-lines */
// /actions/supplier-actions.ts
'use server';

/**
 * Supplier Server Actions (#29)
 * CRUD for the cost side of the brokerage, built to the Clients reference
 * bar plus the Phase 1-3 upgrades: numbering inside the create transaction
 * (#12/#27), tx-joined audit rows, SQL-side stats aggregation.
 */

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { Prisma, ServiceStatus } from '@/app/generated/prisma';
import { getServerAuth } from '@/lib/auth';
import { RESOURCES, ACTIONS } from '@/lib/permissions';
import { decimalToNumber } from '@/lib/pricing';
import {
  createAuditLog,
  excludeDeleted,
  getPaginationParams,
  createPaginatedResponse,
  withTransaction,
} from '@/lib/prisma/db-helpers';
import { generateDocumentNumber } from '@/lib/prisma/numbering';
import prisma from '@/lib/prisma/prisma';
import { requirePermission } from '@/lib/rbac';
import { supplierSchema, supplierFilterSchema } from '@/lib/validations/supplier-schema';
import type {
  ActionResult,
  PaginatedSuppliers,
  SupplierListItem,
  SupplierService,
  SupplierStats,
  SupplierWithStats,
} from '@/types/supplier';

async function getRequestMeta() {
  const headersList = await headers();
  return {
    ipAddress: headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? undefined,
    userAgent: headersList.get('user-agent') ?? undefined,
  };
}

/**
 * Get paginated list of suppliers with filters
 */
export async function getSuppliers(
  params: Record<string, unknown>
): Promise<ActionResult<PaginatedSuppliers>> {
  try {
    await requirePermission(RESOURCES.SUPPLIERS, ACTIONS.VIEW);

    const validated = supplierFilterSchema.parse(params);
    const { search, country, isActive, currency, tags, page, limit, sortBy, sortOrder } = validated;

    const where: Prisma.SupplierWhereInput = excludeDeleted<'supplier'>({});

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { tradeName: { contains: search, mode: 'insensitive' } },
        { vatNumber: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { supplierCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (country) {
      where.country = country;
    }
    if (isActive !== undefined) {
      where.isActive = isActive;
    }
    if (currency) {
      where.currency = currency;
    }
    if (tags && tags.length > 0) {
      where.tags = { hasSome: tags };
    }

    let orderBy: Prisma.SupplierOrderByWithRelationInput = {};
    if (sortBy === 'servicesCount') {
      orderBy = { services: { _count: sortOrder } };
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    const { skip, take } = getPaginationParams({ page, limit });

    const [total, suppliers] = await Promise.all([
      prisma.supplier.count({ where }),
      prisma.supplier.findMany({
        where,
        orderBy,
        skip,
        take,
        include: {
          _count: { select: { services: true } },
        },
      }),
    ]);

    const data: SupplierListItem[] = suppliers.map((supplier) => ({
      id: supplier.id,
      supplierCode: supplier.supplierCode,
      name: supplier.name,
      tradeName: supplier.tradeName,
      vatNumber: supplier.vatNumber,
      email: supplier.email,
      phone: supplier.phone,
      city: supplier.city,
      country: supplier.country,
      isActive: supplier.isActive,
      currency: supplier.currency,
      servicesCount: supplier._count.services,
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt,
    }));

    return {
      success: true,
      data: createPaginatedResponse(data, total, { page, limit }),
    };
  } catch (error) {
    console.error('Failed to get suppliers:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch suppliers',
    };
  }
}

/**
 * Supplier statistics, aggregated IN the database (#33 direction): status
 * counts via groupBy, cost sum via aggregate - no row streaming into JS.
 */
async function calculateSupplierStats(supplierId: string): Promise<SupplierStats> {
  const serviceWhere: Prisma.ServiceWhereInput = { supplierId, deletedAt: null };

  // No annotation on the groupBy assignment: an annotated target becomes a
  // contextual inference source for Prisma's conditional groupBy return type
  // and collapses the payload to {}[] (phase0-gate TS2322). Inferred type:
  // Array<{ status: ServiceStatus; _count: { _all: number } }>.
  const statusCounts = await prisma.service.groupBy({
    by: ['status'],
    where: serviceWhere,
    _count: { _all: true },
  });

  const [costSum, lastService] = await Promise.all([
    prisma.service.aggregate({
      where: serviceWhere,
      _sum: { costAmount: true },
    }),
    prisma.service.findFirst({
      where: serviceWhere,
      orderBy: { date: 'desc' },
      select: { date: true },
    }),
  ]);

  const countFor = (statuses: ServiceStatus[]): number =>
    statusCounts
      .filter((row) => statuses.includes(row.status))
      .reduce((sum, row) => sum + row._count._all, 0);

  const totalServices = statusCounts.reduce((sum, row) => sum + row._count._all, 0);

  return {
    totalServices,
    activeServices: countFor([
      ServiceStatus.DRAFT,
      ServiceStatus.CONFIRMED,
      ServiceStatus.IN_PROGRESS,
    ]),
    completedServices: countFor([ServiceStatus.COMPLETED, ServiceStatus.INVOICED]),
    cancelledServices: countFor([ServiceStatus.CANCELLED]),
    totalCost: costSum._sum.costAmount ? decimalToNumber(costSum._sum.costAmount) : 0,
    lastServiceDate: lastService?.date ?? null,
  };
}

/**
 * Get single supplier by ID with full details and stats
 */
export async function getSupplierById(id: string): Promise<ActionResult<SupplierWithStats>> {
  try {
    await requirePermission(RESOURCES.SUPPLIERS, ACTIONS.VIEW);

    const supplier = await prisma.supplier.findFirst({
      where: excludeDeleted<'supplier'>({ id }),
      include: {
        company: { select: { id: true, legalName: true } },
        _count: { select: { services: true, invoices: true, documents: true } },
      },
    });

    if (!supplier) {
      return { success: false, error: 'Supplier not found' };
    }

    const stats = await calculateSupplierStats(id);

    return { success: true, data: { ...supplier, stats } };
  } catch (error) {
    console.error('Failed to get supplier:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch supplier',
    };
  }
}

/**
 * Get supplier services for the detail view
 */
export async function getSupplierServices(
  supplierId: string,
  params: { page?: number; limit?: number }
): Promise<ActionResult<{ data: SupplierService[]; total: number }>> {
  try {
    await requirePermission(RESOURCES.SUPPLIERS, ACTIONS.VIEW);

    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const { skip, take } = getPaginationParams({ page, limit });

    const where: Prisma.ServiceWhereInput = { supplierId, deletedAt: null };

    const [services, total] = await Promise.all([
      prisma.service.findMany({
        where,
        orderBy: { date: 'desc' },
        skip,
        take,
        include: {
          client: { select: { id: true, name: true } },
        },
      }),
      prisma.service.count({ where }),
    ]);

    const data: SupplierService[] = services.map((service) => ({
      id: service.id,
      serviceNumber: service.serviceNumber,
      date: service.date,
      description: service.description,
      origin: service.origin,
      destination: service.destination,
      client: service.client,
      costAmount: decimalToNumber(service.costAmount),
      status: service.status,
    }));

    return { success: true, data: { data, total } };
  } catch (error) {
    console.error('Failed to get supplier services:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch services',
    };
  }
}

/**
 * Create a new supplier.
 *
 * supplierCode is allocated by generateDocumentNumber(tx, 'SUP') INSIDE the
 * create transaction (numbering #12): allocation, insert and audit row
 * commit - or roll back - together. No burned codes on failed inserts, no
 * mutation without an audit trail (#27).
 */
export async function createSupplier(data: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission(RESOURCES.SUPPLIERS, ACTIONS.CREATE);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const validated = supplierSchema.parse(data);
    const { ipAddress, userAgent } = await getRequestMeta();

    // Duplicate VAT among live rows only (soft-deleted rows may share)
    if (validated.vatNumber) {
      const existing = await prisma.supplier.findFirst({
        where: { vatNumber: validated.vatNumber, deletedAt: null },
      });
      if (existing) {
        return {
          success: false,
          error: 'A supplier with this VAT number already exists',
          errors: { vatNumber: ['VAT number already in use'] },
        };
      }
    }

    const userId = session.user.id;

    const supplier = await withTransaction(async (tx) => {
      const supplierCode = await generateDocumentNumber(tx, 'SUP');

      const createData: Prisma.SupplierCreateInput = {
        supplierCode,
        name: validated.name,
        tradeName: validated.tradeName ?? null,
        vatNumber: validated.vatNumber ?? null,
        addressLine1: validated.addressLine1,
        addressLine2: validated.addressLine2 ?? null,
        city: validated.city,
        state: validated.state ?? null,
        postalCode: validated.postalCode,
        country: validated.country,
        email: validated.email,
        phone: validated.phone ?? null,
        fax: validated.fax ?? null,
        contactPerson: validated.contactPerson ?? null,
        contactMobile: validated.contactMobile ?? null,
        irpfRate: validated.irpfRate ?? null,
        vatRate: validated.vatRate,
        paymentTerms: validated.paymentTerms,
        paymentMethod: validated.paymentMethod ?? null,
        bankName: validated.bankName ?? null,
        bankAccount: validated.bankAccount ?? null,
        swiftCode: validated.swiftCode ?? null,
        iban: validated.iban ?? null,
        currency: validated.currency,
        autoApprove: validated.autoApprove,
        requirePO: validated.requirePO,
        notes: validated.notes ?? null,
        tags: validated.tags,
        isActive: validated.isActive,
      };

      const created = await tx.supplier.create({ data: createData });

      await createAuditLog(
        {
          userId,
          action: 'CREATE',
          tableName: 'suppliers',
          recordId: created.id,
          newValues: createData,
          ipAddress,
          userAgent,
        },
        tx
      );

      return created;
    });

    revalidatePath('/suppliers');

    return { success: true, data: { id: supplier.id } };
  } catch (error) {
    console.error('Failed to create supplier:', error);

    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return { success: false, error: 'A supplier with this information already exists' };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create supplier',
    };
  }
}

/**
 * Update an existing supplier
 */
export async function updateSupplier(
  id: string,
  data: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission(RESOURCES.SUPPLIERS, ACTIONS.EDIT);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const existing = await prisma.supplier.findFirst({
      where: excludeDeleted<'supplier'>({ id }),
    });
    if (!existing) {
      return { success: false, error: 'Supplier not found' };
    }

    const validated = supplierSchema.parse(data);
    const { ipAddress, userAgent } = await getRequestMeta();

    if (validated.vatNumber && validated.vatNumber !== existing.vatNumber) {
      const duplicate = await prisma.supplier.findFirst({
        where: { vatNumber: validated.vatNumber, deletedAt: null, NOT: { id } },
      });
      if (duplicate) {
        return {
          success: false,
          error: 'A supplier with this VAT number already exists',
          errors: { vatNumber: ['VAT number already in use'] },
        };
      }
    }

    const updateData: Prisma.SupplierUpdateInput = {
      name: validated.name,
      tradeName: validated.tradeName ?? null,
      vatNumber: validated.vatNumber ?? null,
      addressLine1: validated.addressLine1,
      addressLine2: validated.addressLine2 ?? null,
      city: validated.city,
      state: validated.state ?? null,
      postalCode: validated.postalCode,
      country: validated.country,
      email: validated.email,
      phone: validated.phone ?? null,
      fax: validated.fax ?? null,
      contactPerson: validated.contactPerson ?? null,
      contactMobile: validated.contactMobile ?? null,
      irpfRate: validated.irpfRate ?? null,
      vatRate: validated.vatRate,
      paymentTerms: validated.paymentTerms,
      paymentMethod: validated.paymentMethod ?? null,
      bankName: validated.bankName ?? null,
      bankAccount: validated.bankAccount ?? null,
      swiftCode: validated.swiftCode ?? null,
      iban: validated.iban ?? null,
      currency: validated.currency,
      autoApprove: validated.autoApprove,
      requirePO: validated.requirePO,
      notes: validated.notes ?? null,
      tags: validated.tags,
      isActive: validated.isActive,
    };

    const userId = session.user.id;

    await withTransaction(async (tx) => {
      await tx.supplier.update({ where: { id }, data: updateData });
      await createAuditLog(
        {
          userId,
          action: 'UPDATE',
          tableName: 'suppliers',
          recordId: id,
          oldValues: existing,
          newValues: updateData,
          ipAddress,
          userAgent,
        },
        tx
      );
    });

    revalidatePath('/suppliers');
    revalidatePath(`/suppliers/${id}`);

    return { success: true, data: { id } };
  } catch (error) {
    console.error('Failed to update supplier:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update supplier',
    };
  }
}

/**
 * Soft delete a supplier. Refused while live services reference it - the
 * cost side of booked business must never lose its party.
 */
export async function deleteSupplier(id: string): Promise<ActionResult> {
  try {
    await requirePermission(RESOURCES.SUPPLIERS, ACTIONS.DELETE);

    const session = await getServerAuth();
    if (!session?.user) {
      return { success: false, error: 'Not authenticated' };
    }

    const existing = await prisma.supplier.findFirst({
      where: excludeDeleted<'supplier'>({ id }),
      include: { _count: { select: { services: true, invoices: true } } },
    });
    if (!existing) {
      return { success: false, error: 'Supplier not found' };
    }

    const liveServices = await prisma.service.count({
      where: { supplierId: id, deletedAt: null, status: { notIn: [ServiceStatus.CANCELLED] } },
    });
    if (liveServices > 0) {
      return {
        success: false,
        error: `Cannot delete: supplier has ${liveServices} active service(s). Deactivate the supplier instead.`,
      };
    }

    const { ipAddress, userAgent } = await getRequestMeta();
    const userId = session.user.id;

    await withTransaction(async (tx) => {
      await tx.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
      await createAuditLog(
        {
          userId,
          action: 'DELETE',
          tableName: 'suppliers',
          recordId: id,
          oldValues: existing,
          ipAddress,
          userAgent,
          metadata: { servicesCount: existing._count.services },
        },
        tx
      );
    });

    revalidatePath('/suppliers');

    return { success: true };
  } catch (error) {
    console.error('Failed to delete supplier:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete supplier',
    };
  }
}

/**
 * Export suppliers to CSV
 */
export async function exportSuppliers(
  params: Record<string, unknown>
): Promise<ActionResult<{ csv: string; filename: string }>> {
  try {
    await requirePermission(RESOURCES.SUPPLIERS, ACTIONS.EXPORT);

    const validated = supplierFilterSchema.parse({ ...params, limit: 100 });
    const { search, country, isActive, currency } = validated;

    const where: Prisma.SupplierWhereInput = excludeDeleted<'supplier'>({});
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { tradeName: { contains: search, mode: 'insensitive' } },
        { vatNumber: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (country) where.country = country;
    if (isActive !== undefined) where.isActive = isActive;
    if (currency) where.currency = currency;

    const suppliers = await prisma.supplier.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { _count: { select: { services: true } } },
    });

    const csvEscape = (value: string) => `"${value.replace(/"/g, '""')}"`;

    const headerRow = [
      'Supplier Code',
      'Name',
      'Trade Name',
      'VAT Number',
      'Email',
      'Phone',
      'City',
      'Country',
      'Currency',
      'IRPF %',
      'VAT %',
      'Payment Terms',
      'Active',
      'Services Count',
      'Created At',
    ];

    const rows = suppliers.map((supplier) =>
      [
        supplier.supplierCode,
        csvEscape(supplier.name),
        supplier.tradeName ? csvEscape(supplier.tradeName) : '',
        supplier.vatNumber ?? '',
        supplier.email,
        supplier.phone ?? '',
        csvEscape(supplier.city),
        supplier.country,
        supplier.currency,
        supplier.irpfRate?.toString() ?? '',
        supplier.vatRate.toString(),
        supplier.paymentTerms.toString(),
        supplier.isActive ? 'Yes' : 'No',
        supplier._count.services.toString(),
        supplier.createdAt.toISOString().split('T')[0] ?? '',
      ].join(',')
    );

    const csv = [headerRow.join(','), ...rows].join('\n');
    const filename = `suppliers_export_${new Date().toISOString().split('T')[0]}.csv`;

    return { success: true, data: { csv, filename } };
  } catch (error) {
    console.error('Failed to export suppliers:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export suppliers',
    };
  }
}
