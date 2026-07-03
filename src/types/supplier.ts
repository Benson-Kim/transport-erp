import type { Supplier } from '@/app/generated/prisma';
import type { ServiceStatus } from '@/app/generated/prisma';

// ActionResult is canonical in types/client (DRY - one definition per
// concern); re-exported here so supplier call sites import one module.
export type { ActionResult } from '@/types/client';

/** Supplier with related data */
export interface SupplierWithRelations extends Supplier {
  company?: {
    id: string;
    legalName: string;
  } | null;
  _count?: {
    services: number;
    invoices: number;
    documents: number;
  };
}

/** Computed statistics for a supplier (SQL-side aggregation) */
export interface SupplierStats {
  totalServices: number;
  activeServices: number;
  completedServices: number;
  cancelledServices: number;
  totalCost: number;
  lastServiceDate: Date | null;
}

export interface SupplierWithStats extends SupplierWithRelations {
  stats: SupplierStats;
}

/** Supplier list item for table display */
export interface SupplierListItem {
  id: string;
  supplierCode: string;
  name: string;
  tradeName: string | null;
  vatNumber: string | null;
  email: string;
  phone: string | null;
  city: string;
  country: string;
  isActive: boolean;
  currency: string;
  servicesCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Paginated supplier response */
export interface PaginatedSuppliers {
  data: SupplierListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/** Supplier service row for the detail view */
export interface SupplierService {
  id: string;
  serviceNumber: string;
  date: Date;
  description: string;
  origin: string;
  destination: string;
  client: {
    id: string;
    name: string;
  };
  costAmount: number;
  status: ServiceStatus;
}
