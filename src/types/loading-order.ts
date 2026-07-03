import type { ServiceStatus } from '@/app/generated/prisma';

/** List row for the loading-orders table. */
export interface LoadingOrderListItem {
  id: string;
  orderNumber: string;
  generatedAt: Date;
  generatedByName: string;
  servicesCount: number;
  /** True only when a real stored PDF exists (#34); never claimed otherwise. */
  hasPdf: boolean;
}

/** Paginated list response (shape shared with the clients vertical). */
export interface PaginatedLoadingOrders {
  data: LoadingOrderListItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * A grouped service as shown on the order. Deliberately NO pricing fields:
 * the loading order is carrier-facing (#32).
 */
export interface LoadingOrderServiceItem {
  position: number;
  id: string;
  serviceNumber: string;
  date: Date;
  origin: string;
  destination: string;
  vehiclePlate: string | null;
  driverName: string | null;
  status: ServiceStatus;
  clientName: string;
  supplierName: string;
}

/** Detail payload. */
export interface LoadingOrderDetail {
  id: string;
  orderNumber: string;
  generatedAt: Date;
  generatedByName: string;
  notes: string | null;
  hasPdf: boolean;
  services: LoadingOrderServiceItem[];
}

/** Candidate row on the create page (selection review). */
export interface LoadingOrderCandidateService {
  id: string;
  serviceNumber: string;
  date: Date;
  origin: string;
  destination: string;
  status: ServiceStatus;
  clientName: string;
  supplierName: string;
}
